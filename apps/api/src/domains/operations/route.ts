import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { resolveTxt } from 'node:dns/promises'
import { isIP } from 'node:net'
import { domainToASCII } from 'node:url'
import { Queue } from 'bullmq'
import { Hono } from 'hono'
import type { Context } from 'hono'
import { and, asc, desc, eq, inArray, isNull, lte, sql, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import {
  artifactBackups,
  basemapArtifacts,
  basemapBuildLogs,
  basemapBuilds,
  basemapReleases,
  customDomains,
  datasets,
  db,
  eventOutbox,
  geocodingArtifacts,
  geocodingBuildLogs,
  geocodingBuilds,
  geocodingReleases,
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
  scheduledOperationRuns,
  savedRegions,
  sourceImports,
  storageObjects,
  tilesets,
  uploads,
  workerNodes,
  workflowTemplates,
} from '@planisfy/database'
import {
  isQueueStateActive,
  reconcileStaleProcessingJobs,
  STALE_JOB_RECONCILED_CODE,
} from '@planisfy/database/jobs/reconciliation'
import {
  MANAGED_PELIAS_PROFILE,
  MANAGED_PELIAS_PROFILE_VERSION,
  SOURCE_PROCESSING_QUEUE_NAME,
  WORKER_GEODATA_HEARTBEAT_KEY,
  WORKER_GEODATA_HEARTBEAT_STALE_MS,
} from '@planisfy/geodata-contracts'
import { getStorage } from '@planisfy/storage'
import {
  normalizeOutboundUrl,
  OutboundRequestError,
  resolveOutboundTarget,
  withOutboundResponse,
  type OutboundRequestOptions,
} from '@planisfy/outbound'
import { renderGenericNotificationEmail } from '@planisfy/email'
import {
  areaOfInterestToBBox,
  normalizeAreaOfInterest,
  type ConsoleAreaOfInterest,
} from '@planisfy/api-contracts'
import type { PlanFeature } from '@planisfy/types'
import { requireAnyOrgPermission, requireOrgPermission, type AuthEnv } from '../../middleware/auth'
import { env, redisConnection } from '../../env'
import {
  managedPlanFeatureDenial,
  planGateErrorPayload,
  requireManagedPlanFeature,
} from '../../shared/policy/plan-gates'
import { sendEmail } from '../email/email'
import { buildNotificationPayload } from './notification-adapters'
import { SourceUrlRejectedError, validateOutboundUrl } from '../imports/source-url-policy'
import { buildOvertureImportEstimate } from '../imports/import-estimates'
import { findOvertureType } from '../imports/overture-catalog'
import { createProcessingJobInTransaction, logProcessingJob } from '../resources/processing-jobs'
import { detectUploadFormat } from '../resources/upload-policy'
import { enqueueOutboxEvent } from '../../shared/outbox/outbox'
import {
  consumeDashboardRateLimit,
  consumeNotificationTestRateLimit,
} from '../../middleware/rate-limit'

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
operationsRoute.use(
  '/operations/artifact-backups',
  requireOrgPermission('operations.backups.manage')
)
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
operationsRoute.use(
  '/operations/routing-graphs/*',
  requireOrgPermission('operations.routing.manage')
)
operationsRoute.use('/operations/basemap-builds', requireOrgPermission('operations.routing.manage'))
operationsRoute.use(
  '/operations/basemap-builds/*',
  requireOrgPermission('operations.routing.manage')
)
operationsRoute.use(
  '/operations/basemap-releases',
  requireOrgPermission('operations.routing.manage')
)
operationsRoute.use(
  '/operations/basemap-releases/*',
  requireOrgPermission('operations.routing.manage')
)
operationsRoute.use(
  '/operations/geocoding-builds',
  requireOrgPermission('operations.routing.manage')
)
operationsRoute.use(
  '/operations/geocoding-builds/*',
  requireOrgPermission('operations.routing.manage')
)
operationsRoute.use(
  '/operations/geocoding-releases/*',
  requireOrgPermission('operations.routing.manage')
)
operationsRoute.use('/operations/preview-links', requireOrgPermission('operations.delivery.manage'))
operationsRoute.use(
  '/operations/preview-links/*',
  requireOrgPermission('operations.delivery.manage')
)
operationsRoute.use(
  '/operations/custom-domains',
  requireOrgPermission('operations.delivery.manage')
)
operationsRoute.use(
  '/operations/custom-domains/*',
  requireOrgPermission('operations.delivery.manage')
)
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

const scheduleCommonSchema = z.object({
    name: z.string().min(1).max(128),
    status: z.enum(['active', 'paused']).default('active'),
    cron: z.string().min(3).max(128),
    timezone: z.string().min(1).max(64).default('UTC'),
  })

const scheduleSchema = z
  .discriminatedUnion('kind', [
    z.object({
      kind: z.literal('tileset_rebuild'),
      payload: z.object({ tilesetId: z.string().uuid() }).strict(),
    }),
    z.object({
      kind: z.literal('source_import'),
      payload: z.object({ sourceImportId: z.string().uuid() }).strict(),
    }),
  ])
  .and(scheduleCommonSchema)
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

export const routingGraphBuildSchema = z.object({
  name: z.string().min(1).max(128),
  sourceUrl: z
    .string()
    .url()
    .transform((value, ctx) => {
      try {
        return normalizeOutboundUrl(value).href
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
  valhallaImage: z.never().optional(),
  includeAdmins: z.boolean().default(true),
  includeTimezones: z.boolean().default(true),
  elevationMode: z.enum(['none', 'dem_companion']).default('none'),
  areaOfInterest: areaOfInterestInputSchema,
  config: z.record(z.string(), z.unknown()).default({}),
})

const routingGraphActivateSchema = z.object({
  activationWorkerNodeId: z.string().uuid().optional(),
})

const basemapBuildConfigSchema = z
  .object({
    minZoom: z.number().int().min(0).max(24).optional(),
    maxZoom: z.number().int().min(0).max(24).optional(),
    attribution: z.string().min(1).max(512).optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.minZoom === undefined || value.maxZoom === undefined || value.minZoom <= value.maxZoom,
    { message: 'minZoom must be less than or equal to maxZoom' }
  )

export const basemapBuildSchema = z.object({
  name: z.string().min(1).max(128),
  sourceUrl: z
    .string()
    .url()
    .transform((value, ctx) => {
      try {
        return normalizeOutboundUrl(value).href
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
  planetilerImage: z.never().optional(),
  profile: z.string().min(1).max(128).default('openmaptiles'),
  outputFormat: z.enum(['pmtiles', 'mbtiles']).default('pmtiles'),
  areaOfInterest: areaOfInterestInputSchema,
  config: basemapBuildConfigSchema.default({}),
})

const basemapActivateSchema = z.object({
  activationWorkerNodeId: z.string().uuid().optional(),
})

const geocodingBuildSchema = z.object({
  name: z.string().min(1).max(128),
  sourceUrl: z.string().url().max(4096),
  sourceDate: z.string().datetime().optional(),
  sourceChecksumSha256: z
    .string()
    .length(64)
    .regex(/^[a-f0-9]+$/i),
  peliasDockerCommit: z.string().min(7).max(64),
  profile: z.literal(MANAGED_PELIAS_PROFILE).default(MANAGED_PELIAS_PROFILE),
  profileVersion: z.literal(MANAGED_PELIAS_PROFILE_VERSION).default(MANAGED_PELIAS_PROFILE_VERSION),
  indexName: z.string().min(1).max(128).default('pelias'),
  activationWorkerNodeId: z.string().uuid().optional(),
  config: z.record(z.string(), z.unknown()).default({}),
})

const geocodingArtifactSchema = z
  .object({
    storageObjectId: z.string().uuid().optional(),
    storage: z
      .object({
        provider: z.enum(['s3', 'r2']),
        bucket: z.string().min(1).max(256),
        key: z.string().min(1).max(4096),
        contentType: z.string().min(1).max(128).default('application/gzip'),
      })
      .optional(),
    fileName: z
      .string()
      .min(1)
      .max(256)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, 'fileName must be a safe base name'),
    size: z.number().int().positive(),
    checksumSha256: z
      .string()
      .length(64)
      .regex(/^[a-f0-9]+$/i),
    snapshotName: z.string().min(1).max(128),
    snapshotRepository: z.string().min(1).max(128).default('planisfy'),
    manifest: z.record(z.string(), z.unknown()),
  })
  .refine((value) => Boolean(value.storageObjectId || value.storage), {
    message: 'storageObjectId or storage is required',
  })

const geocodingReleaseSchema = z.object({
  artifactId: z.string().uuid(),
  name: z.string().min(1).max(128).default('pelias-planet'),
  version: z.string().min(1).max(64),
  sourceDataVersions: z.record(z.string(), z.unknown()).default({}),
  manifest: z.record(z.string(), z.unknown()).default({}),
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
    .transform((value, ctx) => {
      try {
        return normalizeCustomDomainHost(value)
      } catch (err) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: err instanceof Error ? err.message : 'Host is not a valid public domain name',
        })
        return z.NEVER
      }
    }),
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

const OPERATIONS_COLLECTION_LIMIT = 100
const OPERATIONS_CACHE_TTL_MS = 5_000
const OPERATIONS_CACHE_MAX_ACCOUNTS = 250
type CachedOperationsOverview = Awaited<ReturnType<typeof buildOperationsOverview>>
const operationsOverviewCache = new Map<
  string,
  {
    expiresAt: number
    lastAccessedAt: number
    value?: CachedOperationsOverview
    promise?: Promise<CachedOperationsOverview>
  }
>()

operationsRoute.get('/operations', async (c) => {
  const accountId = c.get('ownerId')
  const retryAfter = await consumeDashboardRateLimit(`operations-read:${accountId}`)
  if (retryAfter) {
    c.header('Retry-After', String(retryAfter))
    return c.json(
      { error: { code: 'RATE_LIMITED', message: 'Operations refresh limit exceeded.' } },
      429
    )
  }
  c.header('Cache-Control', 'private, no-store')
  return c.json({ data: await cachedOperationsOverview(accountId) })
})

export function validateScheduleInput(input: unknown) {
  return scheduleSchema.safeParse(input)
}

type DeploymentMode = 'self_host' | 'managed'
type ScheduledOperationKind = (typeof scheduledOperations.$inferSelect)['kind']
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
  _deploymentMode: DeploymentMode,
  kind: ScheduledOperationKind
) {
  return kind === 'tileset_rebuild' || kind === 'source_import'
}

async function buildOperationsOverview(accountId: string) {
  const summaryWindowStartedAt = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const [
    recentJobs,
    activeJobRows,
    jobSummaryRows,
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
      .from(processingJobs)
      .where(
        and(
          eq(processingJobs.accountId, accountId),
          inArray(processingJobs.status, ['PENDING', 'PROCESSING'])
        )
      )
      .orderBy(desc(processingJobs.updatedAt))
      .limit(1),
    db
      .select({
        active: sql<number>`count(*) filter (where ${processingJobs.status} in ('PENDING', 'PROCESSING'))`,
        completed24h: sql<number>`count(*) filter (
          where ${processingJobs.status} = 'SUCCEEDED'
            and ${processingJobs.completedAt} >= ${summaryWindowStartedAt}
        )`,
        failed24h: sql<number>`count(*) filter (
          where ${processingJobs.status} = 'FAILED'
            and ${processingJobs.completedAt} >= ${summaryWindowStartedAt}
        )`,
        averageDurationMs24h: sql<number | null>`avg(
          extract(epoch from (${processingJobs.completedAt} - ${processingJobs.startedAt})) * 1000
        ) filter (
          where ${processingJobs.status} in ('SUCCEEDED', 'FAILED', 'CANCELED')
            and ${processingJobs.completedAt} >= ${summaryWindowStartedAt}
            and ${processingJobs.startedAt} is not null
        )`,
      })
      .from(processingJobs)
      .where(eq(processingJobs.accountId, accountId)),
    db
      .select()
      .from(notificationChannels)
      .where(
        and(eq(notificationChannels.accountId, accountId), isNull(notificationChannels.deletedAt))
      )
      .orderBy(desc(notificationChannels.createdAt))
      .limit(OPERATIONS_COLLECTION_LIMIT + 1),
    db
      .select()
      .from(scheduledOperations)
      .where(
        and(eq(scheduledOperations.accountId, accountId), isNull(scheduledOperations.deletedAt))
      )
      .orderBy(desc(scheduledOperations.createdAt))
      .limit(OPERATIONS_COLLECTION_LIMIT + 1),
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
      .orderBy(desc(workerNodes.updatedAt))
      .limit(OPERATIONS_COLLECTION_LIMIT + 1),
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
      .orderBy(desc(previewLinks.createdAt))
      .limit(OPERATIONS_COLLECTION_LIMIT + 1),
    db
      .select()
      .from(customDomains)
      .where(and(eq(customDomains.accountId, accountId), isNull(customDomains.deletedAt)))
      .orderBy(desc(customDomains.createdAt))
      .limit(OPERATIONS_COLLECTION_LIMIT + 1),
    listTemplates(accountId),
    fetchWorkerHealth(),
    fetchStaleJobReconciliationSummary(accountId),
  ])

  const managed = env.DEPLOYMENT_MODE === 'managed'
  const summary = jobSummaryRows[0]
  const visibleSchedules = managed
    ? schedules.filter((schedule) => schedule.kind !== 'custom_command')
    : schedules
  const visibleTemplates = managed ? [] : templates

  return {
    deploymentMode: env.DEPLOYMENT_MODE,
    recentJobs,
    jobSummary: {
      active: Number(summary?.active ?? 0),
      completed24h: Number(summary?.completed24h ?? 0),
      failed24h: Number(summary?.failed24h ?? 0),
      averageDurationMs24h:
        summary?.averageDurationMs24h === null ||
        summary?.averageDurationMs24h === undefined
          ? null
          : Number(summary.averageDurationMs24h),
      windowStartedAt: summaryWindowStartedAt.toISOString(),
      latestActiveJob: activeJobRows[0] ?? null,
    },
    notificationChannels: channels.slice(0, OPERATIONS_COLLECTION_LIMIT).map(stripNotificationSecrets),
    scheduledOperations: visibleSchedules.slice(0, OPERATIONS_COLLECTION_LIMIT),
    artifactBackups: managed ? [] : backups,
    workerNodes: managed ? [] : nodes.slice(0, OPERATIONS_COLLECTION_LIMIT),
    routingGraphBuilds: managed ? [] : routingBuilds.map(serializeRoutingGraphBuild),
    basemapBuilds: managed ? [] : basemapBuildRows.map(serializeBasemapBuild),
    basemapReleases: managed ? [] : basemapReleaseRows,
    runtimeInstallations: managed ? [] : runtimeInstallationRows,
    previewLinks: previews.slice(0, OPERATIONS_COLLECTION_LIMIT),
    customDomains: domains.slice(0, OPERATIONS_COLLECTION_LIMIT).map(serializeCustomDomain),
    workflowTemplates: visibleTemplates.slice(0, OPERATIONS_COLLECTION_LIMIT),
    truncatedCollections: [
      channels.length > OPERATIONS_COLLECTION_LIMIT ? 'notificationChannels' : null,
      visibleSchedules.length > OPERATIONS_COLLECTION_LIMIT ? 'scheduledOperations' : null,
      !managed && nodes.length > OPERATIONS_COLLECTION_LIMIT ? 'workerNodes' : null,
      previews.length > OPERATIONS_COLLECTION_LIMIT ? 'previewLinks' : null,
      domains.length > OPERATIONS_COLLECTION_LIMIT ? 'customDomains' : null,
      visibleTemplates.length > OPERATIONS_COLLECTION_LIMIT ? 'workflowTemplates' : null,
    ].filter((name): name is string => name !== null),
    workerHealth: managed
      ? { status: 'managed' as const, message: 'Platform-operated runtime', latencyMs: null }
      : workerHealth,
    staleJobReconciliation,
  }
}

async function cachedOperationsOverview(accountId: string) {
  const now = Date.now()
  const cached = operationsOverviewCache.get(accountId)
  if (cached?.value && cached.expiresAt > now) {
    cached.lastAccessedAt = now
    return cached.value
  }
  if (cached?.promise) {
    cached.lastAccessedAt = now
    return cached.promise
  }

  const entry = cached ?? { expiresAt: 0, lastAccessedAt: now }
  entry.lastAccessedAt = now
  entry.promise = buildOperationsOverview(accountId)
    .then((value) => {
      entry.value = value
      entry.expiresAt = Date.now() + OPERATIONS_CACHE_TTL_MS
      return value
    })
    .finally(() => {
      entry.promise = undefined
      evictOperationsOverviewCache()
    })
  operationsOverviewCache.set(accountId, entry)
  return entry.promise
}

function evictOperationsOverviewCache() {
  const now = Date.now()
  for (const [accountId, entry] of operationsOverviewCache) {
    if (!entry.promise && entry.expiresAt <= now) operationsOverviewCache.delete(accountId)
  }
  if (operationsOverviewCache.size <= OPERATIONS_CACHE_MAX_ACCOUNTS) return
  const oldest = [...operationsOverviewCache.entries()]
    .filter(([, entry]) => !entry.promise)
    .sort((left, right) => left[1].lastAccessedAt - right[1].lastAccessedAt)
  while (
    operationsOverviewCache.size > OPERATIONS_CACHE_MAX_ACCOUNTS &&
    oldest.length > 0
  ) {
    operationsOverviewCache.delete(oldest.shift()![0])
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
        message: `The ${operation.replace(/_/g, ' ')} operation is available from the admin console only.`,
      },
    },
    403
  )
}

function isPlanetScaleRoutingBuild(build: z.infer<typeof routingGraphBuildSchema>) {
  return build.sourcePreset?.toLowerCase() === 'planet' || build.areaOfInterest?.kind === 'world'
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
    jobSummary: {
      active: overview.jobSummary.active,
      completed24h: overview.jobSummary.completed24h,
      failed24h: overview.jobSummary.failed24h,
      averageDurationMs24h: overview.jobSummary.averageDurationMs24h,
      latestActiveJob: overview.jobSummary.latestActiveJob
        ? {
            id: overview.jobSummary.latestActiveJob.id,
            status: overview.jobSummary.latestActiveJob.status,
            progress: overview.jobSummary.latestActiveJob.progress,
            updatedAt: overview.jobSummary.latestActiveJob.updatedAt,
          }
        : null,
    },
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

  const retryAfter = await consumeNotificationTestRateLimit(accountId, channel.id)
  if (retryAfter) {
    c.header('Retry-After', String(retryAfter))
    return c.json(
      {
        error: {
          code: 'RATE_LIMITED',
          message: `Notification test limit exceeded. Retry after ${retryAfter} seconds.`,
        },
      },
      429
    )
  }

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
  const targetError = await validateScheduleTarget(accountId, parsed.data)
  if (targetError) return c.json({ error: targetError }, 400)
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

async function validateScheduleTarget(
  accountId: string,
  schedule: z.infer<typeof scheduleSchema>
) {
  if (schedule.kind === 'tileset_rebuild') {
    const [tileset] = await db
      .select({ id: tilesets.id })
      .from(tilesets)
      .where(
        and(
          eq(tilesets.id, schedule.payload.tilesetId),
          eq(tilesets.accountId, accountId),
          isNull(tilesets.deletedAt)
        )
      )
      .limit(1)
    return tileset
      ? null
      : { code: 'INVALID_SCHEDULE_TARGET', message: 'Tileset was not found for this account.' }
  }

  const [sourceImport] = await db
    .select({
      id: sourceImports.id,
      provider: sourceImports.provider,
      regionId: sourceImports.regionId,
      datasetId: sourceImports.datasetId,
      input: sourceImports.input,
    })
    .from(sourceImports)
    .where(
      and(
        eq(sourceImports.id, schedule.payload.sourceImportId),
        eq(sourceImports.accountId, accountId)
      )
    )
    .limit(1)
  const input = sourceImport && isObjectRecord(sourceImport.input) ? sourceImport.input : {}
  return sourceImport?.provider === 'OVERTURE' &&
    sourceImport.regionId &&
    sourceImport.datasetId &&
    typeof input.theme === 'string' &&
    typeof input.type === 'string'
    ? null
    : {
        code: 'INVALID_SCHEDULE_TARGET',
        message: 'Select an Overture import with a saved region and dataset.',
      }
}

operationsRoute.post('/operations/schedules/:id/run', async (c) => {
  const accountId = c.get('ownerId')
  const id = c.req.param('id')
  const idempotencyKey = c.req.header('Idempotency-Key')
  if (!idempotencyKey || !z.string().uuid().safeParse(idempotencyKey).success) {
    return c.json(
      {
        error: {
          code: 'IDEMPOTENCY_KEY_REQUIRED',
          message: 'Idempotency-Key must be a UUID.',
        },
      },
      400
    )
  }

  const retryAfter = await consumeDashboardRateLimit(`schedule-run:${accountId}`)
  if (retryAfter) {
    c.header('Retry-After', String(retryAfter))
    return c.json(
      { error: { code: 'RATE_LIMITED', message: 'Too many manual schedule runs.' } },
      429
    )
  }

  const result = await admitScheduledOperationRun({
    scheduleId: id,
    accountId,
    trigger: 'manual',
    idempotencyKey,
  })

  if (result.kind === 'not-found') return notFound(c, 'Schedule not found')
  if (result.kind === 'invalid') {
    return c.json({ error: result.error }, 409)
  }
  return c.json({ data: result }, result.replayed ? 200 : 202)
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
  return c.json(
    {
      data: {
        token,
        expiresAt: expiresAt.toISOString(),
        nodeName: parsed.data.name,
      },
    },
    201
  )
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
  const sourceDenial = await resolvedSourceDenial(c, parsed.data.sourceUrl)
  if (sourceDenial) return sourceDenial
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
      valhallaImage: env.VALHALLA_BUILDER_IMAGES[0]!,
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
    return c.json(
      {
        error: {
          code: 'ARTIFACT_REQUIRED',
          message: 'A successful routing graph artifact is required before activation.',
        },
      },
      409
    )
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
  const sourceDenial = await resolvedSourceDenial(c, parsed.data.sourceUrl)
  if (sourceDenial) return sourceDenial
  const routingDenial = await managedPlanGateResponse(c, 'routingBuilds')
  if (routingDenial) return routingDenial
  if (parsed.data.engine === 'planetiler_overture') {
    return c.json(
      {
        error: {
          code: 'OVERTURE_BASEMAP_NOT_IMPLEMENTED',
          message:
            'Overture basemap builds are modeled but not enabled until the Overture layer profile is implemented.',
        },
      },
      409
    )
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
      planetilerImage: env.PLANETILER_BUILDER_IMAGES[0]!,
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
    return c.json(
      {
        error: {
          code: 'ARTIFACT_REQUIRED',
          message: 'A successful basemap artifact is required before activation.',
        },
      },
      409
    )
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
    return c.json(
      {
        error: {
          code: 'BASEMAP_RELEASE_NOT_ACTIVE',
          message: 'Only an active basemap release can be promoted to primary.',
        },
      },
      409
    )
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

operationsRoute.get('/operations/geocoding-builds', async (c) => {
  const accountId = c.get('ownerId')
  const builds = await db
    .select()
    .from(geocodingBuilds)
    .where(and(eq(geocodingBuilds.accountId, accountId), isNull(geocodingBuilds.deletedAt)))
    .orderBy(desc(geocodingBuilds.updatedAt))
    .limit(100)
  return c.json({ data: builds })
})

operationsRoute.post('/operations/geocoding-builds', async (c) => {
  const accountId = c.get('ownerId')
  const parsed = geocodingBuildSchema.safeParse(await c.req.json())
  if (!parsed.success) return validationError(c, parsed.error)

  if (parsed.data.activationWorkerNodeId) {
    const worker = await findWorkerNode(accountId, parsed.data.activationWorkerNodeId)
    if (!worker) return notFound(c, 'Activation worker node not found')
    const capabilityError = validateWorkerCapability(worker, 'pelias_activation', 'serving')
    if (capabilityError) return c.json({ error: capabilityError }, 409)
  }

  const [created] = await db
    .insert(geocodingBuilds)
    .values({
      accountId,
      name: parsed.data.name,
      sourceUrl: parsed.data.sourceUrl,
      sourceDate: parsed.data.sourceDate ? new Date(parsed.data.sourceDate) : null,
      sourceChecksumSha256: parsed.data.sourceChecksumSha256.toLowerCase(),
      peliasDockerCommit: parsed.data.peliasDockerCommit,
      profile: parsed.data.profile,
      profileVersion: parsed.data.profileVersion,
      indexName: parsed.data.indexName,
      activationWorkerNodeId: parsed.data.activationWorkerNodeId ?? null,
      status: 'external_build',
      config: parsed.data.config,
    })
    .returning()
  await db.insert(geocodingBuildLogs).values({
    buildId: created!.id,
    message: 'External Pelias build registered',
    metadata: {
      profile: parsed.data.profile,
      profileVersion: parsed.data.profileVersion,
      sourceChecksumSha256: parsed.data.sourceChecksumSha256.toLowerCase(),
      peliasDockerCommit: parsed.data.peliasDockerCommit,
    },
  })
  return c.json({ data: created }, 201)
})

operationsRoute.get('/operations/geocoding-builds/:id', async (c) => {
  const accountId = c.get('ownerId')
  const id = c.req.param('id')
  const [build] = await db
    .select()
    .from(geocodingBuilds)
    .where(
      and(
        eq(geocodingBuilds.id, id),
        eq(geocodingBuilds.accountId, accountId),
        isNull(geocodingBuilds.deletedAt)
      )
    )
    .limit(1)
  if (!build) return notFound(c, 'Geocoding build not found')
  const [artifacts, releases, logs] = await Promise.all([
    db
      .select()
      .from(geocodingArtifacts)
      .where(eq(geocodingArtifacts.buildId, id))
      .orderBy(desc(geocodingArtifacts.createdAt)),
    db
      .select()
      .from(geocodingReleases)
      .where(eq(geocodingReleases.buildId, id))
      .orderBy(desc(geocodingReleases.createdAt)),
    db
      .select()
      .from(geocodingBuildLogs)
      .where(eq(geocodingBuildLogs.buildId, id))
      .orderBy(desc(geocodingBuildLogs.createdAt))
      .limit(200),
  ])
  return c.json({ data: { build, artifacts, releases, logs } })
})

operationsRoute.post('/operations/geocoding-builds/:id/artifacts', async (c) => {
  const accountId = c.get('ownerId')
  const buildId = c.req.param('id')
  const parsed = geocodingArtifactSchema.safeParse(await c.req.json())
  if (!parsed.success) return validationError(c, parsed.error)
  const [build] = await db
    .select({ id: geocodingBuilds.id })
    .from(geocodingBuilds)
    .where(
      and(
        eq(geocodingBuilds.id, buildId),
        eq(geocodingBuilds.accountId, accountId),
        isNull(geocodingBuilds.deletedAt)
      )
    )
    .limit(1)
  if (!build) return notFound(c, 'Geocoding build not found')

  let storageObjectId = parsed.data.storageObjectId ?? null
  if (storageObjectId) {
    const [object] = await db
      .select({ id: storageObjects.id, accountId: storageObjects.accountId })
      .from(storageObjects)
      .where(and(eq(storageObjects.id, storageObjectId), isNull(storageObjects.deletedAt)))
      .limit(1)
    if (!object || object.accountId !== accountId) {
      return c.json(
        { error: { code: 'INVALID_STORAGE_OBJECT', message: 'Storage object not found.' } },
        409
      )
    }
  } else if (parsed.data.storage) {
    const requiredPrefix = `accounts/${accountId}/geocoding/${buildId}/`
    if (!parsed.data.storage.key.startsWith(requiredPrefix)) {
      return c.json(
        {
          error: {
            code: 'INVALID_STORAGE_KEY',
            message: 'Artifact storage key is outside the account and build namespace.',
          },
        },
        409
      )
    }
    const provider = getStorage()
    const providerInfo = provider.getInfo()
    if (
      providerInfo.provider !== parsed.data.storage.provider ||
      providerInfo.bucket !== parsed.data.storage.bucket
    ) {
      return c.json(
        {
          error: {
            code: 'STORAGE_PROVIDER_MISMATCH',
            message: 'Artifact storage must match the configured provider and bucket.',
          },
        },
        409
      )
    }
    const metadata = await provider.getMetadata(parsed.data.storage.key)
    if (!metadata || metadata.size !== parsed.data.size) {
      return c.json(
        {
          error: {
            code: 'ARTIFACT_NOT_VERIFIED',
            message: 'Uploaded snapshot size does not match the artifact contract.',
          },
        },
        409
      )
    }
    const [inserted] = await db
      .insert(storageObjects)
      .values({
        accountId,
        provider: parsed.data.storage.provider,
        bucket: parsed.data.storage.bucket,
        storageKey: parsed.data.storage.key,
        fileName: parsed.data.fileName,
        contentType: parsed.data.storage.contentType,
        size: parsed.data.size,
        contentHash: parsed.data.checksumSha256.toLowerCase(),
        resourceType: 'geocoding_build',
        resourceId: buildId,
        artifactKind: 'elasticsearch_snapshot',
      })
      .onConflictDoNothing()
      .returning({ id: storageObjects.id })
    const [object] = inserted
      ? [inserted]
      : await db
          .select({ id: storageObjects.id })
          .from(storageObjects)
          .where(
            and(
              eq(storageObjects.accountId, accountId),
              eq(storageObjects.provider, parsed.data.storage.provider),
              eq(storageObjects.bucket, parsed.data.storage.bucket),
              eq(storageObjects.storageKey, parsed.data.storage.key),
              eq(storageObjects.resourceType, 'geocoding_build'),
              eq(storageObjects.resourceId, buildId),
              eq(storageObjects.size, parsed.data.size),
              eq(storageObjects.contentHash, parsed.data.checksumSha256.toLowerCase()),
              isNull(storageObjects.deletedAt)
            )
          )
          .limit(1)
    if (!object) {
      return c.json(
        {
          error: {
            code: 'STORAGE_OBJECT_CONFLICT',
            message: 'Storage key is already owned by another tenant or artifact.',
          },
        },
        409
      )
    }
    storageObjectId = object.id
  }

  const [artifact] = await db.transaction(async (tx) => {
    const created = await tx
      .insert(geocodingArtifacts)
      .values({
        accountId,
        buildId,
        storageObjectId,
        status: 'available',
        fileName: parsed.data.fileName,
        size: parsed.data.size,
        checksumSha256: parsed.data.checksumSha256.toLowerCase(),
        snapshotName: parsed.data.snapshotName,
        snapshotRepository: parsed.data.snapshotRepository,
        manifest: parsed.data.manifest,
      })
      .returning()
    await tx
      .update(geocodingBuilds)
      .set({
        status: 'succeeded',
        progress: 100,
        completedAt: new Date(),
        output: {
          artifactId: created[0]?.id,
          snapshotName: parsed.data.snapshotName,
          checksumSha256: parsed.data.checksumSha256.toLowerCase(),
        },
        updatedAt: new Date(),
      })
      .where(eq(geocodingBuilds.id, buildId))
    await tx.insert(geocodingBuildLogs).values({
      buildId,
      message: 'Elasticsearch snapshot artifact verified',
      metadata: {
        artifactId: created[0]?.id,
        size: parsed.data.size,
        checksumSha256: parsed.data.checksumSha256.toLowerCase(),
      },
    })
    return created
  })
  return c.json({ data: artifact }, 201)
})

operationsRoute.post('/operations/geocoding-builds/:id/releases', async (c) => {
  const accountId = c.get('ownerId')
  const buildId = c.req.param('id')
  const parsed = geocodingReleaseSchema.safeParse(await c.req.json())
  if (!parsed.success) return validationError(c, parsed.error)
  const [artifact] = await db
    .select()
    .from(geocodingArtifacts)
    .where(
      and(
        eq(geocodingArtifacts.id, parsed.data.artifactId),
        eq(geocodingArtifacts.buildId, buildId),
        eq(geocodingArtifacts.accountId, accountId),
        eq(geocodingArtifacts.status, 'available')
      )
    )
    .limit(1)
  if (!artifact) return notFound(c, 'Available geocoding artifact not found')

  const [release] = await db
    .insert(geocodingReleases)
    .values({
      accountId,
      buildId,
      artifactId: artifact.id,
      name: parsed.data.name,
      version: parsed.data.version,
      status: 'ready',
      sourceDataVersions: parsed.data.sourceDataVersions,
      manifest: {
        ...parsed.data.manifest,
        snapshotName: artifact.snapshotName,
        checksumSha256: artifact.checksumSha256,
      },
      publishedAt: new Date(),
    })
    .returning()
  return c.json({ data: release }, 201)
})

operationsRoute.post('/operations/geocoding-releases/:id/activate', async (c) => {
  const accountId = c.get('ownerId')
  const id = c.req.param('id')
  const [release] = await db
    .select()
    .from(geocodingReleases)
    .where(and(eq(geocodingReleases.id, id), eq(geocodingReleases.accountId, accountId)))
    .limit(1)
  if (!release?.buildId || release.status !== 'ready') {
    return c.json(
      { error: { code: 'RELEASE_NOT_READY', message: 'A ready release is required.' } },
      409
    )
  }
  const [build] = await db
    .select()
    .from(geocodingBuilds)
    .where(eq(geocodingBuilds.id, release.buildId))
    .limit(1)
  if (!build?.activationWorkerNodeId) {
    return c.json(
      {
        error: {
          code: 'ACTIVATION_WORKER_REQUIRED',
          message: 'Assign a Pelias activation worker before requesting activation.',
        },
      },
      409
    )
  }
  await db.transaction(async (tx) => {
    await tx
      .update(geocodingReleases)
      .set({ activationStatus: 'activation_requested', updatedAt: new Date() })
      .where(eq(geocodingReleases.id, id))
    await tx
      .update(geocodingBuilds)
      .set({ activationStatus: 'activation_requested', updatedAt: new Date() })
      .where(eq(geocodingBuilds.id, release.buildId!))
  })
  return c.json({ data: { ...release, activationStatus: 'activation_requested' } })
})

operationsRoute.post('/operations/geocoding-releases/:id/promote-primary', async (c) => {
  const accountId = c.get('ownerId')
  const id = c.req.param('id')
  const [release] = await db
    .select()
    .from(geocodingReleases)
    .where(and(eq(geocodingReleases.id, id), eq(geocodingReleases.accountId, accountId)))
    .limit(1)
  if (!release || release.activationStatus !== 'active') {
    return c.json(
      {
        error: {
          code: 'GEOCODING_RELEASE_NOT_ACTIVE',
          message: 'Only an active geocoding release can be promoted.',
        },
      },
      409
    )
  }
  const [updated] = await db.transaction(async (tx) => {
    await tx
      .update(geocodingReleases)
      .set({ isPrimary: false, updatedAt: new Date() })
      .where(eq(geocodingReleases.accountId, accountId))
    return tx
      .update(geocodingReleases)
      .set({ isPrimary: true, updatedAt: new Date() })
      .where(eq(geocodingReleases.id, id))
      .returning()
  })
  return c.json({ data: updated })
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
  return c.json({ data: serializeCustomDomain(created!) }, 201)
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
  return c.json({ data: serializeCustomDomain(updated!) })
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
    .limit(OPERATIONS_COLLECTION_LIMIT + 1)
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
    const response = await withOutboundResponse(
      validatedEndpoint,
      outboundOptions({ timeoutMs: 3000 }),
      async (result) => {
        result.resume()
        return {
          ok: Boolean(result.statusCode && result.statusCode >= 200 && result.statusCode < 300),
          status: result.statusCode ?? 502,
          statusText: result.statusMessage ?? '',
        }
      }
    )
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
  },
  send: NotificationHttpSender = sendOutboundNotification
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

  const response = await send(target, JSON.stringify(body), providerHosts(channel.provider))
  return {
    delivered: response.ok,
    adapter: channel.provider,
    status: response.status,
    payload: body,
    message: response.ok ? 'Notification endpoint accepted test payload' : response.statusText,
  }
}

export type NotificationHttpSender = (
  target: string,
  body: string,
  allowedHosts?: readonly string[]
) => Promise<{ ok: boolean; status: number; statusText: string }>

async function sendOutboundNotification(
  target: string,
  body: string,
  allowedHosts?: readonly string[]
) {
  return withOutboundResponse(
    target,
    outboundOptions({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': String(Buffer.byteLength(body)),
      },
      body,
      allowedHosts,
      timeoutMs: 10_000,
    }),
    async (response) => {
      response.resume()
      return {
        ok: Boolean(response.statusCode && response.statusCode >= 200 && response.statusCode < 300),
        status: response.statusCode ?? 502,
        statusText: response.statusMessage ?? '',
      }
    }
  )
}

function providerHosts(provider: string) {
  if (provider === 'slack') return slackWebhookHosts
  if (provider === 'discord') return discordWebhookHosts
  return undefined
}

function outboundOptions(
  options: Omit<OutboundRequestOptions, 'privateAllowlist'> = {}
): OutboundRequestOptions {
  return {
    ...options,
    privateAllowlist: env.OUTBOUND_PRIVATE_ALLOWLIST,
    maxRedirects: 0,
  }
}

async function resolvedSourceDenial(c: Context<AuthEnv>, sourceUrl: string) {
  try {
    await resolveOutboundTarget(sourceUrl, {
      privateAllowlist: env.OUTBOUND_PRIVATE_ALLOWLIST,
    })
    return null
  } catch (err) {
    if (!(err instanceof OutboundRequestError)) throw err
    return c.json(
      {
        error: {
          code: 'SOURCE_URL_REJECTED',
          message: err.message,
        },
      },
      400
    )
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
  const checks: Array<{ host: string; status: 'matched' | 'not_matched' }> = []

  for (const candidate of candidates) {
    try {
      const records = (await resolveTxt(candidate)).map((parts) => parts.join(''))
      const matched = records.some((record) => record.includes(token))
      checks.push({ host: candidate, status: matched ? 'matched' : 'not_matched' })
      if (matched) {
        return {
          verified: true,
          checkedAt,
          method: 'TXT',
          checks,
        }
      }
    } catch {
      checks.push({ host: candidate, status: 'not_matched' })
    }
  }

  return {
    verified: false,
    checkedAt,
    method: 'TXT',
    checks,
  }
}

export function normalizeCustomDomainHost(value: string) {
  const input = value.trim().replace(/\.$/, '')
  if (input.includes('/') || input.includes(':') || input.includes('@') || input.includes('\\')) {
    throw new Error('Host must be a domain name without protocol, port, credentials, or path')
  }
  const host = domainToASCII(input).toLowerCase()
  const labels = host.split('.')
  if (
    !host ||
    host.length > 253 ||
    isIP(host) ||
    labels.length < 2 ||
    labels.some(
      (label) => !label || label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label)
    )
  ) {
    throw new Error('Host must be a valid multi-label domain name')
  }
  if (
    ['localhost', 'local', 'internal', 'home', 'lan', 'invalid', 'test'].some(
      (suffix) => host === suffix || host.endsWith(`.${suffix}`)
    )
  ) {
    throw new Error('Host must be a public domain name')
  }
  return host
}

function serializeCustomDomain(domain: typeof customDomains.$inferSelect) {
  return {
    id: domain.id,
    accountId: domain.accountId,
    resourceType: domain.resourceType,
    resourceId: domain.resourceId,
    host: domain.host,
    path: domain.path,
    status: domain.status,
    verificationToken: domain.verificationToken,
    tlsEnabled: domain.tlsEnabled,
    createdAt: domain.createdAt,
    updatedAt: domain.updatedAt,
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
      .where(and(eq(rootAgentNodeTokens.workerNodeId, id), isNull(rootAgentNodeTokens.revokedAt))),
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

type OperationsTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

type ScheduleAdmissionResult =
  | { kind: 'not-found' }
  | { kind: 'invalid'; error: { code: string; message: string } }
  | {
      kind: 'queued'
      schedule: typeof scheduledOperations.$inferSelect
      run: typeof scheduledOperationRuns.$inferSelect
      job: typeof processingJobs.$inferSelect | null
      replayed: boolean
    }

export async function admitScheduledOperationRun(params: {
  scheduleId: string
  accountId?: string
  trigger: 'manual' | 'scheduled'
  idempotencyKey?: string
  now?: Date
}): Promise<ScheduleAdmissionResult> {
  const now = params.now ?? new Date()
  return db.transaction(async (tx) => {
    const [schedule] = await tx
      .select()
      .from(scheduledOperations)
      .where(
        and(
          eq(scheduledOperations.id, params.scheduleId),
          params.accountId ? eq(scheduledOperations.accountId, params.accountId) : undefined,
          isNull(scheduledOperations.deletedAt)
        )
      )
      .limit(1)
      .for('update')
    if (!schedule) return { kind: 'not-found' as const }
    if (schedule.status !== 'active') {
      return {
        kind: 'invalid' as const,
        error: { code: 'SCHEDULE_PAUSED', message: 'Paused schedules cannot be run.' },
      }
    }
    if (schedule.kind === 'custom_command') {
      return {
        kind: 'invalid' as const,
        error: {
          code: 'UNSUPPORTED_SCHEDULE_KIND',
          message: 'Custom command schedules are retired.',
        },
      }
    }

    const scheduledFor =
      params.trigger === 'scheduled'
        ? schedule.nextRunAt && schedule.nextRunAt <= now
          ? schedule.nextRunAt
          : null
        : now
    if (!scheduledFor) {
      return {
        kind: 'invalid' as const,
        error: { code: 'SCHEDULE_NOT_DUE', message: 'Schedule is not due.' },
      }
    }
    const idempotencyKey =
      params.idempotencyKey ?? `scheduled:${scheduledFor.toISOString()}`
    const [existing] = await tx
      .select()
      .from(scheduledOperationRuns)
      .where(
        and(
          eq(scheduledOperationRuns.scheduleId, schedule.id),
          eq(scheduledOperationRuns.idempotencyKey, idempotencyKey)
        )
      )
      .limit(1)
    if (existing) {
      const [job] = existing.processingJobId
        ? await tx
            .select()
            .from(processingJobs)
            .where(eq(processingJobs.id, existing.processingJobId))
            .limit(1)
        : []
      return {
        kind: 'queued' as const,
        schedule,
        run: existing,
        job: job ?? null,
        replayed: true,
      }
    }

    const [active] = await tx
      .select({ id: processingJobs.id })
      .from(scheduledOperationRuns)
      .innerJoin(processingJobs, eq(scheduledOperationRuns.processingJobId, processingJobs.id))
      .where(
        and(
          eq(scheduledOperationRuns.scheduleId, schedule.id),
          inArray(processingJobs.status, ['PENDING', 'PROCESSING'])
        )
      )
      .limit(1)
    if (active) {
      if (params.trigger === 'manual') {
        return {
          kind: 'invalid' as const,
          error: { code: 'SCHEDULE_RUN_ACTIVE', message: 'This schedule already has an active run.' },
        }
      }
      const [run] = await tx
        .insert(scheduledOperationRuns)
        .values({
          scheduleId: schedule.id,
          accountId: schedule.accountId,
          trigger: 'scheduled',
          scheduledFor,
          idempotencyKey,
          disposition: 'SKIPPED',
          reason: 'previous_run_active',
        })
        .returning()
      const [updated] = await tx
        .update(scheduledOperations)
        .set({
          nextRunAt: nextScheduleRunAt('active', schedule.cron, schedule.timezone, now),
          updatedAt: now,
        })
        .where(eq(scheduledOperations.id, schedule.id))
        .returning()
      return {
        kind: 'queued' as const,
        schedule: updated!,
        run: run!,
        job: null,
        replayed: false,
      }
    }

    let job: typeof processingJobs.$inferSelect
    try {
      job = await queueScheduledTenantAction(tx, schedule)
    } catch (error) {
      if (!isScheduleAdmissionError(error)) throw error
      const code = scheduleAdmissionCode(error)
      if (params.trigger === 'manual') {
        return {
          kind: 'invalid' as const,
          error: { code, message: errorMessage(error) },
        }
      }
      const [run] = await tx
        .insert(scheduledOperationRuns)
        .values({
          scheduleId: schedule.id,
          accountId: schedule.accountId,
          trigger: 'scheduled',
          scheduledFor,
          idempotencyKey,
          disposition: 'REJECTED',
          reason: code.slice(0, 128),
        })
        .returning()
      const [updated] = await tx
        .update(scheduledOperations)
        .set({
          nextRunAt: nextScheduleRunAt('active', schedule.cron, schedule.timezone, now),
          updatedAt: now,
        })
        .where(eq(scheduledOperations.id, schedule.id))
        .returning()
      return {
        kind: 'queued' as const,
        schedule: updated!,
        run: run!,
        job: null,
        replayed: false,
      }
    }

    const [run] = await tx
      .insert(scheduledOperationRuns)
      .values({
        scheduleId: schedule.id,
        accountId: schedule.accountId,
        trigger: params.trigger,
        scheduledFor,
        idempotencyKey,
        disposition: 'QUEUED',
        processingJobId: job.id,
      })
      .returning()
    const [updated] = await tx
      .update(scheduledOperations)
      .set({
        lastRunAt: now,
        nextRunAt:
          params.trigger === 'scheduled'
            ? nextScheduleRunAt('active', schedule.cron, schedule.timezone, now)
            : schedule.nextRunAt,
        updatedAt: now,
      })
      .where(eq(scheduledOperations.id, schedule.id))
      .returning()
    return {
      kind: 'queued' as const,
      schedule: updated!,
      run: run!,
      job,
      replayed: false,
    }
  })
}

export async function dispatchDueScheduledOperations(params: {
  now?: Date
  limit?: number
} = {}) {
  const now = params.now ?? new Date()
  const limit = Math.max(1, Math.min(params.limit ?? 25, 100))
  await repairUninitializedSchedules(now, limit)
  await db
    .update(eventOutbox)
    .set({
      status: 'ARCHIVED',
      lastError: 'Generic schedule events are retired; actions are admitted directly.',
      updatedAt: now,
    })
    .where(
      and(
        eq(eventOutbox.eventName, 'scheduled_operation.run_requested'),
        inArray(eventOutbox.status, ['PENDING', 'FAILED'])
      )
    )

  const due = await db
    .select({ id: scheduledOperations.id })
    .from(scheduledOperations)
    .where(
      and(
        eq(scheduledOperations.status, 'active'),
        isNull(scheduledOperations.deletedAt),
        inArray(scheduledOperations.kind, ['tileset_rebuild', 'source_import']),
        lte(scheduledOperations.nextRunAt, now)
      )
    )
    .orderBy(asc(scheduledOperations.nextRunAt), asc(scheduledOperations.id))
    .limit(limit)

  const results = []
  for (const schedule of due) {
    results.push(
      await admitScheduledOperationRun({
        scheduleId: schedule.id,
        trigger: 'scheduled',
        now,
      })
    )
  }
  return {
    considered: due.length,
    queued: results.filter(
      (result) => result.kind === 'queued' && result.run.disposition === 'QUEUED'
    ).length,
    skipped: results.filter(
      (result) => result.kind === 'queued' && result.run.disposition === 'SKIPPED'
    ).length,
    rejected: results.filter(
      (result) => result.kind === 'queued' && result.run.disposition === 'REJECTED'
    ).length,
  }
}

async function repairUninitializedSchedules(now: Date, limit: number) {
  const rows = await db
    .select()
    .from(scheduledOperations)
    .where(
      and(
        eq(scheduledOperations.status, 'active'),
        isNull(scheduledOperations.nextRunAt),
        isNull(scheduledOperations.deletedAt)
      )
    )
    .limit(limit)
  for (const schedule of rows) {
    const nextRunAt =
      schedule.kind === 'custom_command'
        ? null
        : nextScheduleRunAt('active', schedule.cron, schedule.timezone, now)
    await db
      .update(scheduledOperations)
      .set({
        status: nextRunAt ? 'active' : 'paused',
        nextRunAt,
        updatedAt: now,
      })
      .where(
        and(
          eq(scheduledOperations.id, schedule.id),
          isNull(scheduledOperations.nextRunAt)
        )
      )
  }
}

class ScheduleActionError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message)
  }
}

function isScheduleAdmissionError(error: unknown) {
  if (error instanceof ScheduleActionError) return true
  if (!error || typeof error !== 'object') return false
  return (
    'code' in error &&
    (error.code === 'ACTIVE_JOB_LIMIT' || error.code === 'ACTIVE_TILESET_BUILD')
  )
}

function scheduleAdmissionCode(error: unknown) {
  return error instanceof ScheduleActionError
    ? error.code
    : error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
      ? error.code
      : 'SCHEDULE_ADMISSION_REJECTED'
}

async function queueScheduledTenantAction(
  tx: OperationsTransaction,
  schedule: typeof scheduledOperations.$inferSelect
) {
  return schedule.kind === 'tileset_rebuild'
    ? queueScheduledTilesetRebuild(tx, schedule)
    : queueScheduledSourceImport(tx, schedule)
}

async function queueScheduledTilesetRebuild(
  tx: OperationsTransaction,
  schedule: typeof scheduledOperations.$inferSelect
) {
  const payload = isObjectRecord(schedule.payload) ? schedule.payload : {}
  const tilesetId = typeof payload.tilesetId === 'string' ? payload.tilesetId : ''
  const [tileset] = await tx
    .select()
    .from(tilesets)
    .where(
      and(
        eq(tilesets.id, tilesetId),
        eq(tilesets.accountId, schedule.accountId),
        isNull(tilesets.deletedAt)
      )
    )
    .limit(1)
  if (!tileset) throw new ScheduleActionError('INVALID_SCHEDULE_TARGET', 'Tileset not found.')
  const [upload] = await tx
    .select()
    .from(uploads)
    .where(
      and(
        eq(uploads.accountId, schedule.accountId),
        eq(uploads.linkedTilesetId, tileset.id),
        isNull(uploads.deletedAt)
      )
    )
    .orderBy(desc(uploads.createdAt))
    .limit(1)
  if (!upload?.storageObjectId) {
    throw new ScheduleActionError('UPLOAD_NOT_FOUND', 'No original upload is available.')
  }
  const [storageObject] = await tx
    .select()
    .from(storageObjects)
    .where(
      and(
        eq(storageObjects.id, upload.storageObjectId),
        eq(storageObjects.accountId, schedule.accountId),
        isNull(storageObjects.deletedAt)
      )
    )
    .limit(1)
  if (!storageObject) {
    throw new ScheduleActionError('UPLOAD_ARTIFACT_NOT_FOUND', 'Upload artifact was not found.')
  }
  const format = detectUploadFormat(
    storageObject.fileName ?? upload.originalFileName,
    upload.contentType ?? storageObject.contentType ?? ''
  )
  if (!format) {
    throw new ScheduleActionError('UNSUPPORTED_UPLOAD', 'Original upload format is unsupported.')
  }
  const job = await createProcessingJobInTransaction(
    {
      accountId: schedule.accountId,
      type: 'tileset.process_upload',
      targetTilesetId: tileset.id,
      input: {
        tilesetId: tileset.id,
        uploadId: upload.id,
        storageObjectId: storageObject.id,
        uploadKey: storageObject.storageKey,
        format,
        options: {
          minZoom: tileset.minZoom ?? 0,
          maxZoom: tileset.maxZoom ?? 14,
        },
      },
    },
    tx
  )
  await tx
    .update(tilesets)
    .set({ status: 'BUILDING', buildJobId: job.id, updatedAt: new Date() })
    .where(eq(tilesets.id, tileset.id))
  await tx
    .update(uploads)
    .set({ status: 'VALIDATING', linkedTilesetId: tileset.id })
    .where(eq(uploads.id, upload.id))
  await logProcessingJob(job.id, 'Scheduled tileset rebuild queued', {}, tx)
  await enqueueOutboxEvent(
    {
      eventName: 'tileset.build.requested',
      payload: {
        accountId: schedule.accountId,
        tilesetId: tileset.id,
        jobId: job.id,
        sourceResourceType: 'upload',
        sourceResourceId: upload.id,
        options: {
          minZoom: tileset.minZoom ?? 0,
          maxZoom: tileset.maxZoom ?? 14,
        },
      },
    },
    tx
  )
  return job
}

async function queueScheduledSourceImport(
  tx: OperationsTransaction,
  schedule: typeof scheduledOperations.$inferSelect
) {
  const payload = isObjectRecord(schedule.payload) ? schedule.payload : {}
  const sourceImportId =
    typeof payload.sourceImportId === 'string' ? payload.sourceImportId : ''
  const [reference] = await tx
    .select()
    .from(sourceImports)
    .where(
      and(
        eq(sourceImports.id, sourceImportId),
        eq(sourceImports.accountId, schedule.accountId)
      )
    )
    .limit(1)
  if (
    !reference ||
    reference.provider !== 'OVERTURE' ||
    !reference.datasetId ||
    !reference.regionId
  ) {
    throw new ScheduleActionError(
      'INVALID_SCHEDULE_TARGET',
      'Overture import reference is incomplete.'
    )
  }
  const input = isObjectRecord(reference.input) ? reference.input : {}
  const theme = typeof input.theme === 'string' ? input.theme : ''
  const type = typeof input.type === 'string' ? input.type : ''
  const catalogEntry = findOvertureType(theme, type)
  if (!catalogEntry) {
    throw new ScheduleActionError('INVALID_IMPORT_TYPE', 'Overture import type is unsupported.')
  }
  const [region] = await tx
    .select()
    .from(savedRegions)
    .where(
      and(
        eq(savedRegions.id, reference.regionId),
        eq(savedRegions.accountId, schedule.accountId),
        isNull(savedRegions.deletedAt)
      )
    )
    .limit(1)
  const [dataset] = await tx
    .select({ id: datasets.id })
    .from(datasets)
    .where(
      and(
        eq(datasets.id, reference.datasetId),
        eq(datasets.accountId, schedule.accountId),
        isNull(datasets.deletedAt)
      )
    )
    .limit(1)
  if (!region || !dataset) {
    throw new ScheduleActionError('INVALID_SCHEDULE_TARGET', 'Import region or dataset was removed.')
  }
  const estimate = buildOvertureImportEstimate({
    bbox: region.bbox,
    maxFeatures: Number(process.env.SOURCE_IMPORT_MAX_FEATURES ?? 50_000),
    timeoutMs: Number(process.env.SOURCE_IMPORT_TIMEOUT_MS ?? 900_000),
  })
  const job = await createProcessingJobInTransaction(
    {
      accountId: schedule.accountId,
      type: 'source.import_overture',
      targetTilesetId: reference.targetTilesetId ?? undefined,
      input: {
        provider: 'OVERTURE',
        datasetId: dataset.id,
        targetTilesetId: reference.targetTilesetId ?? undefined,
        regionId: region.id,
        bbox: region.bbox,
        estimate,
        sourceConnectionId: reference.sourceConnectionId ?? undefined,
        theme,
        type,
        catalog: {
          label: catalogEntry.label,
          geometry: catalogEntry.geometry,
          defaultLayerId: catalogEntry.defaultLayerId,
        },
        refresh: true,
      },
    },
    tx
  )
  const [sourceImport] = await tx
    .insert(sourceImports)
    .values({
      accountId: schedule.accountId,
      provider: 'OVERTURE',
      sourceName: reference.sourceName,
      sourceConnectionId: reference.sourceConnectionId,
      regionId: region.id,
      datasetId: dataset.id,
      targetTilesetId: reference.targetTilesetId,
      processingJobId: job.id,
      input: job.input,
    })
    .returning()
  await logProcessingJob(
    job.id,
    'Scheduled Overture dataset refresh queued',
    { metadata: { importId: sourceImport!.id, datasetId: dataset.id, regionId: region.id } },
    tx
  )
  await enqueueOutboxEvent(
    {
      eventName: 'source.import.requested',
      payload: {
        importId: sourceImport!.id,
        accountId: schedule.accountId,
        jobId: job.id,
        datasetId: dataset.id,
        targetTilesetId: reference.targetTilesetId ?? undefined,
        provider: 'OVERTURE',
      },
    },
    tx
  )
  return job
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
      message: 'Serving worker must report a configured runtime supervisor before deployment.',
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

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
