import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { resolveTxt } from 'node:dns/promises'
import { Queue } from 'bullmq'
import { Hono } from 'hono'
import type { Context } from 'hono'
import { and, desc, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import {
  artifactBackups,
  basemapArtifacts,
  basemapBuildLogs,
  basemapBuilds,
  basemapReleases,
  customDomains,
  db,
  notificationChannels,
  platformConfig,
  previewLinks,
  processingJobLogs,
  processingJobs,
  rootAgentNodeTokens,
  rootAgentRegistrationTokens,
  runtimeInstallations,
  routingGraphArtifacts,
  routingGraphBuildLogs,
  routingGraphBuilds,
  routingGraphReleases,
  scheduledOperations,
  storageObjects,
  workerNodes,
  workflowTemplates,
} from '@planisfy/database'
import {
  isQueueStateActive,
  reconcileStaleProcessingJobs,
  STALE_JOB_RECONCILED_CODE,
} from '@planisfy/database/jobs/reconciliation'
import {
  SOURCE_PROCESSING_QUEUE_NAME,
  WORKER_GEODATA_HEARTBEAT_KEY,
  WORKER_GEODATA_HEARTBEAT_STALE_MS,
} from '@planisfy/geodata-contracts'
import { getStorage } from '@planisfy/storage'
import { renderGenericNotificationEmail } from '@planisfy/email'
import {
  areaOfInterestToBBox,
  normalizeAreaOfInterest,
  type ConsoleAreaOfInterest,
} from '@planisfy/api-contracts'
import type { PlanFeature } from '@planisfy/types'
import {
  requireAnyOrgPermission,
  requireOrgPermission,
  type AuthEnv,
} from '../../middleware/auth'
import { env, redisConnection } from '../../env'
import { enqueueOutboxEvent } from '../../shared/outbox/outbox'
import {
  managedPlanFeatureDenial,
  planGateErrorPayload,
  requireManagedPlanFeature,
} from '../../shared/policy/plan-gates'
import { sendEmail } from '../email/email'
import { buildNotificationPayload } from './notification-adapters'
import { SourceUrlRejectedError, validateOutboundUrl } from '../imports/source-url-policy'

export const operationsRoute = new Hono<AuthEnv>()

const OPERATIONS_PERMISSIONS = [
  'operations.jobs.manage',
  'operations.schedules.manage',
  'operations.notifications.manage',
  'operations.backups.manage',
  'operations.workers.manage',
  'operations.routing.manage',
  'operations.delivery.manage',
  'operations.templates.manage',
] as const

operationsRoute.use('/operations', requireAnyOrgPermission([...OPERATIONS_PERMISSIONS]))
operationsRoute.use('/operations/events', requireAnyOrgPermission([...OPERATIONS_PERMISSIONS]))
operationsRoute.use('/operations', requireManagedPlanFeature('operations'))
operationsRoute.use('/operations/*', requireManagedPlanFeature('operations'))
operationsRoute.use('/operations/jobs/*', requireOrgPermission('operations.jobs.manage'))
operationsRoute.use(
  '/operations/notification-channels',
  requireOrgPermission('operations.notifications.manage')
)
operationsRoute.use(
  '/operations/notification-channels/*',
  requireOrgPermission('operations.notifications.manage')
)
operationsRoute.use('/operations/schedules', requireOrgPermission('operations.schedules.manage'))
operationsRoute.use('/operations/schedules/*', requireOrgPermission('operations.schedules.manage'))
operationsRoute.use('/operations/artifact-backups', requireOrgPermission('operations.backups.manage'))
operationsRoute.use(
  '/operations/artifact-backups/*',
  requireOrgPermission('operations.backups.manage')
)
operationsRoute.use('/operations/worker-nodes', requireOrgPermission('operations.workers.manage'))
operationsRoute.use('/operations/worker-nodes/*', requireOrgPermission('operations.workers.manage'))
operationsRoute.use(
  '/operations/root-agent-registration-tokens',
  requireOrgPermission('operations.workers.manage')
)
operationsRoute.use('/operations/routing-graphs', requireOrgPermission('operations.routing.manage'))
operationsRoute.use('/operations/routing-graphs/*', requireOrgPermission('operations.routing.manage'))
operationsRoute.use('/operations/basemap-builds', requireOrgPermission('operations.routing.manage'))
operationsRoute.use('/operations/basemap-builds/*', requireOrgPermission('operations.routing.manage'))
operationsRoute.use('/operations/basemap-releases', requireOrgPermission('operations.routing.manage'))
operationsRoute.use('/operations/basemap-releases/*', requireOrgPermission('operations.routing.manage'))
operationsRoute.use('/operations/preview-links', requireOrgPermission('operations.delivery.manage'))
operationsRoute.use('/operations/preview-links/*', requireOrgPermission('operations.delivery.manage'))
operationsRoute.use('/operations/custom-domains', requireOrgPermission('operations.delivery.manage'))
operationsRoute.use('/operations/custom-domains/*', requireOrgPermission('operations.delivery.manage'))
operationsRoute.use(
  '/operations/workflow-templates',
  requireOrgPermission('operations.templates.manage')
)
operationsRoute.use(
  '/operations/workflow-templates/*',
  requireOrgPermission('operations.templates.manage')
)

const notificationSchema = z
  .object({
    name: z.string().min(1).max(128),
    provider: z.enum(['webhook', 'email', 'slack', 'discord']),
    target: z.string().min(1).max(2048),
    events: z.array(z.string().min(1).max(128)).default([]),
    enabled: z.boolean().default(true),
  })
  .superRefine((notification, ctx) => {
    try {
      validateNotificationTarget(notification.provider, notification.target)
    } catch (err) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: err instanceof Error ? err.message : 'Notification target is not allowed',
        path: ['target'],
      })
    }
  })

const notificationDeliveryProofSchema = z.object({
  checkedAt: z.string().datetime().nullable(),
  delivered: z.boolean().default(false),
  adapter: z.string().min(1).default('unknown'),
  status: z.number().int().min(100).max(599).nullable(),
  code: z.string().nullable().default(null),
  message: z.string().nullable().default(null),
})

const notificationConfigSchema = z
  .object({
    lastDeliveryProof: notificationDeliveryProofSchema.optional(),
  })
  .passthrough()

const scheduleSchema = z
  .object({
    name: z.string().min(1).max(128),
    kind: z.enum(['tileset_rebuild', 'source_import', 'custom_command']),
    status: z.enum(['active', 'paused']).default('active'),
    cron: z.string().min(3).max(128),
    timezone: z.string().min(1).max(64).default('UTC'),
    payload: z.record(z.string(), z.unknown()).default({}),
  })
  .superRefine((schedule, ctx) => {
    const cronValidation = parseCronExpression(schedule.cron)
    if (!cronValidation.ok) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: cronValidation.message,
        path: ['cron'],
      })
    }
    if (!isValidScheduleTimezone(schedule.timezone)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Schedule timezone must be a valid IANA time zone',
        path: ['timezone'],
      })
    }
    if (schedule.kind === 'tileset_rebuild' && typeof schedule.payload.tilesetId !== 'string') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Tileset rebuild schedules require a tilesetId payload value',
        path: ['payload', 'tilesetId'],
      })
    }
  })

const workerNodeSchema = z
  .object({
    name: z.string().min(1).max(128),
    kind: z.enum(['local', 'remote', 'cloud']).default('local'),
    endpoint: z.string().url().optional(),
    metadata: z.record(z.string(), z.unknown()).default({}),
  })
  .superRefine((node, ctx) => {
    if (node.kind === 'local' || !node.endpoint) return
    try {
      validateRemoteWorkerEndpoint(node.endpoint)
    } catch (err) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: err instanceof Error ? err.message : 'Worker endpoint is not allowed',
        path: ['endpoint'],
      })
    }
  })

const rootAgentRegistrationTokenSchema = z.object({
  name: z.string().min(1).max(128),
  kind: z.enum(['local', 'remote', 'cloud']).default('remote'),
  metadata: z.record(z.string(), z.unknown()).default({}),
  expiresInHours: z.number().int().min(1).max(168).default(24),
})

const areaOfInterestInputSchema = z
  .unknown()
  .optional()
  .transform((value, ctx): ConsoleAreaOfInterest | undefined => {
    if (value === undefined || value === null) return undefined
    try {
      return normalizeAreaOfInterest(value)
    } catch (err) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: err instanceof Error ? err.message : 'Invalid area of interest',
      })
      return z.NEVER
    }
  })

const routingGraphBuildSchema = z.object({
  name: z.string().min(1).max(128),
  sourceUrl: z
    .string()
    .url()
    .transform((value, ctx) => {
      try {
        return validateOutboundUrl(value)
      } catch (err) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: err instanceof Error ? err.message : 'Source URL is not allowed',
        })
        return z.NEVER
      }
    }),
  sourcePreset: z.string().min(1).max(128).optional(),
  workerNodeId: z.string().uuid(),
  activationWorkerNodeId: z.string().uuid().optional(),
  valhallaImage: z.string().min(1).max(512).default('ghcr.io/valhalla/valhalla:3.7.0'),
  includeAdmins: z.boolean().default(true),
  includeTimezones: z.boolean().default(true),
  elevationMode: z.enum(['none', 'dem_companion']).default('none'),
  areaOfInterest: areaOfInterestInputSchema,
  config: z.record(z.string(), z.unknown()).default({}),
})

const routingGraphActivateSchema = z.object({
  activationWorkerNodeId: z.string().uuid().optional(),
})

const basemapBuildSchema = z.object({
  name: z.string().min(1).max(128),
  sourceUrl: z
    .string()
    .url()
    .transform((value, ctx) => {
      try {
        return validateOutboundUrl(value)
      } catch (err) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: err instanceof Error ? err.message : 'Source URL is not allowed',
        })
        return z.NEVER
      }
    }),
  sourcePreset: z.string().min(1).max(128).optional(),
  workerNodeId: z.string().uuid(),
  activationWorkerNodeId: z.string().uuid().optional(),
  engine: z.enum(['planetiler_osm', 'planetiler_overture']).default('planetiler_osm'),
  sourceKind: z.enum(['osm_pbf', 'overture_geoparquet']).default('osm_pbf'),
  planetilerImage: z.string().min(1).max(512).default('ghcr.io/onthegomap/planetiler:latest'),
  profile: z.string().min(1).max(128).default('openmaptiles'),
  outputFormat: z.enum(['pmtiles', 'mbtiles']).default('pmtiles'),
  areaOfInterest: areaOfInterestInputSchema,
  config: z.record(z.string(), z.unknown()).default({}),
})

const basemapActivateSchema = z.object({
  activationWorkerNodeId: z.string().uuid().optional(),
})

const previewLinkSchema = z.object({
  resourceType: z.string().min(1).max(64),
  resourceId: z.string().uuid(),
  targetUrl: z
    .string()
    .min(1)
    .max(2048)
    .transform((target, ctx) => {
      try {
        return validatePreviewTargetUrl(target)
      } catch (err) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: err instanceof Error ? err.message : 'Preview target URL is not allowed',
        })
        return z.NEVER
      }
    }),
  slug: z.string().min(1).max(128).optional(),
  expiresAt: z.string().datetime().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
})

const customDomainSchema = z.object({
  resourceType: z.string().min(1).max(64),
  resourceId: z.string().uuid().optional(),
  host: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[a-z0-9.-]+$/i, 'Host must be a domain name without protocol or path'),
  path: z.string().min(1).max(255).default('/'),
  tlsEnabled: z.boolean().default(true),
  metadata: z.record(z.string(), z.unknown()).default({}),
})

const templateSchema = z.object({
  name: z.string().min(1).max(128),
  category: z.string().min(1).max(64),
  description: z.string().max(2000).optional(),
  template: z.record(z.string(), z.unknown()).default({}),
})

const templateApplyBodySchema = z.object({
  values: z.record(z.string(), z.unknown()).default({}),
})

const storageTemplateSchema = z
  .record(z.string(), z.unknown())
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Storage templates must include at least one configuration key',
  })

type WorkflowTemplateForApply = {
  id: string
  name: string
  category: string
  template: unknown
}

const slackWebhookHosts = ['hooks.slack.com', 'hooks.slack-gov.com'] as const
const discordWebhookHosts = ['discord.com', 'discordapp.com'] as const

export type WorkflowTemplateApplication =
  | { category: 'schedule'; values: z.infer<typeof scheduleSchema> }
  | { category: 'preview'; values: z.infer<typeof previewLinkSchema> }
  | { category: 'storage'; values: Record<string, unknown> }

operationsRoute.get('/operations', async (c) => {
  const accountId = c.get('ownerId')
  return c.json({ data: await buildOperationsOverview(accountId) })
})

export function validateScheduleInput(input: unknown) {
  return scheduleSchema.safeParse(input)
}

type DeploymentMode = 'self_host' | 'managed'
type ScheduledOperationKind = z.infer<typeof scheduleSchema>['kind']
type ManagedConsoleOperatorOperation =
  | 'artifact_backups'
  | 'workflow_templates'
  | 'custom_command_schedules'
  | 'job_reconciliation'

export function canUseConsoleOperatorOperation(
  deploymentMode: DeploymentMode,
  operation: ManagedConsoleOperatorOperation
) {
  return deploymentMode !== 'managed' || !MANAGED_CONSOLE_OPERATOR_OPERATIONS.includes(operation)
}

const MANAGED_CONSOLE_OPERATOR_OPERATIONS: ManagedConsoleOperatorOperation[] = [
  'artifact_backups',
  'workflow_templates',
  'custom_command_schedules',
  'job_reconciliation',
]

export function canConsoleCreateScheduleKind(
  deploymentMode: DeploymentMode,
  kind: ScheduledOperationKind
) {
  return deploymentMode !== 'managed' || kind !== 'custom_command'
}

operationsRoute.get('/operations/events', async (c) => {
  const accountId = c.get('ownerId')
  const encoder = new TextEncoder()
  const signal = c.req.raw.signal
  let closed = false

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return
        controller.enqueue(encoder.encode(formatSseEvent(event, data)))
      }

      try {
        let lastSignature = ''
        let lastHeartbeat = Date.now()

        while (!closed && !signal.aborted) {
          const overview = await buildOperationsOverview(accountId)
          const signature = operationsOverviewSignature(overview)
          if (signature !== lastSignature) {
            send('operations', overview)
            lastSignature = signature
          } else if (Date.now() - lastHeartbeat > 25_000) {
            send('heartbeat', { at: new Date().toISOString() })
            lastHeartbeat = Date.now()
          }

          await abortableDelay(2_000, signal)
        }
      } catch (err) {
        if (!signal.aborted && !closed) {
          send('operations-error', {
            message: err instanceof Error ? err.message : 'Operations stream failed',
          })
        }
      } finally {
        closed = true
        try {
          controller.close()
        } catch {
          // The client may already have closed the stream.
        }
      }
    },
    cancel() {
      closed = true
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
})

async function buildOperationsOverview(accountId: string) {
  const [
    recentJobs,
    channels,
    schedules,
    backups,
    nodes,
    routingBuilds,
    basemapBuildRows,
    basemapReleaseRows,
    runtimeInstallationRows,
    previews,
    domains,
    templates,
    workerHealth,
    staleJobReconciliation,
  ] = await Promise.all([
    db
      .select()
      .from(processingJobs)
      .where(eq(processingJobs.accountId, accountId))
      .orderBy(desc(processingJobs.updatedAt))
      .limit(10),
    db
      .select()
      .from(notificationChannels)
      .where(
        and(eq(notificationChannels.accountId, accountId), isNull(notificationChannels.deletedAt))
      )
      .orderBy(desc(notificationChannels.createdAt)),
    db
      .select()
      .from(scheduledOperations)
      .where(
        and(eq(scheduledOperations.accountId, accountId), isNull(scheduledOperations.deletedAt))
      )
      .orderBy(desc(scheduledOperations.createdAt)),
    db
      .select()
      .from(artifactBackups)
      .where(eq(artifactBackups.accountId, accountId))
      .orderBy(desc(artifactBackups.createdAt))
      .limit(20),
    db
      .select()
      .from(workerNodes)
      .where(and(eq(workerNodes.accountId, accountId), isNull(workerNodes.deletedAt)))
      .orderBy(desc(workerNodes.updatedAt)),
    db
      .select()
      .from(routingGraphBuilds)
      .where(and(eq(routingGraphBuilds.accountId, accountId), isNull(routingGraphBuilds.deletedAt)))
      .orderBy(desc(routingGraphBuilds.updatedAt))
      .limit(20),
    db
      .select()
      .from(basemapBuilds)
      .where(and(eq(basemapBuilds.accountId, accountId), isNull(basemapBuilds.deletedAt)))
      .orderBy(desc(basemapBuilds.updatedAt))
      .limit(20),
    db
      .select()
      .from(basemapReleases)
      .where(eq(basemapReleases.accountId, accountId))
      .orderBy(desc(basemapReleases.updatedAt))
      .limit(20),
    db
      .select()
      .from(runtimeInstallations)
      .where(eq(runtimeInstallations.accountId, accountId))
      .orderBy(desc(runtimeInstallations.updatedAt))
      .limit(20),
    db
      .select()
      .from(previewLinks)
      .where(and(eq(previewLinks.accountId, accountId), isNull(previewLinks.deletedAt)))
      .orderBy(desc(previewLinks.createdAt)),
    db
      .select()
      .from(customDomains)
      .where(and(eq(customDomains.accountId, accountId), isNull(customDomains.deletedAt)))
      .orderBy(desc(customDomains.createdAt)),
    listTemplates(accountId),
    fetchWorkerHealth(),
    fetchStaleJobReconciliationSummary(accountId),
  ])

  const managed = env.DEPLOYMENT_MODE === 'managed'

  return {
    deploymentMode: env.DEPLOYMENT_MODE,
    recentJobs,
    notificationChannels: channels.map(stripNotificationSecrets),
    scheduledOperations: managed
      ? schedules.filter((schedule) => schedule.kind !== 'custom_command')
      : schedules,
    artifactBackups: managed ? [] : backups,
    workerNodes: managed ? [] : nodes,
    routingGraphBuilds: managed ? [] : routingBuilds.map(serializeRoutingGraphBuild),
    basemapBuilds: managed ? [] : basemapBuildRows.map(serializeBasemapBuild),
    basemapReleases: managed ? [] : basemapReleaseRows,
    runtimeInstallations: managed ? [] : runtimeInstallationRows,
    previewLinks: previews,
    customDomains: domains,
    workflowTemplates: managed ? [] : templates,
    workerHealth: managed
      ? { status: 'managed' as const, message: 'Platform-operated runtime', latencyMs: null }
      : workerHealth,
    staleJobReconciliation,
  }
}

type OperationsOverview = Awaited<ReturnType<typeof buildOperationsOverview>>

async function managedPlanGateResponse(c: Context<AuthEnv>, feature: PlanFeature) {
  const denial = await managedPlanFeatureDenial(c.get('ownerId'), feature)
  if (!denial) return null
  return c.json(planGateErrorPayload(denial), denial.status)
}

function managedConsoleOperatorResponse(
  c: Context<AuthEnv>,
  operation: ManagedConsoleOperatorOperation
) {
  return c.json(
    {
      error: {
        code: 'MANAGED_CONSOLE_OPERATOR_ACTION',
        message:
          `The ${operation.replace(/_/g, ' ')} operation is available from the admin console only.`,
      },
    },
    403
  )
}

function isPlanetScaleRoutingBuild(
  build: z.infer<typeof routingGraphBuildSchema>
) {
  return (
    build.sourcePreset?.toLowerCase() === 'planet' ||
    build.areaOfInterest?.kind === 'world'
  )
}

export function operationsOverviewSignature(overview: OperationsOverview) {
  return JSON.stringify({
    deploymentMode: overview.deploymentMode,
    recentJobs: overview.recentJobs.map((job) => ({
      id: job.id,
      status: job.status,
      progress: job.progress,
      updatedAt: job.updatedAt,
      completedAt: job.completedAt,
      errorCode: job.errorCode,
    })),
    notificationChannels: overview.notificationChannels.map((channel) => ({
      id: channel.id,
      enabled: channel.enabled,
      updatedAt: channel.updatedAt,
    })),
    scheduledOperations: overview.scheduledOperations.map((schedule) => ({
      id: schedule.id,
      status: schedule.status,
      lastRunAt: schedule.lastRunAt,
      nextRunAt: schedule.nextRunAt,
      updatedAt: schedule.updatedAt,
    })),
    artifactBackups: overview.artifactBackups.map((backup) => ({
      id: backup.id,
      status: backup.status,
      completedAt: backup.completedAt,
      restoredAt: backup.restoredAt,
    })),
    workerNodes: overview.workerNodes.map((node) => ({
      id: node.id,
      status: node.status,
      lastSeenAt: node.lastSeenAt,
      updatedAt: node.updatedAt,
    })),
    routingGraphBuilds: overview.routingGraphBuilds.map((build) => ({
      id: build.id,
      status: build.status,
      activationStatus: build.activationStatus,
      progress: build.progress,
      updatedAt: build.updatedAt,
      completedAt: build.completedAt,
      cancelRequestedAt: build.cancelRequestedAt,
    })),
    basemapBuilds: overview.basemapBuilds.map((build) => ({
      id: build.id,
      status: build.status,
      activationStatus: build.activationStatus,
      progress: build.progress,
      updatedAt: build.updatedAt,
      completedAt: build.completedAt,
      cancelRequestedAt: build.cancelRequestedAt,
    })),
    basemapReleases: overview.basemapReleases.map((release) => ({
      id: release.id,
      status: release.status,
      activationStatus: release.activationStatus,
      isPrimary: release.isPrimary,
      updatedAt: release.updatedAt,
      publishedAt: release.publishedAt,
      activatedAt: release.activatedAt,
    })),
    runtimeInstallations: overview.runtimeInstallations.map((installation) => ({
      id: installation.id,
      resourceType: installation.resourceType,
      workerNodeId: installation.workerNodeId,
      status: installation.status,
      activatedAt: installation.activatedAt,
      updatedAt: installation.updatedAt,
    })),
    previewLinks: overview.previewLinks.map((link) => ({
      id: link.id,
      expiresAt: link.expiresAt,
      createdAt: link.createdAt,
    })),
    customDomains: overview.customDomains.map((domain) => ({
      id: domain.id,
      status: domain.status,
      updatedAt: domain.updatedAt,
    })),
    workflowTemplates: overview.workflowTemplates.map((template) => ({
      id: template.id,
      createdAt: template.builtIn ? null : template.createdAt,
    })),
    workerHealth: { status: overview.workerHealth.status },
    staleJobReconciliation: {
      reconciled: overview.staleJobReconciliation.reconciled,
      latest: overview.staleJobReconciliation.latest.map((job) => ({
        id: job.id,
        updatedAt: job.updatedAt,
      })),
    },
  })
}

operationsRoute.post('/operations/jobs/reconcile-stale', async (c) => {
  if (!canUseConsoleOperatorOperation(env.DEPLOYMENT_MODE, 'job_reconciliation')) {
    return managedConsoleOperatorResponse(c, 'job_reconciliation')
  }

  const accountId = c.get('ownerId')
  const workerHealth = await fetchWorkerHealth()
  const result = await reconcileStaleProcessingJobs({
    accountId,
    staleMs: env.GEODATA_STALE_JOB_THRESHOLD_MS,
    hasFreshWorkerHeartbeat: workerHealth.status === 'healthy',
    getQueueJobLiveness: sourceQueueJobLiveness,
  })
  return c.json({ data: result })
})

operationsRoute.get('/operations/jobs/:id/timeline', async (c) => {
  const accountId = c.get('ownerId')
  const id = c.req.param('id')
  const [job] = await db
    .select()
    .from(processingJobs)
    .where(and(eq(processingJobs.id, id), eq(processingJobs.accountId, accountId)))
    .limit(1)
  if (!job) return notFound(c, 'Job not found')

  const logs = await db
    .select()
    .from(processingJobLogs)
    .where(eq(processingJobLogs.jobId, id))
    .orderBy(processingJobLogs.createdAt)

  return c.json({
    data: {
      job,
      timeline: [
        timelineEvent('queued', 'Job queued', job.createdAt, 'info', {}),
        ...logs.map((log) =>
          timelineEvent(log.id, log.message, log.createdAt, log.level, log.metadata)
        ),
        terminalJobEvent(job),
      ].filter(Boolean),
    },
  })
})

operationsRoute.post('/operations/notification-channels', async (c) => {
  const accountId = c.get('ownerId')
  const parsed = notificationSchema.safeParse(await c.req.json())
  if (!parsed.success) return validationError(c, parsed.error)

  const [created] = await db
    .insert(notificationChannels)
    .values({ accountId, ...parsed.data })
    .returning()
  return c.json({ data: stripNotificationSecrets(created!) }, 201)
})

operationsRoute.delete('/operations/notification-channels/:id', async (c) => {
  return softDeleteNotificationChannel(c)
})

operationsRoute.post('/operations/notification-channels/:id/test', async (c) => {
  const accountId = c.get('ownerId')
  const id = c.req.param('id')
  const [channel] = await db
    .select()
    .from(notificationChannels)
    .where(
      and(
        eq(notificationChannels.id, id),
        eq(notificationChannels.accountId, accountId),
        isNull(notificationChannels.deletedAt)
      )
    )
    .limit(1)
  if (!channel) return notFound(c, 'Notification channel not found')

  const result = await sendTestNotification(channel)
  const proof = buildNotificationDeliveryProof(result)
  await db
    .update(notificationChannels)
    .set({
      encryptedConfig: mergeNotificationConfig(channel.encryptedConfig, {
        lastDeliveryProof: proof,
      }),
      updatedAt: new Date(),
    })
    .where(eq(notificationChannels.id, id))
  return c.json({ data: { ...result, proof } })
})

operationsRoute.post('/operations/schedules', async (c) => {
  const accountId = c.get('ownerId')
  const parsed = scheduleSchema.safeParse(await c.req.json())
  if (!parsed.success) return validationError(c, parsed.error)
  if (!canConsoleCreateScheduleKind(env.DEPLOYMENT_MODE, parsed.data.kind)) {
    return managedConsoleOperatorResponse(c, 'custom_command_schedules')
  }
  const [created] = await db
    .insert(scheduledOperations)
    .values({
      accountId,
      ...parsed.data,
      nextRunAt: nextScheduleRunAt(parsed.data.status, parsed.data.cron, parsed.data.timezone),
    })
    .returning()
  return c.json({ data: created }, 201)
})

operationsRoute.post('/operations/schedules/:id/run', async (c) => {
  const accountId = c.get('ownerId')
  const id = c.req.param('id')
  const [schedule] = await db
    .select()
    .from(scheduledOperations)
    .where(
      and(
        eq(scheduledOperations.id, id),
        eq(scheduledOperations.accountId, accountId),
        isNull(scheduledOperations.deletedAt)
      )
    )
    .limit(1)
  if (!schedule) return notFound(c, 'Schedule not found')
  if (
    schedule.kind === 'custom_command' &&
    !canUseConsoleOperatorOperation(env.DEPLOYMENT_MODE, 'custom_command_schedules')
  ) {
    return managedConsoleOperatorResponse(c, 'custom_command_schedules')
  }
  const prepared = prepareScheduledOperationRun(schedule)
  if (!prepared.success) {
    return c.json(
      {
        error: {
          code: prepared.code,
          message: prepared.message,
        },
      },
      409
    )
  }
  const [updated] = await db
    .update(scheduledOperations)
    .set(prepared.update)
    .where(eq(scheduledOperations.id, id))
    .returning()
  await enqueueOutboxEvent(prepared.outbox)
  return c.json({ data: { schedule: updated, queued: true } })
})

operationsRoute.delete('/operations/schedules/:id', async (c) => {
  const accountId = c.get('ownerId')
  const id = c.req.param('id')
  const [schedule] = await db
    .select({ kind: scheduledOperations.kind })
    .from(scheduledOperations)
    .where(
      and(
        eq(scheduledOperations.id, id),
        eq(scheduledOperations.accountId, accountId),
        isNull(scheduledOperations.deletedAt)
      )
    )
    .limit(1)
  if (
    schedule?.kind === 'custom_command' &&
    !canUseConsoleOperatorOperation(env.DEPLOYMENT_MODE, 'custom_command_schedules')
  ) {
    return managedConsoleOperatorResponse(c, 'custom_command_schedules')
  }
  return softDeleteSchedule(c)
})

operationsRoute.post('/operations/artifact-backups', async (c) => {
  if (!canUseConsoleOperatorOperation(env.DEPLOYMENT_MODE, 'artifact_backups')) {
    return managedConsoleOperatorResponse(c, 'artifact_backups')
  }

  const accountId = c.get('ownerId')
  const parsed = z.object({ storageObjectId: z.string().uuid() }).safeParse(await c.req.json())
  if (!parsed.success) return validationError(c, parsed.error)

  const [object] = await db
    .select()
    .from(storageObjects)
    .where(
      and(
        eq(storageObjects.id, parsed.data.storageObjectId),
        eq(storageObjects.accountId, accountId),
        isNull(storageObjects.deletedAt)
      )
    )
    .limit(1)
  if (!object) return notFound(c, 'Storage object not found')

  const storage = getStorage()
  const storageInfo = storage.getInfo()
  const backupKey = `backups/${accountId}/${object.id}/${Date.now()}-${object.fileName ?? 'artifact'}`

  const result = await db.transaction(async (tx) => {
    await lockArtifactOperation(tx, object.id)

    const [backup] = await tx
      .insert(artifactBackups)
      .values({
        accountId,
        storageObjectId: object.id,
        provider: storageInfo.provider,
        bucket: storageInfo.bucket,
        sourceStorageKey: object.storageKey,
        backupStorageKey: backupKey,
        size: object.size,
        metadata: {
          resourceType: object.resourceType,
          resourceId: object.resourceId,
        },
      })
      .returning()

    try {
      await storage.copy(object.storageKey, backup!.backupStorageKey)
      const [updated] = await tx
        .update(artifactBackups)
        .set({ status: 'completed', completedAt: new Date() })
        .where(eq(artifactBackups.id, backup!.id))
        .returning()
      return { data: updated, status: 201 as const }
    } catch (err) {
      const [failed] = await tx
        .update(artifactBackups)
        .set({
          status: 'failed',
          errorMessage: errorMessage(err),
          completedAt: new Date(),
        })
        .where(eq(artifactBackups.id, backup!.id))
        .returning()
      return { data: failed, status: 500 as const }
    }
  })

  return c.json({ data: result.data }, result.status)
})

operationsRoute.post('/operations/artifact-backups/:id/restore', async (c) => {
  if (!canUseConsoleOperatorOperation(env.DEPLOYMENT_MODE, 'artifact_backups')) {
    return managedConsoleOperatorResponse(c, 'artifact_backups')
  }

  const accountId = c.get('ownerId')
  const id = c.req.param('id')
  const result = await db.transaction(async (tx) => {
    const [backup] = await tx
      .select()
      .from(artifactBackups)
      .where(and(eq(artifactBackups.id, id), eq(artifactBackups.accountId, accountId)))
      .limit(1)
    if (!backup) return { kind: 'not-found' as const }
    if (backup.status !== 'completed' && backup.status !== 'restored') {
      return { kind: 'invalid-state' as const }
    }

    await lockArtifactOperation(tx, backup.storageObjectId ?? backup.id)
    await getStorage().copy(backup.backupStorageKey, backup.sourceStorageKey)
    const [updated] = await tx
      .update(artifactBackups)
      .set({ status: 'restored', restoredAt: new Date() })
      .where(
        and(eq(artifactBackups.id, id), inArray(artifactBackups.status, ['completed', 'restored']))
      )
      .returning()

    return updated
      ? { kind: 'restored' as const, data: updated }
      : { kind: 'invalid-state' as const }
  })

  if (result.kind === 'not-found') return notFound(c, 'Backup not found')
  if (result.kind === 'invalid-state') {
    return c.json(
      {
        error: {
          code: 'INVALID_BACKUP_STATE',
          message: 'Backup is not restorable',
        },
      },
      400
    )
  }
  return c.json({ data: result.data })
})

operationsRoute.post('/operations/worker-nodes', async (c) => {
  const accountId = c.get('ownerId')
  const parsed = workerNodeSchema.safeParse(await c.req.json())
  if (!parsed.success) return validationError(c, parsed.error)
  const validation = await validateWorkerNode(parsed.data.kind, parsed.data.endpoint)
  const [created] = await db
    .insert(workerNodes)
    .values({
      accountId,
      ...parsed.data,
      status: validation.ok ? 'healthy' : 'degraded',
      validation,
      lastSeenAt: validation.ok ? new Date() : null,
    })
    .returning()
  return c.json({ data: created }, 201)
})

operationsRoute.post('/operations/worker-nodes/:id/validate', async (c) => {
  const accountId = c.get('ownerId')
  const id = c.req.param('id')
  const [node] = await db
    .select()
    .from(workerNodes)
    .where(
      and(
        eq(workerNodes.id, id),
        eq(workerNodes.accountId, accountId),
        isNull(workerNodes.deletedAt)
      )
    )
    .limit(1)
  if (!node) return notFound(c, 'Worker node not found')
  const validation = await validateWorkerNode(node.kind, node.endpoint ?? undefined)
  const [updated] = await db
    .update(workerNodes)
    .set({
      status: validation.ok ? 'healthy' : 'degraded',
      validation,
      lastSeenAt: validation.ok ? new Date() : node.lastSeenAt,
      updatedAt: new Date(),
    })
    .where(eq(workerNodes.id, id))
    .returning()
  return c.json({ data: updated })
})

operationsRoute.delete('/operations/worker-nodes/:id', async (c) => {
  return softDeleteWorkerNode(c)
})

operationsRoute.post('/operations/root-agent-registration-tokens', async (c) => {
  const accountId = c.get('ownerId')
  const denial = await managedPlanGateResponse(c, 'routingBuilds')
  if (denial) return denial
  const parsed = rootAgentRegistrationTokenSchema.safeParse(await c.req.json())
  if (!parsed.success) return validationError(c, parsed.error)
  const token = `par_${randomBytes(32).toString('base64url')}`
  const expiresAt = new Date(Date.now() + parsed.data.expiresInHours * 60 * 60 * 1000)
  await db.insert(rootAgentRegistrationTokens).values({
    accountId,
    name: parsed.data.name,
    kind: parsed.data.kind,
    metadata: parsed.data.metadata,
    tokenHash: hashToken(token),
    expiresAt,
  })
  return c.json({
    data: {
      token,
      expiresAt: expiresAt.toISOString(),
      nodeName: parsed.data.name,
    },
  }, 201)
})

operationsRoute.get('/operations/routing-graphs', async (c) => {
  const accountId = c.get('ownerId')
  const builds = await db
    .select()
    .from(routingGraphBuilds)
    .where(and(eq(routingGraphBuilds.accountId, accountId), isNull(routingGraphBuilds.deletedAt)))
    .orderBy(desc(routingGraphBuilds.updatedAt))
    .limit(100)
  return c.json({ data: builds.map(serializeRoutingGraphBuild) })
})

operationsRoute.post('/operations/routing-graphs', async (c) => {
  const accountId = c.get('ownerId')
  const parsed = routingGraphBuildSchema.safeParse(await c.req.json())
  if (!parsed.success) return validationError(c, parsed.error)
  const routingDenial = await managedPlanGateResponse(c, 'routingBuilds')
  if (routingDenial) return routingDenial
  if (isPlanetScaleRoutingBuild(parsed.data)) {
    const planetDenial = await managedPlanGateResponse(c, 'planetScaleBuilds')
    if (planetDenial) return planetDenial
  }
  const worker = await findWorkerNode(accountId, parsed.data.workerNodeId)
  if (!worker) return notFound(c, 'Build worker node not found')
  const buildCapabilityError = validateWorkerCapability(worker, 'valhalla_graph_build', 'build')
  if (buildCapabilityError) return c.json({ error: buildCapabilityError }, 409)
  if (parsed.data.activationWorkerNodeId) {
    const activationWorker = await findWorkerNode(accountId, parsed.data.activationWorkerNodeId)
    if (!activationWorker) return notFound(c, 'Activation worker node not found')
    const activationError = validateServingWorker(activationWorker)
    if (activationError) return c.json({ error: activationError }, 409)
  }
  const config = routingGraphConfigForBuild(parsed.data)
  const demValidation = validateRoutingGraphDemConfig(parsed.data.elevationMode, config)
  if (demValidation) {
    return c.json({ error: demValidation }, 400)
  }
  const [created] = await db
    .insert(routingGraphBuilds)
    .values({
      accountId,
      name: parsed.data.name,
      sourceUrl: parsed.data.sourceUrl,
      sourcePreset: parsed.data.sourcePreset ?? null,
      workerNodeId: parsed.data.workerNodeId,
      activationWorkerNodeId: parsed.data.activationWorkerNodeId ?? null,
      valhallaImage: parsed.data.valhallaImage,
      includeAdmins: parsed.data.includeAdmins,
      includeTimezones: parsed.data.includeTimezones,
      elevationMode: parsed.data.elevationMode,
      config,
    })
    .returning()
  await appendRoutingGraphLog(created!.id, 'info', 'Routing graph build queued', {
    workerNodeId: created!.workerNodeId,
    sourcePreset: created!.sourcePreset,
    areaOfInterest: parsed.data.areaOfInterest ?? null,
  })
  return c.json({ data: serializeRoutingGraphBuild(created!) }, 201)
})

operationsRoute.get('/operations/routing-graphs/:id', async (c) => {
  const accountId = c.get('ownerId')
  const id = c.req.param('id')
  const detail = await routingGraphBuildDetail(accountId, id)
  if (!detail) return notFound(c, 'Routing graph build not found')
  return c.json({
    data: { ...detail, build: serializeRoutingGraphBuild(detail.build) },
  })
})

operationsRoute.post('/operations/routing-graphs/:id/cancel', async (c) => {
  const accountId = c.get('ownerId')
  const id = c.req.param('id')
  const [updated] = await db
    .update(routingGraphBuilds)
    .set({
      status: 'canceling',
      cancelRequestedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(routingGraphBuilds.id, id),
        eq(routingGraphBuilds.accountId, accountId),
        isNull(routingGraphBuilds.deletedAt),
        inArray(routingGraphBuilds.status, [
          'queued',
          'assigned',
          'preparing',
          'downloading_source',
          'building_admins',
          'building_tiles',
          'packaging',
          'uploading',
        ])
      )
    )
    .returning()
  if (!updated) return notFound(c, 'Cancelable routing graph build not found')
  await appendRoutingGraphLog(id, 'warn', 'Cancellation requested', null)
  return c.json({ data: serializeRoutingGraphBuild(updated) })
})

operationsRoute.post('/operations/routing-graphs/:id/activate', async (c) => {
  const accountId = c.get('ownerId')
  const id = c.req.param('id')
  const parsed = routingGraphActivateSchema.safeParse(await c.req.json().catch(() => ({})))
  if (!parsed.success) return validationError(c, parsed.error)
  const detail = await routingGraphBuildDetail(accountId, id)
  if (!detail) return notFound(c, 'Routing graph build not found')
  const activationWorkerResult = await resolveServingWorker(
    accountId,
    parsed.data.activationWorkerNodeId ?? detail.build.activationWorkerNodeId
  )
  if (!activationWorkerResult.ok) {
    return c.json({ error: activationWorkerResult.error }, activationWorkerResult.status)
  }
  const activationWorkerNodeId = activationWorkerResult.node.id
  const artifact = detail.artifacts.find((item) => item.status === 'available')
  if (!artifact) {
    return c.json({
      error: {
        code: 'ARTIFACT_REQUIRED',
        message: 'A successful routing graph artifact is required before activation.',
      },
    }, 409)
  }
  const [updated] = await db
    .update(routingGraphBuilds)
    .set({
      activationWorkerNodeId,
      activationStatus: 'activation_requested',
      updatedAt: new Date(),
    })
    .where(eq(routingGraphBuilds.id, id))
    .returning()
  await appendRoutingGraphLog(id, 'info', 'Activation requested', { activationWorkerNodeId })
  return c.json({ data: serializeRoutingGraphBuild(updated!) })
})

operationsRoute.get('/operations/basemap-builds', async (c) => {
  const accountId = c.get('ownerId')
  const builds = await db
    .select()
    .from(basemapBuilds)
    .where(and(eq(basemapBuilds.accountId, accountId), isNull(basemapBuilds.deletedAt)))
    .orderBy(desc(basemapBuilds.updatedAt))
    .limit(100)
  return c.json({ data: builds.map(serializeBasemapBuild) })
})

operationsRoute.post('/operations/basemap-builds', async (c) => {
  const accountId = c.get('ownerId')
  const parsed = basemapBuildSchema.safeParse(await c.req.json())
  if (!parsed.success) return validationError(c, parsed.error)
  const routingDenial = await managedPlanGateResponse(c, 'routingBuilds')
  if (routingDenial) return routingDenial
  if (parsed.data.engine === 'planetiler_overture') {
    return c.json({
      error: {
        code: 'OVERTURE_BASEMAP_NOT_IMPLEMENTED',
        message:
          'Overture basemap builds are modeled but not enabled until the Overture layer profile is implemented.',
      },
    }, 409)
  }
  const worker = await findWorkerNode(accountId, parsed.data.workerNodeId)
  if (!worker) return notFound(c, 'Build worker node not found')
  const buildCapabilityError = validateWorkerCapability(worker, 'basemap_build', 'build')
  if (buildCapabilityError) return c.json({ error: buildCapabilityError }, 409)
  if (parsed.data.activationWorkerNodeId) {
    const activationWorker = await findWorkerNode(accountId, parsed.data.activationWorkerNodeId)
    if (!activationWorker) return notFound(c, 'Serving worker node not found')
    const activationError = validateServingWorker(activationWorker)
    if (activationError) return c.json({ error: activationError }, 409)
  }
  const [created] = await db
    .insert(basemapBuilds)
    .values({
      accountId,
      name: parsed.data.name,
      sourceUrl: parsed.data.sourceUrl,
      sourcePreset: parsed.data.sourcePreset ?? null,
      workerNodeId: parsed.data.workerNodeId,
      activationWorkerNodeId: parsed.data.activationWorkerNodeId ?? null,
      engine: parsed.data.engine,
      sourceKind: parsed.data.sourceKind,
      planetilerImage: parsed.data.planetilerImage,
      profile: parsed.data.profile,
      outputFormat: parsed.data.outputFormat,
      areaOfInterest: parsed.data.areaOfInterest ?? null,
      config: {
        ...parsed.data.config,
        areaOfInterest: parsed.data.areaOfInterest ?? undefined,
      },
    })
    .returning()
  await appendBasemapBuildLog(created!.id, 'info', 'Basemap build queued', {
    workerNodeId: created!.workerNodeId,
    sourcePreset: created!.sourcePreset,
    engine: created!.engine,
    profile: created!.profile,
  })
  return c.json({ data: serializeBasemapBuild(created!) }, 201)
})

operationsRoute.get('/operations/basemap-builds/:id', async (c) => {
  const accountId = c.get('ownerId')
  const id = c.req.param('id')
  const detail = await basemapBuildDetail(accountId, id)
  if (!detail) return notFound(c, 'Basemap build not found')
  return c.json({
    data: { ...detail, build: serializeBasemapBuild(detail.build) },
  })
})

operationsRoute.post('/operations/basemap-builds/:id/cancel', async (c) => {
  const accountId = c.get('ownerId')
  const id = c.req.param('id')
  const [updated] = await db
    .update(basemapBuilds)
    .set({
      status: 'canceling',
      cancelRequestedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(basemapBuilds.id, id),
        eq(basemapBuilds.accountId, accountId),
        isNull(basemapBuilds.deletedAt),
        inArray(basemapBuilds.status, [
          'queued',
          'assigned',
          'preparing',
          'downloading_source',
          'building_tiles',
          'packaging',
          'uploading',
        ])
      )
    )
    .returning()
  if (!updated) return notFound(c, 'Cancelable basemap build not found')
  await appendBasemapBuildLog(id, 'warn', 'Cancellation requested', null)
  return c.json({ data: serializeBasemapBuild(updated) })
})

operationsRoute.post('/operations/basemap-builds/:id/activate', async (c) => {
  const accountId = c.get('ownerId')
  const id = c.req.param('id')
  const parsed = basemapActivateSchema.safeParse(await c.req.json().catch(() => ({})))
  if (!parsed.success) return validationError(c, parsed.error)
  const detail = await basemapBuildDetail(accountId, id)
  if (!detail) return notFound(c, 'Basemap build not found')
  const servingWorkerResult = await resolveServingWorker(
    accountId,
    parsed.data.activationWorkerNodeId ?? detail.build.activationWorkerNodeId
  )
  if (!servingWorkerResult.ok) {
    return c.json({ error: servingWorkerResult.error }, servingWorkerResult.status)
  }
  const artifact = detail.artifacts.find((item) => item.status === 'available')
  if (!artifact) {
    return c.json({
      error: {
        code: 'ARTIFACT_REQUIRED',
        message: 'A successful basemap artifact is required before activation.',
      },
    }, 409)
  }
  const [updated] = await db
    .update(basemapBuilds)
    .set({
      activationWorkerNodeId: servingWorkerResult.node.id,
      activationStatus: 'activation_requested',
      updatedAt: new Date(),
    })
    .where(eq(basemapBuilds.id, id))
    .returning()
  await appendBasemapBuildLog(id, 'info', 'Basemap activation requested', {
    activationWorkerNodeId: servingWorkerResult.node.id,
  })
  return c.json({ data: serializeBasemapBuild(updated!) })
})

operationsRoute.post('/operations/basemap-releases/:id/promote-primary', async (c) => {
  const accountId = c.get('ownerId')
  const id = c.req.param('id')
  const [release] = await db
    .select()
    .from(basemapReleases)
    .where(and(eq(basemapReleases.id, id), eq(basemapReleases.accountId, accountId)))
    .limit(1)
  if (!release) return notFound(c, 'Basemap release not found')
  if (release.activationStatus !== 'active') {
    return c.json({
      error: {
        code: 'BASEMAP_RELEASE_NOT_ACTIVE',
        message: 'Only an active basemap release can be promoted to primary.',
      },
    }, 409)
  }
  const [updated] = await db.transaction(async (tx) => {
    await tx
      .update(basemapReleases)
      .set({ isPrimary: false, updatedAt: new Date() })
      .where(eq(basemapReleases.accountId, accountId))
    return tx
      .update(basemapReleases)
      .set({ isPrimary: true, updatedAt: new Date() })
      .where(eq(basemapReleases.id, id))
      .returning()
  })
  return c.json({ data: updated! })
})

operationsRoute.post('/operations/preview-links', async (c) => {
  const accountId = c.get('ownerId')
  const parsed = previewLinkSchema.safeParse(await c.req.json())
  if (!parsed.success) return validationError(c, parsed.error)
  const [created] = await db
    .insert(previewLinks)
    .values({
      accountId,
      ...parsed.data,
      slug: parsed.data.slug ?? previewSlug(parsed.data.resourceType),
      expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
    })
    .returning()
  return c.json({ data: created }, 201)
})

operationsRoute.delete('/operations/preview-links/:id', async (c) => {
  return softDeletePreviewLink(c)
})

operationsRoute.post('/operations/custom-domains', async (c) => {
  const accountId = c.get('ownerId')
  const parsed = customDomainSchema.safeParse(await c.req.json())
  if (!parsed.success) return validationError(c, parsed.error)
  const [created] = await db
    .insert(customDomains)
    .values({
      accountId,
      ...parsed.data,
      verificationToken: `planisfy-domain-${randomBytes(16).toString('hex')}`,
    })
    .returning()
  return c.json({ data: created }, 201)
})

operationsRoute.post('/operations/custom-domains/:id/verify', async (c) => {
  const accountId = c.get('ownerId')
  const id = c.req.param('id')
  const [domain] = await db
    .select()
    .from(customDomains)
    .where(
      and(
        eq(customDomains.id, id),
        eq(customDomains.accountId, accountId),
        isNull(customDomains.deletedAt)
      )
    )
    .limit(1)
  if (!domain) return notFound(c, 'Custom domain not found')
  const verification = await verifyDomainDns(domain.host, domain.verificationToken)
  const [updated] = await db
    .update(customDomains)
    .set({
      status: verification.verified ? 'verified' : 'failed',
      metadata: {
        ...(isObjectRecord(domain.metadata) ? domain.metadata : {}),
        verification,
      },
      updatedAt: new Date(),
    })
    .where(eq(customDomains.id, id))
    .returning()
  return c.json({ data: updated })
})

operationsRoute.delete('/operations/custom-domains/:id', async (c) => {
  return softDeleteCustomDomain(c)
})

operationsRoute.post('/operations/workflow-templates', async (c) => {
  if (!canUseConsoleOperatorOperation(env.DEPLOYMENT_MODE, 'workflow_templates')) {
    return managedConsoleOperatorResponse(c, 'workflow_templates')
  }

  const accountId = c.get('ownerId')
  const parsed = templateSchema.safeParse(await c.req.json())
  if (!parsed.success) return validationError(c, parsed.error)
  const [created] = await db
    .insert(workflowTemplates)
    .values({ accountId, ...parsed.data, builtIn: false })
    .returning()
  return c.json({ data: created }, 201)
})

operationsRoute.post('/operations/workflow-templates/:id/apply', async (c) => {
  if (!canUseConsoleOperatorOperation(env.DEPLOYMENT_MODE, 'workflow_templates')) {
    return managedConsoleOperatorResponse(c, 'workflow_templates')
  }

  const accountId = c.get('ownerId')
  const id = c.req.param('id')
  const template = (await listTemplates(accountId)).find((row) => row.id === id)
  if (!template) return notFound(c, 'Workflow template not found')

  const body = templateApplyBodySchema.safeParse(await readJsonObject(c))
  if (!body.success) return validationError(c, body.error)

  const prepared = prepareWorkflowTemplateApplication(template, body.data.values)
  if (!prepared.success) return validationError(c, prepared.error)

  const application = prepared.data
  if (application.category === 'schedule') {
    const [created] = await db
      .insert(scheduledOperations)
      .values({
        accountId,
        ...application.values,
        nextRunAt: nextScheduleRunAt(
          application.values.status,
          application.values.cron,
          application.values.timezone
        ),
      })
      .returning()
    return c.json({ data: { applied: true, category: 'schedule', schedule: created } }, 201)
  }

  if (application.category === 'preview') {
    const [created] = await db
      .insert(previewLinks)
      .values({
        accountId,
        ...application.values,
        slug: application.values.slug ?? previewSlug(application.values.resourceType),
        expiresAt: application.values.expiresAt ? new Date(application.values.expiresAt) : null,
      })
      .returning()
    return c.json({ data: { applied: true, category: 'preview', previewLink: created } }, 201)
  }

  const keys = Object.keys(application.values)
  const matchingConfig = await db
    .select({ key: platformConfig.key })
    .from(platformConfig)
    .where(inArray(platformConfig.key, keys))
  if (matchingConfig.length === 0) {
    return c.json({
      data: {
        applied: false,
        category: 'storage',
        status: 'requires_admin_config',
        message: 'No matching platform storage settings are available for this template.',
        requiredKeys: keys,
      },
    })
  }

  return c.json({
    data: {
      applied: false,
      category: 'storage',
      status: 'configuration_draft',
      config: application.values,
      matchingConfigKeys: matchingConfig.map((row) => row.key),
    },
  })
})

operationsRoute.delete('/operations/workflow-templates/:id', async (c) => {
  if (!canUseConsoleOperatorOperation(env.DEPLOYMENT_MODE, 'workflow_templates')) {
    return managedConsoleOperatorResponse(c, 'workflow_templates')
  }

  return softDeleteWorkflowTemplate(c)
})

async function listTemplates(accountId: string) {
  const rows = await db
    .select()
    .from(workflowTemplates)
    .where(and(isNull(workflowTemplates.deletedAt), eq(workflowTemplates.accountId, accountId)))
    .orderBy(desc(workflowTemplates.createdAt))
  return [...builtInTemplates(), ...rows]
}

function builtInTemplates() {
  const now = new Date()
  return [
    {
      id: 'builtin-minio-storage',
      accountId: null,
      name: 'Local MinIO storage',
      category: 'storage',
      description: 'S3-compatible local storage settings for the with-minio Compose profile.',
      template: {
        STORAGE_PROVIDER: 's3',
        S3_BUCKET: 'planisfy-artifacts',
        S3_REGION: 'auto',
        S3_ENDPOINT: 'http://minio:9000',
        S3_PUBLIC_URL: 'http://localhost:9000/planisfy-artifacts',
      },
      builtIn: true,
      createdAt: now,
      deletedAt: null,
    },
    {
      id: 'builtin-overture-refresh',
      accountId: null,
      name: 'Nightly Overture refresh',
      category: 'schedule',
      description: 'Recurring source import refresh for an Overture dataset.',
      template: {
        kind: 'source_import',
        cron: '0 2 * * *',
        payload: { provider: 'OVERTURE' },
      },
      builtIn: true,
      createdAt: now,
      deletedAt: null,
    },
    {
      id: 'builtin-preview-tileset',
      accountId: null,
      name: 'Preview tileset link',
      category: 'preview',
      description: 'Temporary TileJSON preview URL for review before publishing.',
      template: {
        resourceType: 'tileset',
        ttlHours: 72,
      },
      builtIn: true,
      createdAt: now,
      deletedAt: null,
    },
  ]
}

export function prepareWorkflowTemplateApplication(
  template: WorkflowTemplateForApply,
  values: Record<string, unknown> = {}
): { success: true; data: WorkflowTemplateApplication } | { success: false; error: z.ZodError } {
  const base = isObjectRecord(template.template) ? template.template : {}
  const merged = { ...base, ...values }

  if (template.category === 'schedule') {
    const parsed = scheduleSchema.safeParse({
      name: template.name,
      ...merged,
    })
    return parsed.success
      ? { success: true, data: { category: 'schedule', values: parsed.data } }
      : { success: false, error: parsed.error }
  }

  if (template.category === 'preview') {
    const ttlHours =
      typeof merged.ttlHours === 'number' && Number.isFinite(merged.ttlHours)
        ? merged.ttlHours
        : null
    const parsed = previewLinkSchema.safeParse({
      ...merged,
      expiresAt:
        typeof merged.expiresAt === 'string'
          ? merged.expiresAt
          : ttlHours
            ? new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString()
            : undefined,
    })
    return parsed.success
      ? { success: true, data: { category: 'preview', values: parsed.data } }
      : { success: false, error: parsed.error }
  }

  if (template.category === 'storage') {
    const parsed = storageTemplateSchema.safeParse(merged)
    return parsed.success
      ? { success: true, data: { category: 'storage', values: parsed.data } }
      : { success: false, error: parsed.error }
  }

  const error = new z.ZodError([
    {
      code: z.ZodIssueCode.custom,
      path: ['category'],
      message: `Unsupported workflow template category: ${template.category}`,
    },
  ])
  return { success: false, error }
}

async function fetchWorkerHealth() {
  const startedAt = Date.now()
  try {
    const Redis = await import('ioredis').then((m) => m.default)
    const redis = new Redis({
      ...redisConnection,
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      lazyConnect: true,
    })
    await redis.connect()
    const heartbeat = await redis.get(WORKER_GEODATA_HEARTBEAT_KEY)
    await redis.quit()
    if (!heartbeat) {
      return {
        status: 'offline',
        message: 'No geodata worker heartbeat',
        latencyMs: Date.now() - startedAt,
      }
    }
    const parsed = JSON.parse(heartbeat) as {
      timestamp?: string
      toolchain?: unknown
    }
    const timestamp = parsed.timestamp ? Date.parse(parsed.timestamp) : NaN
    const ageMs = Number.isFinite(timestamp) ? Date.now() - timestamp : null
    return {
      status: ageMs !== null && ageMs <= WORKER_GEODATA_HEARTBEAT_STALE_MS ? 'healthy' : 'degraded',
      message: ageMs === null ? 'Invalid heartbeat' : `Heartbeat ${Math.round(ageMs / 1000)}s ago`,
      latencyMs: ageMs,
      toolchain: parsed.toolchain,
    }
  } catch (err) {
    return {
      status: 'offline',
      message: errorMessage(err),
      latencyMs: Date.now() - startedAt,
    }
  }
}

async function fetchStaleJobReconciliationSummary(accountId: string) {
  const [[countRow], latest] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(processingJobs)
      .where(
        and(
          eq(processingJobs.accountId, accountId),
          eq(processingJobs.errorCode, STALE_JOB_RECONCILED_CODE)
        )
      ),
    db
      .select({
        id: processingJobs.id,
        type: processingJobs.type,
        status: processingJobs.status,
        errorMessage: processingJobs.errorMessage,
        updatedAt: processingJobs.updatedAt,
      })
      .from(processingJobs)
      .where(
        and(
          eq(processingJobs.accountId, accountId),
          eq(processingJobs.errorCode, STALE_JOB_RECONCILED_CODE)
        )
      )
      .orderBy(desc(processingJobs.updatedAt))
      .limit(5),
  ])

  return {
    reconciled: countRow?.count ?? 0,
    latest,
  }
}

async function sourceQueueJobLiveness(jobId: string) {
  const queue = new Queue(SOURCE_PROCESSING_QUEUE_NAME, {
    connection: redisConnection,
  })
  try {
    const job = await queue.getJob(jobId)
    const state = job ? await job.getState() : null
    return { state, active: isQueueStateActive(state) }
  } finally {
    await queue.close()
  }
}

async function validateWorkerNode(kind: 'local' | 'remote' | 'cloud', endpoint?: string) {
  if (kind === 'local') {
    const health = await fetchWorkerHealth()
    return {
      ok: health.status === 'healthy',
      checks: [{ id: 'heartbeat', ...health }],
    }
  }
  if (!endpoint) {
    return {
      ok: false,
      checks: [{ id: 'endpoint', status: 'failed', message: 'Endpoint is required' }],
    }
  }
  try {
    const validatedEndpoint = validateRemoteWorkerEndpoint(endpoint)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000)
    const response = await fetch(validatedEndpoint, {
      redirect: 'manual',
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout))
    return {
      ok: response.ok,
      checks: [
        {
          id: 'endpoint',
          status: response.ok ? 'healthy' : 'failed',
          message: `${response.status} ${response.statusText}`,
        },
      ],
    }
  } catch (err) {
    return {
      ok: false,
      checks: [{ id: 'endpoint', status: 'failed', message: errorMessage(err) }],
    }
  }
}

function validateRemoteWorkerEndpoint(endpoint: string) {
  return validateOutboundUrl(endpoint)
}

export function validateNotificationTarget(
  provider: 'webhook' | 'email' | 'slack' | 'discord',
  target: string
) {
  if (provider === 'email') return target
  if (provider === 'slack') {
    return validateProviderWebhookUrl(target, slackWebhookHosts)
  }
  if (provider === 'discord') {
    return validateProviderWebhookUrl(target, discordWebhookHosts)
  }
  return validateOutboundUrl(target)
}

export function validatePreviewTargetUrl(target: string) {
  let url: URL
  try {
    url = new URL(target)
  } catch {
    throw new Error('Preview target URL must be a valid URL')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Preview target URL must use http or https')
  }
  return url.toString()
}

function validateProviderWebhookUrl(target: string, allowedHosts: readonly string[]) {
  const href = validateOutboundUrl(target, { allowedHosts })
  if (new URL(href).protocol !== 'https:') {
    throw new SourceUrlRejectedError('Webhook URL must use https')
  }
  return href
}

async function sendTestNotification(channel: typeof notificationChannels.$inferSelect) {
  const event = {
    event: 'notification.test',
    message: 'Planisfy test notification',
    timestamp: new Date().toISOString(),
  }
  return deliverNotification(channel, event)
}

export async function deliverNotification(
  channel: Pick<typeof notificationChannels.$inferSelect, 'provider' | 'target'>,
  event: {
    event: string
    message: string
    timestamp: string
    metadata?: Record<string, unknown>
  }
) {
  if (channel.provider === 'email') {
    const body = buildNotificationPayload('email', event) as {
      subject: string
      text: string
    }
    if (
      !env.ZEPTOMAIL_SEND_MAIL_TOKEN ||
      !env.ZEPTOMAIL_FROM_AUTH ||
      !env.ZEPTOMAIL_FROM_NOTIFICATIONS
    ) {
      return {
        delivered: false,
        adapter: 'email',
        status: 503,
        code: 'EMAIL_UNAVAILABLE',
        payload: body,
        message: 'Email delivery is unavailable because ZeptoMail is not configured.',
      }
    }
    const rendered = renderGenericNotificationEmail({
      title: body.subject,
      body: body.text,
      accountSettingsUrl: new URL('/settings/profile', env.NEXT_PUBLIC_CONSOLE_URL).toString(),
    })
    const delivered = await sendEmail({
      from: 'notifications',
      to: channel.target,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    })
    return {
      delivered,
      adapter: 'email',
      status: delivered ? 202 : 502,
      payload: body,
      message: delivered
        ? 'Email adapter accepted test payload'
        : 'Email adapter failed to send test payload',
    }
  }

  const body = buildNotificationPayload(channel.provider, event)
  let target: string
  try {
    target = validateNotificationTarget(channel.provider, channel.target)
  } catch (err) {
    return {
      delivered: false,
      adapter: channel.provider,
      status: 400,
      code: 'NOTIFICATION_TARGET_REJECTED',
      payload: body,
      message:
        err instanceof SourceUrlRejectedError ? err.message : 'Notification target is not allowed',
    }
  }

  const response = await fetch(target, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return {
    delivered: response.ok,
    adapter: channel.provider,
    status: response.status,
    payload: body,
    message: response.ok ? 'Notification endpoint accepted test payload' : response.statusText,
  }
}

export function buildNotificationDeliveryProof(
  result: {
    delivered: boolean
    adapter: string
    status: number
    code?: string
    message?: string
  },
  checkedAt = new Date()
) {
  return {
    checkedAt: checkedAt.toISOString(),
    delivered: result.delivered,
    adapter: result.adapter,
    status: result.status,
    code: result.code ?? null,
    message: result.message ?? null,
  }
}

async function verifyDomainDns(host: string, token: string) {
  const checkedAt = new Date().toISOString()
  const candidates = [`_planisfy.${host}`, host]
  const checks = []

  for (const candidate of candidates) {
    try {
      const records = (await resolveTxt(candidate)).map((parts) => parts.join(''))
      const matched = records.some((record) => record.includes(token))
      checks.push({
        host: candidate,
        status: matched ? 'matched' : 'missing',
        records,
      })
      if (matched) {
        return {
          verified: true,
          checkedAt,
          method: 'TXT',
          expected: token,
          checks,
        }
      }
    } catch (err) {
      checks.push({
        host: candidate,
        status: 'error',
        error: errorMessage(err),
      })
    }
  }

  return {
    verified: false,
    checkedAt,
    method: 'TXT',
    expected: token,
    checks,
  }
}

function stripNotificationSecrets(channel: typeof notificationChannels.$inferSelect) {
  return {
    ...channel,
    encryptedConfig: undefined,
    deliveryProof: lastNotificationDeliveryProof(channel.encryptedConfig),
    hasConfig: Boolean(
      channel.encryptedConfig &&
      typeof channel.encryptedConfig === 'object' &&
      Object.keys(channel.encryptedConfig).length > 0
    ),
  }
}

function mergeNotificationConfig(current: unknown, patch: Record<string, unknown>) {
  const parsed = notificationConfigSchema.safeParse(current)
  return {
    ...(parsed.success ? parsed.data : {}),
    ...patch,
  }
}

function lastNotificationDeliveryProof(config: unknown) {
  const parsed = notificationConfigSchema.safeParse(config)
  return parsed.success ? (parsed.data.lastDeliveryProof ?? null) : null
}

function timelineEvent(
  id: string,
  message: string,
  timestamp: Date | string | null,
  level: string,
  metadata: unknown
) {
  return {
    id,
    message,
    timestamp,
    level,
    metadata,
  }
}

function terminalJobEvent(job: typeof processingJobs.$inferSelect) {
  if (!job.completedAt) return null
  return timelineEvent(
    job.status.toLowerCase(),
    `Job ${job.status.toLowerCase()}`,
    job.completedAt,
    job.status === 'SUCCEEDED' ? 'info' : 'error',
    { errorCode: job.errorCode, errorMessage: job.errorMessage }
  )
}

async function softDeleteNotificationChannel(c: Context) {
  const accountId = c.get('ownerId')
  const id = c.req.param('id')
  if (!id) return missingRouteParam(c, 'id')
  const [row] = await db
    .select({ id: notificationChannels.id })
    .from(notificationChannels)
    .where(
      and(
        eq(notificationChannels.id, id),
        eq(notificationChannels.accountId, accountId),
        isNull(notificationChannels.deletedAt)
      )
    )
    .limit(1)
  if (!row) return notFound(c, 'Notification channel not found')
  await db
    .update(notificationChannels)
    .set({ deletedAt: new Date() })
    .where(eq(notificationChannels.id, id))
  return c.json({ data: { id, deleted: true } })
}

async function softDeleteSchedule(c: Context) {
  const accountId = c.get('ownerId')
  const id = c.req.param('id')
  if (!id) return missingRouteParam(c, 'id')
  const [row] = await db
    .select({ id: scheduledOperations.id })
    .from(scheduledOperations)
    .where(
      and(
        eq(scheduledOperations.id, id),
        eq(scheduledOperations.accountId, accountId),
        isNull(scheduledOperations.deletedAt)
      )
    )
    .limit(1)
  if (!row) return notFound(c, 'Schedule not found')
  await db
    .update(scheduledOperations)
    .set({ deletedAt: new Date() })
    .where(eq(scheduledOperations.id, id))
  return c.json({ data: { id, deleted: true } })
}

async function softDeleteWorkerNode(c: Context) {
  const accountId = c.get('ownerId')
  const id = c.req.param('id')
  if (!id) return missingRouteParam(c, 'id')
  const [row] = await db
    .select({ id: workerNodes.id })
    .from(workerNodes)
    .where(
      and(
        eq(workerNodes.id, id),
        eq(workerNodes.accountId, accountId),
        isNull(workerNodes.deletedAt)
      )
    )
    .limit(1)
  if (!row) return notFound(c, 'Worker node not found')
  const now = new Date()
  await Promise.all([
    db.update(workerNodes).set({ deletedAt: now, updatedAt: now }).where(eq(workerNodes.id, id)),
    db
      .update(rootAgentNodeTokens)
      .set({ revokedAt: now })
      .where(
        and(
          eq(rootAgentNodeTokens.workerNodeId, id),
          isNull(rootAgentNodeTokens.revokedAt)
        )
      ),
  ])
  return c.json({ data: { id, deleted: true } })
}

async function softDeletePreviewLink(c: Context) {
  const accountId = c.get('ownerId')
  const id = c.req.param('id')
  if (!id) return missingRouteParam(c, 'id')
  const [row] = await db
    .select({ id: previewLinks.id })
    .from(previewLinks)
    .where(
      and(
        eq(previewLinks.id, id),
        eq(previewLinks.accountId, accountId),
        isNull(previewLinks.deletedAt)
      )
    )
    .limit(1)
  if (!row) return notFound(c, 'Preview link not found')
  await db.update(previewLinks).set({ deletedAt: new Date() }).where(eq(previewLinks.id, id))
  return c.json({ data: { id, deleted: true } })
}

async function softDeleteCustomDomain(c: Context) {
  const accountId = c.get('ownerId')
  const id = c.req.param('id')
  if (!id) return missingRouteParam(c, 'id')
  const [row] = await db
    .select({ id: customDomains.id })
    .from(customDomains)
    .where(
      and(
        eq(customDomains.id, id),
        eq(customDomains.accountId, accountId),
        isNull(customDomains.deletedAt)
      )
    )
    .limit(1)
  if (!row) return notFound(c, 'Custom domain not found')
  await db.update(customDomains).set({ deletedAt: new Date() }).where(eq(customDomains.id, id))
  return c.json({ data: { id, deleted: true } })
}

async function softDeleteWorkflowTemplate(c: Context) {
  const accountId = c.get('ownerId')
  const id = c.req.param('id')
  if (!id) return missingRouteParam(c, 'id')
  const [row] = await db
    .select({ id: workflowTemplates.id })
    .from(workflowTemplates)
    .where(
      and(
        eq(workflowTemplates.id, id),
        eq(workflowTemplates.accountId, accountId),
        isNull(workflowTemplates.deletedAt)
      )
    )
    .limit(1)
  if (!row) return notFound(c, 'Workflow template not found')
  await db
    .update(workflowTemplates)
    .set({ deletedAt: new Date() })
    .where(eq(workflowTemplates.id, id))
  return c.json({ data: { id, deleted: true } })
}

type CronFieldName = 'minute' | 'hour' | 'dayOfMonth' | 'month' | 'dayOfWeek'
type ParsedCronField = {
  values: Set<number>
  wildcard: boolean
}
type ParsedCronExpression = Record<CronFieldName, ParsedCronField>
type ScheduledOperationForRun = Pick<
  typeof scheduledOperations.$inferSelect,
  'id' | 'accountId' | 'kind' | 'status' | 'cron' | 'timezone' | 'payload' | 'deletedAt'
>

export function prepareScheduledOperationRun(schedule: ScheduledOperationForRun, now = new Date()) {
  if (schedule.deletedAt) {
    return {
      success: false as const,
      code: 'SCHEDULE_DELETED',
      message: 'Deleted schedules cannot be run.',
    }
  }
  if (schedule.status !== 'active') {
    return {
      success: false as const,
      code: 'SCHEDULE_PAUSED',
      message: 'Paused schedules cannot be run until they are reactivated.',
    }
  }

  return {
    success: true as const,
    update: {
      lastRunAt: now,
      nextRunAt: nextScheduleRunAt(schedule.status, schedule.cron, schedule.timezone, now),
      updatedAt: now,
    },
    outbox: {
      eventName: 'scheduled_operation.run_requested' as const,
      payload: {
        accountId: schedule.accountId,
        scheduleId: schedule.id,
        kind: schedule.kind,
        payload: isObjectRecord(schedule.payload) ? schedule.payload : {},
        requestedAt: now.toISOString(),
      },
    },
  }
}

export function nextScheduleRunAt(
  status: 'active' | 'paused',
  cron: string,
  timezone: string,
  from = new Date()
) {
  if (status === 'paused') return null
  const parsed = parseCronExpression(cron)
  if (!parsed.ok) return null

  const candidate = new Date(from)
  candidate.setUTCSeconds(0, 0)
  candidate.setUTCMinutes(candidate.getUTCMinutes() + 1)

  const maxMinutes = 366 * 24 * 60
  for (let i = 0; i < maxMinutes; i += 1) {
    if (cronMatches(candidate, parsed.expression, timezone)) {
      return new Date(candidate)
    }
    candidate.setUTCMinutes(candidate.getUTCMinutes() + 1)
  }
  return null
}

function parseCronExpression(
  cron: string
): { ok: true; expression: ParsedCronExpression } | { ok: false; message: string } {
  const fields = cron.trim().split(/\s+/)
  if (fields.length !== 5) {
    return {
      ok: false,
      message: 'Schedule cron must use five fields: minute hour day month weekday',
    }
  }

  const minute = parseCronField(fields[0]!, 0, 59)
  const hour = parseCronField(fields[1]!, 0, 23)
  const dayOfMonth = parseCronField(fields[2]!, 1, 31)
  const month = parseCronField(fields[3]!, 1, 12)
  const dayOfWeek = parseCronField(fields[4]!, 0, 7, { normalizeSeven: true })
  if (!minute || !hour || !dayOfMonth || !month || !dayOfWeek) {
    return {
      ok: false,
      message: 'Schedule cron fields may use *, numbers, ranges, lists, and steps.',
    }
  }

  return {
    ok: true,
    expression: {
      minute,
      hour,
      dayOfMonth,
      month,
      dayOfWeek,
    },
  }
}

function parseCronField(
  field: string,
  min: number,
  max: number,
  options: { normalizeSeven?: boolean } = {}
): ParsedCronField | null {
  const values = new Set<number>()
  const tokens = field.split(',')
  let wildcard = tokens.length === 1 && tokens[0] === '*'

  for (const token of tokens) {
    if (!token) return null
    const [rangeToken, stepToken] = token.split('/')
    const step = stepToken === undefined ? 1 : Number(stepToken)
    if (!Number.isInteger(step) || step < 1) return null

    let start: number
    let end: number
    if (rangeToken === '*') {
      start = min
      end = max
    } else if (rangeToken?.includes('-')) {
      const [rawStart, rawEnd] = rangeToken.split('-')
      start = Number(rawStart)
      end = Number(rawEnd)
    } else {
      start = Number(rangeToken)
      end = start
    }

    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < min ||
      end > max ||
      start > end
    ) {
      return null
    }

    for (let value = start; value <= end; value += step) {
      values.add(options.normalizeSeven && value === 7 ? 0 : value)
    }
  }

  if (values.size === 0) return null
  wildcard ||= values.size === max - min + 1
  return { values, wildcard }
}

export function isValidScheduleTimezone(timezone: string) {
  try {
    Intl.DateTimeFormat('en-US', { timeZone: timezone })
    return true
  } catch {
    return false
  }
}

function cronMatches(date: Date, cron: ParsedCronExpression, timezone: string) {
  const parts = zonedDateParts(date, timezone)
  const dayOfMonthMatches = cron.dayOfMonth.values.has(parts.day)
  const dayOfWeekMatches = cron.dayOfWeek.values.has(parts.dayOfWeek)
  const dayMatches =
    cron.dayOfMonth.wildcard && cron.dayOfWeek.wildcard
      ? true
      : cron.dayOfMonth.wildcard
        ? dayOfWeekMatches
        : cron.dayOfWeek.wildcard
          ? dayOfMonthMatches
          : dayOfMonthMatches || dayOfWeekMatches

  return (
    cron.minute.values.has(parts.minute) &&
    cron.hour.values.has(parts.hour) &&
    cron.month.values.has(parts.month) &&
    dayMatches
  )
}

function zonedDateParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value)
  const year = get('year')
  const month = get('month')
  const day = get('day')

  return {
    year,
    month,
    day,
    hour: get('hour'),
    minute: get('minute'),
    dayOfWeek: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
  }
}

function previewSlug(resourceType: string) {
  return `${resourceType}-${randomUUID().slice(0, 8)}`
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function serializeRoutingGraphBuild<T extends { config: unknown }>(build: T) {
  const config = isObjectRecord(build.config) ? build.config : {}
  return {
    ...build,
    config,
    areaOfInterest: safeNormalizeAreaOfInterest(config.areaOfInterest),
  }
}

function serializeBasemapBuild<T extends { config: unknown; areaOfInterest: unknown }>(build: T) {
  const config = isObjectRecord(build.config) ? build.config : {}
  return {
    ...build,
    config,
    areaOfInterest: safeNormalizeAreaOfInterest(build.areaOfInterest ?? config.areaOfInterest),
  }
}

function routingGraphConfigForBuild(data: {
  config: Record<string, unknown>
  areaOfInterest?: ConsoleAreaOfInterest
  elevationMode: 'none' | 'dem_companion'
}) {
  const config: Record<string, unknown> = { ...data.config }
  if (data.areaOfInterest) {
    config.areaOfInterest = data.areaOfInterest
  }
  if (data.elevationMode !== 'dem_companion') return config

  const existingDem = isObjectRecord(config.dem) ? config.dem : {}
  const dem: Record<string, unknown> = { ...existingDem }
  if (!isValidDemBounds(dem.bounds) && data.areaOfInterest) {
    const [minLon, minLat, maxLon, maxLat] = areaOfInterestToBBox(data.areaOfInterest)
    dem.bounds = { minLon, minLat, maxLon, maxLat }
  }
  config.dem = dem
  return config
}

function validateRoutingGraphDemConfig(
  elevationMode: 'none' | 'dem_companion',
  config: Record<string, unknown>
) {
  if (elevationMode !== 'dem_companion') return null
  const dem = isObjectRecord(config.dem) ? config.dem : {}
  const hgtTiles = Array.isArray(dem.hgtTiles)
    ? dem.hgtTiles.filter((tile) => typeof tile === 'string' && tile.trim())
    : []
  if (isValidDemBounds(dem.bounds) || hgtTiles.length > 0) return null
  return {
    code: 'DEM_AREA_REQUIRED',
    message: 'DEM companion builds require a full-world selection, bbox, or explicit HGT tiles.',
  }
}

function safeNormalizeAreaOfInterest(value: unknown) {
  try {
    return value === undefined ? undefined : normalizeAreaOfInterest(value)
  } catch {
    return undefined
  }
}

function isValidDemBounds(value: unknown) {
  if (!isObjectRecord(value)) return false
  return [value.minLon, value.minLat, value.maxLon, value.maxLat].every((item) =>
    Number.isFinite(Number(item))
  )
}

async function findWorkerNode(accountId: string, id: string) {
  const [node] = await db
    .select()
    .from(workerNodes)
    .where(
      and(
        eq(workerNodes.id, id),
        eq(workerNodes.accountId, accountId),
        isNull(workerNodes.deletedAt)
      )
    )
    .limit(1)
  return node ?? null
}

async function findManagedServingWorker(accountId: string) {
  const nodes = await db
    .select()
    .from(workerNodes)
    .where(and(eq(workerNodes.accountId, accountId), isNull(workerNodes.deletedAt)))
    .orderBy(desc(workerNodes.updatedAt))
  return (
    nodes.find(
      (node) =>
        node.status === 'healthy' &&
        (hasWorkerCapability(node, 'managed_runtime_activation') ||
          hasWorkerCapability(node, 'self_host_activation'))
    ) ?? null
  )
}

async function resolveServingWorker(accountId: string, requestedId: string | null | undefined) {
  const node = requestedId
    ? await findWorkerNode(accountId, requestedId)
    : env.DEPLOYMENT_MODE === 'managed'
      ? await findManagedServingWorker(accountId)
      : null
  if (!node) {
    return {
      ok: false as const,
      status: 400 as const,
      error: {
        code:
          env.DEPLOYMENT_MODE === 'managed'
            ? 'MANAGED_SERVING_WORKER_UNAVAILABLE'
            : 'SERVING_WORKER_REQUIRED',
        message:
          env.DEPLOYMENT_MODE === 'managed'
            ? 'No managed serving worker is available for deployment.'
            : 'Select a self-host serving worker before deployment.',
      },
    }
  }
  const validation = validateServingWorker(node)
  if (validation) {
    return { ok: false as const, status: 409 as const, error: validation }
  }
  return { ok: true as const, node }
}

export function validateServingWorker(node: Awaited<ReturnType<typeof findWorkerNode>>) {
  if (!node) {
    return {
      code: 'SERVING_WORKER_NOT_FOUND',
      message: 'Serving worker node was not found.',
    }
  }
  const capabilityError = validateWorkerCapability(node, 'self_host_activation', 'serving')
  if (capabilityError && !hasWorkerCapability(node, 'managed_runtime_activation')) {
    return capabilityError
  }
  if (node.status !== 'healthy') {
    return {
      code: 'SERVING_WORKER_NOT_HEALTHY',
      message: 'Serving worker must have a healthy recent heartbeat before deployment.',
    }
  }
  const metadata = isObjectRecord(node.metadata) ? node.metadata : {}
  if (!isObjectRecord(metadata.activation)) {
    return {
      code: 'SERVING_WORKER_ACTIVATION_CONFIG_REQUIRED',
      message:
        'Serving worker must report activation paths before deployment. Restart the root-agent with activation settings configured.',
    }
  }
  if (metadata.activation.runtimeSupervisorConfigured !== true) {
    return {
      code: 'SERVING_WORKER_SUPERVISOR_REQUIRED',
      message:
        'Serving worker must report a configured runtime supervisor before deployment.',
    }
  }
  return null
}

export function validateWorkerCapability(
  node: NonNullable<Awaited<ReturnType<typeof findWorkerNode>>>,
  capability: string,
  purpose: 'build' | 'serving'
) {
  if (hasWorkerCapability(node, capability)) return null
  return {
    code: 'WORKER_CAPABILITY_REQUIRED',
    message: `Selected ${purpose} worker must advertise the ${capability} capability.`,
  }
}

export function hasWorkerCapability(
  node: NonNullable<Awaited<ReturnType<typeof findWorkerNode>>>,
  capability: string
) {
  const metadata = isObjectRecord(node.metadata) ? node.metadata : {}
  const capabilities = Array.isArray(metadata.capabilities) ? metadata.capabilities : []
  return capabilities.some((item) => item === capability)
}

async function appendRoutingGraphLog(
  buildId: string,
  level: string,
  message: string,
  metadata: unknown
) {
  await db.insert(routingGraphBuildLogs).values({
    buildId,
    level,
    message,
    metadata,
  })
}

async function appendBasemapBuildLog(
  buildId: string,
  level: string,
  message: string,
  metadata: unknown
) {
  await db.insert(basemapBuildLogs).values({
    buildId,
    level,
    message,
    metadata,
  })
}

async function routingGraphBuildDetail(accountId: string, id: string) {
  const [build] = await db
    .select()
    .from(routingGraphBuilds)
    .where(
      and(
        eq(routingGraphBuilds.id, id),
        eq(routingGraphBuilds.accountId, accountId),
        isNull(routingGraphBuilds.deletedAt)
      )
    )
    .limit(1)
  if (!build) return null
  const [artifacts, releases, logs] = await Promise.all([
    db
      .select()
      .from(routingGraphArtifacts)
      .where(eq(routingGraphArtifacts.buildId, id))
      .orderBy(desc(routingGraphArtifacts.createdAt)),
    db
      .select()
      .from(routingGraphReleases)
      .where(eq(routingGraphReleases.buildId, id))
      .orderBy(desc(routingGraphReleases.createdAt)),
    db
      .select()
      .from(routingGraphBuildLogs)
      .where(eq(routingGraphBuildLogs.buildId, id))
      .orderBy(desc(routingGraphBuildLogs.createdAt))
      .limit(250),
  ])
  return { build, artifacts, releases, logs }
}

async function basemapBuildDetail(accountId: string, id: string) {
  const [build] = await db
    .select()
    .from(basemapBuilds)
    .where(
      and(
        eq(basemapBuilds.id, id),
        eq(basemapBuilds.accountId, accountId),
        isNull(basemapBuilds.deletedAt)
      )
    )
    .limit(1)
  if (!build) return null
  const [artifacts, releases, logs] = await Promise.all([
    db
      .select()
      .from(basemapArtifacts)
      .where(eq(basemapArtifacts.buildId, id))
      .orderBy(desc(basemapArtifacts.createdAt)),
    db
      .select()
      .from(basemapReleases)
      .where(eq(basemapReleases.buildId, id))
      .orderBy(desc(basemapReleases.createdAt)),
    db
      .select()
      .from(basemapBuildLogs)
      .where(eq(basemapBuildLogs.buildId, id))
      .orderBy(desc(basemapBuildLogs.createdAt))
      .limit(250),
  ])
  return { build, artifacts, releases, logs }
}

async function readJsonObject(c: Context) {
  if (!c.req.header('content-type')?.includes('application/json')) return {}
  try {
    const body = (await c.req.json()) as unknown
    return isObjectRecord(body) ? body : {}
  } catch {
    return {}
  }
}

function validationError(c: Context, error: z.ZodError) {
  return c.json(
    {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: error.flatten(),
      },
    },
    400
  )
}

function notFound(c: Context, message: string) {
  return c.json({ error: { code: 'NOT_FOUND', message } }, 404)
}

function missingRouteParam(c: Context, param: string) {
  return c.json(
    {
      error: {
        code: 'BAD_REQUEST',
        message: `Missing route parameter: ${param}`,
      },
    },
    400
  )
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

type AdvisoryLockExecutor = {
  execute(query: SQL): Promise<unknown>
}

async function lockArtifactOperation(tx: AdvisoryLockExecutor, storageObjectId: string) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`artifactOperation:${storageObjectId}`}))`
  )
}

export function formatSseEvent(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

function abortableDelay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }

    const timeout = setTimeout(resolve, ms)
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timeout)
        reject(new DOMException('Aborted', 'AbortError'))
      },
      { once: true }
    )
  })
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
