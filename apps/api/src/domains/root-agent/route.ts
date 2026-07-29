import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { Hono, type Context } from 'hono'
import { and, eq, gt, inArray, isNull, lt } from 'drizzle-orm'
import { z } from 'zod'
import {
  accounts,
  db,
  basemapArtifacts,
  basemapBuildLogs,
  basemapBuilds,
  basemapReleases,
  geocodingArtifacts,
  geocodingBuildLogs,
  geocodingBuilds,
  geocodingReleases,
  rootAgentArtifactUploadSessions,
  rootAgentJobClaims,
  rootAgentNodeTokens,
  rootAgentRegistrationTokens,
  runtimeInstallations,
  routingGraphArtifacts,
  routingGraphBuildLogs,
  routingGraphBuilds,
  routingGraphReleases,
  storageObjects,
  workerNodes,
} from '@planisfy/database'
import { getStorage } from '@planisfy/storage'
import {
  canApplyActivationTransition,
  canApplyBuildTransition,
  isTerminalBuildStatus,
} from './protocol'

type AgentEnv = {
  Variables: {
    accountId: string
    workerNodeId: string
  }
}

export const rootAgentRoute = new Hono<AgentEnv>()

const ROOT_AGENT_CLAIM_HEADER = 'x-planisfy-root-agent-claim-id'
const ROOT_AGENT_CLAIM_LEASE_MS = 2 * 60 * 1000
const ROOT_AGENT_UPLOAD_SESSION_MS = 7 * 24 * 60 * 60 * 1000

const registerSchema = z.object({
  registrationToken: z.string().min(1),
  hostname: z.string().max(255).optional(),
  capabilities: z.array(z.string().min(1).max(128)).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
})

const buildStateSchema = z.object({
  status: z.enum([
    'preparing',
    'downloading_source',
    'building_admins',
    'building_tiles',
    'packaging',
    'uploading',
    'succeeded',
    'failed',
    'canceled',
  ]),
  progress: z.number().int().min(0).max(100).optional(),
  message: z.string().max(4000).optional(),
  output: z.record(z.string(), z.unknown()).optional(),
  errorCode: z.string().max(128).optional(),
  errorMessage: z.string().max(4000).optional(),
})

const activationStateSchema = z.object({
  activationStatus: z.enum(['active', 'failed']),
  message: z.string().max(4000).optional(),
  output: z.record(z.string(), z.unknown()).optional(),
  errorMessage: z.string().max(4000).optional(),
})

const logSchema = z.object({
  entries: z
    .array(
      z.object({
        level: z.string().min(1).max(16).default('info'),
        message: z.string().min(1).max(20_000),
        metadata: z.unknown().optional(),
      })
    )
    .min(1)
    .max(100),
})

const artifactKindSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9._-]+$/)

const artifactUploadSessionSchema = z.object({
  idempotencyKey: z.string().uuid(),
  kind: artifactKindSchema.default('valhalla_graph'),
  fileName: z.string().min(1).max(256),
  size: z.number().int().nonnegative(),
  checksumSha256: z
    .string()
    .length(64)
    .regex(/^[a-f0-9]+$/i)
    .optional(),
  contentType: z.string().min(1).max(128).default('application/gzip'),
  manifest: z.record(z.string(), z.unknown()).default({}),
})

const artifactFinalizeSchema = z.object({
  sessionId: z.string().uuid(),
  parts: z
    .array(
      z.object({
        partNumber: z.number().int().min(1).max(10_000),
        eTag: z.string().min(1).max(256),
      })
    )
    .min(1)
    .max(10_000),
})

rootAgentRoute.post('/root-agent/register', async (c) => {
  const parsed = registerSchema.safeParse(await c.req.json())
  if (!parsed.success) return validationError(c, parsed.error)
  const registrationHash = hashToken(parsed.data.registrationToken)
  const now = new Date()

  const result = await db.transaction(async (tx) => {
    const [registration] = await tx
      .select({
        id: rootAgentRegistrationTokens.id,
        accountId: rootAgentRegistrationTokens.accountId,
        name: rootAgentRegistrationTokens.name,
        kind: rootAgentRegistrationTokens.kind,
        metadata: rootAgentRegistrationTokens.metadata,
      })
      .from(rootAgentRegistrationTokens)
      .innerJoin(accounts, eq(accounts.id, rootAgentRegistrationTokens.accountId))
      .where(
        and(
          eq(rootAgentRegistrationTokens.tokenHash, registrationHash),
          isNull(rootAgentRegistrationTokens.usedAt),
          gt(rootAgentRegistrationTokens.expiresAt, now),
          eq(accounts.lifecycleStatus, 'ACTIVE'),
          isNull(accounts.deletedAt)
        )
      )
      .for('update')
      .limit(1)
    if (!registration) return null

    const [consumed] = await tx
      .update(rootAgentRegistrationTokens)
      .set({ usedAt: now })
      .where(
        and(
          eq(rootAgentRegistrationTokens.id, registration.id),
          isNull(rootAgentRegistrationTokens.usedAt)
        )
      )
      .returning({ id: rootAgentRegistrationTokens.id })
    if (!consumed) return null

    const [node] = await tx
      .insert(workerNodes)
      .values({
        accountId: registration.accountId,
        name: registration.name,
        kind: registration.kind,
        status: 'healthy',
        validation: {
          ok: true,
          checks: [{ id: 'agent-registration', status: 'healthy' }],
        },
        metadata: {
          ...asRecord(registration.metadata),
          ...parsed.data.metadata,
          hostname: parsed.data.hostname ?? null,
          capabilities: parsed.data.capabilities,
          agentManaged: true,
        },
        lastSeenAt: now,
      })
      .returning()
    if (!node) return null

    const agentToken = `pat_${randomBytes(32).toString('base64url')}`
    await tx.insert(rootAgentNodeTokens).values({
      accountId: registration.accountId,
      workerNodeId: node.id,
      tokenHash: hashToken(agentToken),
      lastUsedAt: now,
    })
    await tx
      .update(rootAgentRegistrationTokens)
      .set({ createdWorkerNodeId: node.id })
      .where(eq(rootAgentRegistrationTokens.id, registration.id))
    return { node, agentToken }
  })

  if (!result) {
    return c.json(
      {
        error: {
          code: 'INVALID_REGISTRATION_TOKEN',
          message: 'Registration token is invalid, expired, or already used.',
        },
      },
      401
    )
  }

  return c.json({
    data: {
      workerNode: result.node,
      agentToken: result.agentToken,
    },
  })
})

rootAgentRoute.use('/root-agent/*', async (c, next) => {
  if (c.req.path === '/root-agent/register') {
    await next()
    return
  }
  const auth = await authenticateAgent(c)
  if (!auth.ok) return auth.response
  c.set('accountId', auth.accountId)
  c.set('workerNodeId', auth.workerNodeId)
  await next()
})

rootAgentRoute.post('/root-agent/heartbeat', async (c) => {
  const body = await readJsonObject(c)
  const now = new Date()
  const [node] = await db
    .update(workerNodes)
    .set({
      status: 'healthy',
      lastSeenAt: now,
      validation: {
        ok: true,
        checks: [{ id: 'agent-heartbeat', status: 'healthy' }],
      },
      metadata: { ...body, agentManaged: true },
      updatedAt: now,
    })
    .where(eq(workerNodes.id, c.get('workerNodeId')))
    .returning()
  return c.json({ data: node })
})

rootAgentRoute.post('/root-agent/claims/:id/renew', async (c) => {
  const claimId = c.req.param('id')
  if (c.req.header(ROOT_AGENT_CLAIM_HEADER) !== claimId) {
    return c.json(
      { error: { code: 'INVALID_CLAIM', message: 'Root-agent claim is required.' } },
      409
    )
  }
  const now = new Date()
  const leaseExpiresAt = new Date(now.getTime() + ROOT_AGENT_CLAIM_LEASE_MS)
  const [claim] = await db
    .update(rootAgentJobClaims)
    .set({ lastRenewedAt: now, leaseExpiresAt, updatedAt: now })
    .where(
      and(
        eq(rootAgentJobClaims.id, claimId),
        eq(rootAgentJobClaims.accountId, c.get('accountId')),
        eq(rootAgentJobClaims.workerNodeId, c.get('workerNodeId')),
        eq(rootAgentJobClaims.status, 'active'),
        gt(rootAgentJobClaims.leaseExpiresAt, now)
      )
    )
    .returning()
  if (!claim) {
    return c.json(
      { error: { code: 'CLAIM_EXPIRED', message: 'Root-agent claim has expired.' } },
      409
    )
  }
  return c.json({ data: { id: claim.id, expiresAt: claim.leaseExpiresAt.toISOString() } })
})

rootAgentRoute.get('/root-agent/jobs/next', async (c) => {
  const accountId = c.get('accountId')
  const workerNodeId = c.get('workerNodeId')
  const now = new Date()
  await expireAgentClaims(accountId, workerNodeId, now)

  const [build] = await db
    .select()
    .from(routingGraphBuilds)
    .where(
      and(
        eq(routingGraphBuilds.accountId, accountId),
        eq(routingGraphBuilds.workerNodeId, workerNodeId),
        eq(routingGraphBuilds.status, 'queued'),
        isNull(routingGraphBuilds.deletedAt)
      )
    )
    .orderBy(routingGraphBuilds.createdAt)
    .limit(1)
  if (build) {
    const result = await db.transaction(async (tx) => {
      const [claimed] = await tx
        .update(routingGraphBuilds)
        .set({ status: 'assigned', assignedAt: now, updatedAt: now })
        .where(and(eq(routingGraphBuilds.id, build.id), eq(routingGraphBuilds.status, 'queued')))
        .returning()
      if (!claimed) return null
      const claim = await createAgentClaim(tx, {
        accountId,
        workerNodeId,
        targetType: 'routing_build',
        targetId: build.id,
        phase: 'build',
        now,
      })
      return { claimed, claim }
    })
    if (result) {
      await appendLog(build.id, 'info', 'Build claimed by root agent', { workerNodeId })
      return c.json({
        data: { kind: 'routing_graph_build', build: result.claimed, claim: result.claim },
      })
    }
  }

  const [activation] = await db
    .select()
    .from(routingGraphBuilds)
    .where(
      and(
        eq(routingGraphBuilds.accountId, accountId),
        eq(routingGraphBuilds.activationWorkerNodeId, workerNodeId),
        eq(routingGraphBuilds.status, 'succeeded'),
        eq(routingGraphBuilds.activationStatus, 'activation_requested'),
        isNull(routingGraphBuilds.deletedAt)
      )
    )
    .orderBy(routingGraphBuilds.updatedAt)
    .limit(1)
  if (activation) {
    const result = await db.transaction(async (tx) => {
      const [claimed] = await tx
        .update(routingGraphBuilds)
        .set({ activationStatus: 'activating', updatedAt: now })
        .where(
          and(
            eq(routingGraphBuilds.id, activation.id),
            eq(routingGraphBuilds.activationStatus, 'activation_requested')
          )
        )
        .returning()
      if (!claimed) return null
      const claim = await createAgentClaim(tx, {
        accountId,
        workerNodeId,
        targetType: 'routing_activation',
        targetId: activation.id,
        phase: 'activation',
        now,
      })
      return { claimed, claim }
    })
    if (!result) {
      // A concurrent poll won the claim.
    } else {
      const artifacts = await db
        .select()
        .from(routingGraphArtifacts)
        .where(eq(routingGraphArtifacts.buildId, activation.id))
      await appendLog(activation.id, 'info', 'Activation claimed by root agent', {
        workerNodeId,
      })
      return c.json({
        data: {
          kind: 'routing_graph_activation',
          build: result.claimed,
          artifacts,
          claim: result.claim,
        },
      })
    }
  }

  const [basemapBuild] = await db
    .select()
    .from(basemapBuilds)
    .where(
      and(
        eq(basemapBuilds.accountId, accountId),
        eq(basemapBuilds.workerNodeId, workerNodeId),
        eq(basemapBuilds.status, 'queued'),
        isNull(basemapBuilds.deletedAt)
      )
    )
    .orderBy(basemapBuilds.createdAt)
    .limit(1)
  if (basemapBuild) {
    const result = await db.transaction(async (tx) => {
      const [claimed] = await tx
        .update(basemapBuilds)
        .set({ status: 'assigned', assignedAt: now, updatedAt: now })
        .where(and(eq(basemapBuilds.id, basemapBuild.id), eq(basemapBuilds.status, 'queued')))
        .returning()
      if (!claimed) return null
      const claim = await createAgentClaim(tx, {
        accountId,
        workerNodeId,
        targetType: 'basemap_build',
        targetId: basemapBuild.id,
        phase: 'build',
        now,
      })
      return { claimed, claim }
    })
    if (!result) {
      // A concurrent poll won the claim.
    } else {
      await appendLog(basemapBuild.id, 'info', 'Basemap build claimed by root agent', {
        workerNodeId,
      })
      return c.json({
        data: { kind: 'basemap_build', build: result.claimed, claim: result.claim },
      })
    }
  }

  const [basemapActivation] = await db
    .select()
    .from(basemapBuilds)
    .where(
      and(
        eq(basemapBuilds.accountId, accountId),
        eq(basemapBuilds.activationWorkerNodeId, workerNodeId),
        eq(basemapBuilds.status, 'succeeded'),
        eq(basemapBuilds.activationStatus, 'activation_requested'),
        isNull(basemapBuilds.deletedAt)
      )
    )
    .orderBy(basemapBuilds.updatedAt)
    .limit(1)
  if (basemapActivation) {
    const result = await db.transaction(async (tx) => {
      const [claimed] = await tx
        .update(basemapBuilds)
        .set({ activationStatus: 'activating', updatedAt: now })
        .where(
          and(
            eq(basemapBuilds.id, basemapActivation.id),
            eq(basemapBuilds.activationStatus, 'activation_requested')
          )
        )
        .returning()
      if (!claimed) return null
      const claim = await createAgentClaim(tx, {
        accountId,
        workerNodeId,
        targetType: 'basemap_activation',
        targetId: basemapActivation.id,
        phase: 'activation',
        now,
      })
      return { claimed, claim }
    })
    if (!result) {
      // A concurrent poll won the claim.
    } else {
      const artifacts = await db
        .select()
        .from(basemapArtifacts)
        .where(eq(basemapArtifacts.buildId, basemapActivation.id))
      const tileArtifact = artifacts.find(
        (artifact) => artifact.kind === 'basemap_tiles' && artifact.status === 'available'
      )
      const runtimeTarget = tileArtifact
        ? await basemapRuntimeTargetForActivation(result.claimed, tileArtifact)
        : null
      await appendLog(basemapActivation.id, 'info', 'Basemap activation claimed by root agent', {
        workerNodeId,
        runtimeTarget,
      })
      return c.json({
        data: {
          kind: 'basemap_activation',
          build: result.claimed,
          artifacts,
          runtimeTarget,
          claim: result.claim,
        },
      })
    }
  }

  const [geocodingActivation] = await db
    .select({
      build: geocodingBuilds,
      release: geocodingReleases,
      artifact: geocodingArtifacts,
      storageObject: storageObjects,
    })
    .from(geocodingReleases)
    .innerJoin(geocodingBuilds, eq(geocodingReleases.buildId, geocodingBuilds.id))
    .innerJoin(geocodingArtifacts, eq(geocodingReleases.artifactId, geocodingArtifacts.id))
    .innerJoin(storageObjects, eq(geocodingArtifacts.storageObjectId, storageObjects.id))
    .where(
      and(
        eq(geocodingReleases.accountId, accountId),
        eq(geocodingBuilds.accountId, accountId),
        eq(geocodingArtifacts.accountId, accountId),
        eq(storageObjects.accountId, accountId),
        eq(geocodingBuilds.activationWorkerNodeId, workerNodeId),
        eq(geocodingReleases.status, 'ready'),
        eq(geocodingReleases.activationStatus, 'activation_requested'),
        eq(geocodingArtifacts.status, 'available'),
        isNull(geocodingBuilds.deletedAt),
        isNull(storageObjects.deletedAt)
      )
    )
    .orderBy(geocodingReleases.updatedAt)
    .limit(1)
  if (geocodingActivation) {
    const result = await db.transaction(async (tx) => {
      const [claimed] = await tx
        .update(geocodingReleases)
        .set({ activationStatus: 'activating', updatedAt: now })
        .where(
          and(
            eq(geocodingReleases.id, geocodingActivation.release.id),
            eq(geocodingReleases.activationStatus, 'activation_requested')
          )
        )
        .returning()
      if (!claimed) return null
      const claim = await createAgentClaim(tx, {
        accountId,
        workerNodeId,
        targetType: 'geocoding_activation',
        targetId: claimed.id,
        phase: 'activation',
        now,
      })
      await tx
        .update(geocodingBuilds)
        .set({ activationStatus: 'activating', updatedAt: now })
        .where(eq(geocodingBuilds.id, geocodingActivation.build.id))
      await tx.insert(geocodingBuildLogs).values({
        buildId: geocodingActivation.build.id,
        message: 'Geocoding activation claimed by root agent',
        metadata: { workerNodeId, releaseId: claimed.id },
      })
      return { claimed, claim }
    })
    if (result) {
      return c.json({
        data: {
          kind: 'geocoding_activation',
          build: geocodingActivation.build,
          release: result.claimed,
          artifact: geocodingActivation.artifact,
          claim: result.claim,
        },
      })
    }
  }

  return c.json({ data: null })
})

rootAgentRoute.post('/root-agent/geocoding-activations/:id/state', async (c) => {
  const buildId = c.req.param('id')
  const parsed = activationStateSchema.safeParse(await c.req.json())
  if (!parsed.success) return validationError(c, parsed.error)
  const [row] = await db
    .select({
      build: geocodingBuilds,
      release: geocodingReleases,
      artifact: geocodingArtifacts,
    })
    .from(geocodingBuilds)
    .innerJoin(geocodingReleases, eq(geocodingReleases.buildId, geocodingBuilds.id))
    .innerJoin(geocodingArtifacts, eq(geocodingReleases.artifactId, geocodingArtifacts.id))
    .where(
      and(
        eq(geocodingBuilds.id, buildId),
        eq(geocodingBuilds.accountId, c.get('accountId')),
        eq(geocodingBuilds.activationWorkerNodeId, c.get('workerNodeId')),
        inArray(geocodingReleases.activationStatus, ['activating', 'active', 'failed']),
        isNull(geocodingBuilds.deletedAt)
      )
    )
    .limit(1)
  if (!row) return notFound(c, 'Geocoding activation not found')
  const claim = await requireAgentClaim(c, 'geocoding_activation', row.release.id, 'activation', {
    allowCompleted: true,
  })
  if (!claim) return notFound(c, 'Geocoding activation not found')
  if (!canApplyActivationTransition(row.release.activationStatus, parsed.data.activationStatus)) {
    return c.json(
      {
        error: {
          code: 'INVALID_ACTIVATION_TRANSITION',
          message: `Activation cannot transition from ${row.release.activationStatus} to ${parsed.data.activationStatus}.`,
        },
      },
      409
    )
  }
  if (row.release.activationStatus === parsed.data.activationStatus) {
    return c.json({ data: { activationStatus: parsed.data.activationStatus } })
  }

  const now = new Date()
  const applied = await db.transaction(async (tx) => {
    const [updatedRelease] = await tx
      .update(geocodingReleases)
      .set({
        status: parsed.data.activationStatus === 'active' ? 'active' : row.release.status,
        activationStatus: parsed.data.activationStatus,
        activationMetadata: parsed.data.output ?? {},
        activatedAt: parsed.data.activationStatus === 'active' ? now : row.release.activatedAt,
        updatedAt: now,
      })
      .where(
        and(
          eq(geocodingReleases.id, row.release.id),
          eq(geocodingReleases.activationStatus, 'activating')
        )
      )
      .returning({ id: geocodingReleases.id })
    if (!updatedRelease) return false
    await tx
      .update(geocodingBuilds)
      .set({
        activationStatus: parsed.data.activationStatus,
        activatedAt: parsed.data.activationStatus === 'active' ? now : row.build.activatedAt,
        errorMessage:
          parsed.data.activationStatus === 'failed'
            ? (parsed.data.errorMessage ?? 'Activation failed')
            : null,
        updatedAt: now,
      })
      .where(eq(geocodingBuilds.id, row.build.id))
    await tx.insert(geocodingBuildLogs).values({
      buildId,
      level: parsed.data.activationStatus === 'active' ? 'info' : 'error',
      message: parsed.data.message ?? `Geocoding activation ${parsed.data.activationStatus}`,
      metadata: parsed.data.output ?? null,
    })
    await tx.insert(runtimeInstallations).values({
      accountId: row.build.accountId,
      workerNodeId: c.get('workerNodeId'),
      resourceType: 'geocoding',
      buildId: row.build.id,
      artifactId: row.artifact.id,
      releaseId: row.release.id,
      status: parsed.data.activationStatus,
      runtimePath:
        typeof parsed.data.output?.snapshotPath === 'string'
          ? parsed.data.output.snapshotPath
          : null,
      metadata: parsed.data.output ?? {},
      errorMessage: parsed.data.errorMessage ?? null,
      installedAt: parsed.data.activationStatus === 'active' ? now : null,
      activatedAt: parsed.data.activationStatus === 'active' ? now : null,
      updatedAt: now,
    })
    await tx
      .update(rootAgentJobClaims)
      .set({
        status: 'completed',
        completedAt: now,
        outcome: parsed.data.activationStatus,
        updatedAt: now,
      })
      .where(and(eq(rootAgentJobClaims.id, claim.id), eq(rootAgentJobClaims.status, 'active')))
    return true
  })
  if (!applied) {
    return c.json(
      { error: { code: 'STALE_ACTIVATION_STATE', message: 'Activation changed concurrently.' } },
      409
    )
  }
  return c.json({ data: { activationStatus: parsed.data.activationStatus } })
})

rootAgentRoute.get('/root-agent/jobs/:id/cancel', async (c) => {
  const job = await findBuildForAgent(c, c.req.param('id'))
  if (!job) return notFound(c, 'Build not found')
  return c.json({ data: { cancelRequested: Boolean(job.build.cancelRequestedAt) } })
})

rootAgentRoute.post('/root-agent/jobs/:id/state', async (c) => {
  const job = await findBuildForAgent(c, c.req.param('id'), { allowCompletedClaim: true })
  if (!job) return notFound(c, 'Build not found')
  const parsed = buildStateSchema.safeParse(await c.req.json())
  if (!parsed.success) return validationError(c, parsed.error)

  const normalizedStatus =
    job.kind === 'basemap' && parsed.data.status === 'building_admins'
      ? 'building_tiles'
      : parsed.data.status
  if (
    !canApplyBuildTransition({
      kind: job.kind,
      current: job.build.status,
      next: normalizedStatus,
    })
  ) {
    return c.json(
      {
        error: {
          code: 'INVALID_BUILD_TRANSITION',
          message: `Build cannot transition from ${job.build.status} to ${normalizedStatus}.`,
        },
      },
      409
    )
  }
  if (isTerminalBuildStatus(job.build.status)) {
    return c.json({ data: job.build })
  }

  const terminal = isTerminalBuildStatus(normalizedStatus)
  const now = new Date()
  const baseUpdate = {
    progress:
      parsed.data.progress ?? (parsed.data.status === 'succeeded' ? 100 : job.build.progress),
    output: parsed.data.output ?? job.build.output,
    errorCode: parsed.data.errorCode ?? null,
    errorMessage: parsed.data.errorMessage ?? null,
    startedAt: job.build.startedAt ?? now,
    completedAt: terminal ? now : job.build.completedAt,
    updatedAt: now,
  }
  const updated = await db.transaction(async (tx) => {
    const [row] =
      job.kind === 'routing'
        ? await tx
            .update(routingGraphBuilds)
            .set({ ...baseUpdate, status: normalizedStatus })
            .where(
              and(
                eq(routingGraphBuilds.id, job.build.id),
                eq(routingGraphBuilds.status, job.build.status)
              )
            )
            .returning()
        : await tx
            .update(basemapBuilds)
            .set({
              ...baseUpdate,
              status: normalizedStatus === 'building_admins' ? 'building_tiles' : normalizedStatus,
            })
            .where(
              and(eq(basemapBuilds.id, job.build.id), eq(basemapBuilds.status, job.build.status))
            )
            .returning()
    if (!row) return null
    if (terminal) {
      await tx
        .update(rootAgentJobClaims)
        .set({
          status: 'completed',
          completedAt: now,
          outcome: normalizedStatus,
          updatedAt: now,
        })
        .where(
          and(eq(rootAgentJobClaims.id, job.claim.id), eq(rootAgentJobClaims.status, 'active'))
        )
    }
    return row
  })
  if (!updated) {
    return c.json(
      { error: { code: 'STALE_BUILD_STATE', message: 'Build state changed concurrently.' } },
      409
    )
  }
  if (parsed.data.message) {
    await appendLog(
      job.build.id,
      terminal && parsed.data.status !== 'succeeded' ? 'error' : 'info',
      parsed.data.message,
      null
    )
  }
  return c.json({ data: updated })
})

rootAgentRoute.post('/root-agent/activations/:id/state', async (c) => {
  const job = await findActivationForAgent(c, c.req.param('id'), { allowCompletedClaim: true })
  if (!job) return notFound(c, 'Activation not found')
  const parsed = activationStateSchema.safeParse(await c.req.json())
  if (!parsed.success) return validationError(c, parsed.error)
  if (!canApplyActivationTransition(job.build.activationStatus, parsed.data.activationStatus)) {
    return c.json(
      {
        error: {
          code: 'INVALID_ACTIVATION_TRANSITION',
          message: `Activation cannot transition from ${job.build.activationStatus} to ${parsed.data.activationStatus}.`,
        },
      },
      409
    )
  }
  if (job.build.activationStatus === parsed.data.activationStatus) {
    return c.json({ data: job.build })
  }
  const now = new Date()
  const update = {
    activationStatus: parsed.data.activationStatus,
    output: parsed.data.output ?? job.build.output,
    errorMessage: parsed.data.errorMessage ?? job.build.errorMessage,
    activatedAt: parsed.data.activationStatus === 'active' ? now : job.build.activatedAt,
    updatedAt: now,
  }
  const updated = await db.transaction(async (tx) => {
    const [row] =
      job.kind === 'routing'
        ? await tx
            .update(routingGraphBuilds)
            .set(update)
            .where(
              and(
                eq(routingGraphBuilds.id, job.build.id),
                eq(routingGraphBuilds.activationStatus, 'activating')
              )
            )
            .returning()
        : await tx
            .update(basemapBuilds)
            .set(update)
            .where(
              and(
                eq(basemapBuilds.id, job.build.id),
                eq(basemapBuilds.activationStatus, 'activating')
              )
            )
            .returning()
    if (!row) return null
    if (job.kind === 'routing') {
      await tx
        .update(routingGraphReleases)
        .set({
          activationStatus: parsed.data.activationStatus,
          activatedAt: parsed.data.activationStatus === 'active' ? now : undefined,
          updatedAt: now,
        })
        .where(eq(routingGraphReleases.buildId, job.build.id))
    } else {
      const output = asRecord(parsed.data.output)
      const releaseId = typeof output.releaseId === 'string' ? output.releaseId : null
      const releaseFilter = releaseId
        ? eq(basemapReleases.id, releaseId)
        : eq(basemapReleases.buildId, job.build.id)
      await tx
        .update(basemapReleases)
        .set({
          activationStatus: parsed.data.activationStatus,
          activatedAt: parsed.data.activationStatus === 'active' ? now : undefined,
          updatedAt: now,
          martinSource: typeof output.martinSource === 'string' ? output.martinSource : undefined,
          martinSourceVersioned:
            typeof output.martinSourceVersioned === 'string'
              ? output.martinSourceVersioned
              : undefined,
          activationMetadata: output,
        })
        .where(releaseFilter)
    }
    await recordRuntimeInstallation(
      {
        accountId: c.get('accountId'),
        workerNodeId: c.get('workerNodeId'),
        job,
        activationStatus: parsed.data.activationStatus,
        output: parsed.data.output,
        errorMessage: parsed.data.errorMessage,
        now,
      },
      tx
    )
    await tx
      .update(rootAgentJobClaims)
      .set({
        status: 'completed',
        completedAt: now,
        outcome: parsed.data.activationStatus,
        updatedAt: now,
      })
      .where(and(eq(rootAgentJobClaims.id, job.claim.id), eq(rootAgentJobClaims.status, 'active')))
    return row
  })
  if (!updated) {
    return c.json(
      { error: { code: 'STALE_ACTIVATION_STATE', message: 'Activation changed concurrently.' } },
      409
    )
  }
  if (parsed.data.message) {
    await appendLog(
      job.build.id,
      parsed.data.activationStatus === 'active' ? 'info' : 'error',
      parsed.data.message,
      null
    )
  }
  return c.json({ data: updated })
})

rootAgentRoute.post('/root-agent/jobs/:id/logs', async (c) => {
  const job =
    (await findBuildForAgent(c, c.req.param('id'), { allowCompletedClaim: true })) ??
    (await findActivationForAgent(c, c.req.param('id'), { allowCompletedClaim: true }))
  if (!job) return notFound(c, 'Build not found')
  const parsed = logSchema.safeParse(await c.req.json())
  if (!parsed.success) return validationError(c, parsed.error)
  const rows = parsed.data.entries.map((entry) => ({
    buildId: job.build.id,
    level: entry.level,
    message: entry.message,
    metadata: entry.metadata,
  }))
  if (job.kind === 'routing') await db.insert(routingGraphBuildLogs).values(rows)
  else await db.insert(basemapBuildLogs).values(rows)
  return c.json({ data: { inserted: parsed.data.entries.length } })
})

rootAgentRoute.post('/root-agent/jobs/:id/artifacts/upload-session', async (c) => {
  const job = await findBuildForAgent(c, c.req.param('id'))
  if (!job) return notFound(c, 'Build not found')
  const parsed = artifactUploadSessionSchema.safeParse(await c.req.json())
  if (!parsed.success) return validationError(c, parsed.error)

  const storage = getStorage()
  const storageInfo = storage.getInfo()
  const fileName = safeFileName(parsed.data.fileName)
  const [existing] = await db
    .select()
    .from(rootAgentArtifactUploadSessions)
    .where(
      and(
        eq(rootAgentArtifactUploadSessions.claimId, job.claim.id),
        eq(rootAgentArtifactUploadSessions.idempotencyKey, parsed.data.idempotencyKey)
      )
    )
    .limit(1)
  if (existing) {
    if (existing.status === 'ready' || existing.status === 'completed') {
      return c.json({ data: serializeUploadSession(existing) })
    }
    return c.json(
      {
        error: {
          code:
            existing.status === 'failed'
              ? 'ARTIFACT_UPLOAD_SESSION_FAILED'
              : 'ARTIFACT_UPLOAD_SESSION_INITIALIZING',
          message:
            existing.errorMessage ??
            'Artifact upload session is still being initialized; retry shortly.',
        },
      },
      409
    )
  }

  const sessionId = randomUUID()
  const storageKey = artifactStorageKey(job, sessionId, fileName)
  const expiresAt = new Date(Date.now() + ROOT_AGENT_UPLOAD_SESSION_MS)
  const [created] = await db
    .insert(rootAgentArtifactUploadSessions)
    .values({
      id: sessionId,
      accountId: c.get('accountId'),
      workerNodeId: c.get('workerNodeId'),
      claimId: job.claim.id,
      targetType: job.kind === 'routing' ? 'routing_build' : 'basemap_build',
      buildId: job.build.id,
      idempotencyKey: parsed.data.idempotencyKey,
      status: 'creating',
      provider: storageInfo.provider,
      bucket: storageInfo.bucket,
      storageKey,
      fileName,
      contentType: parsed.data.contentType,
      size: parsed.data.size,
      checksumSha256: parsed.data.checksumSha256?.toLowerCase() ?? null,
      artifactKind: parsed.data.kind,
      manifest: parsed.data.manifest,
      expiresAt,
      updatedAt: new Date(),
    })
    .onConflictDoNothing()
    .returning()
  if (!created) {
    return c.json(
      {
        error: {
          code: 'ARTIFACT_UPLOAD_SESSION_INITIALIZING',
          message: 'Artifact upload session is being initialized; retry shortly.',
        },
      },
      409
    )
  }

  if (!storage.createMultipartUploadSession || storageInfo.provider === 'local') {
    const [ready] = await db
      .update(rootAgentArtifactUploadSessions)
      .set({ status: 'ready', updatedAt: new Date() })
      .where(eq(rootAgentArtifactUploadSessions.id, sessionId))
      .returning()
    return c.json({
      data: serializeUploadSession(ready!),
    })
  }

  let session
  try {
    session = await storage.createMultipartUploadSession(
      storageKey,
      parsed.data.contentType,
      parsed.data.size,
      { expiresInSeconds: ROOT_AGENT_UPLOAD_SESSION_MS / 1000 }
    )
  } catch (error) {
    await db
      .update(rootAgentArtifactUploadSessions)
      .set({
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : String(error),
        updatedAt: new Date(),
      })
      .where(eq(rootAgentArtifactUploadSessions.id, sessionId))
    throw error
  }
  const [ready] = await db
    .update(rootAgentArtifactUploadSessions)
    .set({
      status: 'ready',
      multipartUploadId: session.uploadId,
      partSize: session.partSize,
      partCount: session.parts.length,
      parts: session.parts,
      expiresAt: new Date(session.expiresAt),
      updatedAt: new Date(),
    })
    .where(eq(rootAgentArtifactUploadSessions.id, sessionId))
    .returning()
  await appendLog(job.build.id, 'info', 'Created direct artifact upload session', {
    sessionId,
    fileName,
    kind: parsed.data.kind,
    provider: storageInfo.provider,
    bucket: storageInfo.bucket,
    storageKey,
    size: parsed.data.size,
    partCount: session.parts.length,
    partSize: session.partSize,
  })

  return c.json({
    data: serializeUploadSession(ready!),
  })
})

rootAgentRoute.post('/root-agent/jobs/:id/artifacts/finalize', async (c) => {
  const job = await findBuildForAgent(c, c.req.param('id'))
  if (!job) return notFound(c, 'Build not found')
  const parsed = artifactFinalizeSchema.safeParse(await c.req.json())
  if (!parsed.success) return validationError(c, parsed.error)

  const storage = getStorage()
  const storageInfo = storage.getInfo()
  const [session] = await db
    .select()
    .from(rootAgentArtifactUploadSessions)
    .where(
      and(
        eq(rootAgentArtifactUploadSessions.id, parsed.data.sessionId),
        eq(rootAgentArtifactUploadSessions.accountId, c.get('accountId')),
        eq(rootAgentArtifactUploadSessions.workerNodeId, c.get('workerNodeId')),
        eq(rootAgentArtifactUploadSessions.claimId, job.claim.id),
        eq(rootAgentArtifactUploadSessions.buildId, job.build.id)
      )
    )
    .limit(1)
  if (!session) return notFound(c, 'Artifact upload session not found')
  if (session.status === 'completed' && session.completedArtifactId) {
    const existing = await findArtifactById(job, session.completedArtifactId)
    if (existing) return c.json({ data: existing })
  }
  if (session.status !== 'ready' && session.status !== 'finalizing') {
    return c.json(
      {
        error: {
          code: 'ARTIFACT_UPLOAD_SESSION_INVALID',
          message: `Artifact upload session is ${session.status}.`,
        },
      },
      409
    )
  }
  if (session.expiresAt <= new Date()) {
    if (session.multipartUploadId && storage.abortMultipartUpload) {
      await storage
        .abortMultipartUpload(session.storageKey, session.multipartUploadId)
        .catch(() => undefined)
    }
    await db
      .update(rootAgentArtifactUploadSessions)
      .set({ status: 'failed', errorMessage: 'Upload session expired.', updatedAt: new Date() })
      .where(eq(rootAgentArtifactUploadSessions.id, session.id))
    return c.json(
      { error: { code: 'ARTIFACT_UPLOAD_SESSION_EXPIRED', message: 'Upload session expired.' } },
      409
    )
  }
  if (session.provider !== storageInfo.provider || session.bucket !== storageInfo.bucket) {
    return c.json(
      {
        error: {
          code: 'ARTIFACT_STORAGE_UNAVAILABLE',
          message: 'Artifact was uploaded to a storage provider that is not active.',
        },
      },
      409
    )
  }
  if (!storage.completeMultipartUpload || !session.multipartUploadId) {
    return c.json(
      {
        error: {
          code: 'ARTIFACT_DIRECT_UPLOAD_UNSUPPORTED',
          message: 'Active storage provider cannot finalize multipart uploads.',
        },
      },
      409
    )
  }

  const expectedPartNumbers = Array.from(
    { length: session.partCount ?? 0 },
    (_, index) => index + 1
  )
  const suppliedPartNumbers = parsed.data.parts
    .map((part) => part.partNumber)
    .sort((left, right) => left - right)
  if (
    expectedPartNumbers.length === 0 ||
    expectedPartNumbers.length !== suppliedPartNumbers.length ||
    expectedPartNumbers.some((partNumber, index) => suppliedPartNumbers[index] !== partNumber)
  ) {
    return c.json(
      {
        error: {
          code: 'ARTIFACT_PARTS_MISMATCH',
          message: 'Uploaded parts do not match the server-issued multipart session.',
        },
      },
      409
    )
  }

  let objectMetadata = await storage.getMetadata(session.storageKey)
  if (session.status === 'ready') {
    const [owned] = await db
      .update(rootAgentArtifactUploadSessions)
      .set({ status: 'finalizing', updatedAt: new Date() })
      .where(
        and(
          eq(rootAgentArtifactUploadSessions.id, session.id),
          eq(rootAgentArtifactUploadSessions.status, 'ready')
        )
      )
      .returning({ id: rootAgentArtifactUploadSessions.id })
    if (!owned) {
      return c.json(
        {
          error: {
            code: 'ARTIFACT_FINALIZATION_IN_PROGRESS',
            message: 'Artifact finalization is already in progress.',
          },
        },
        409
      )
    }
  } else if (!objectMetadata) {
    return c.json(
      {
        error: {
          code: 'ARTIFACT_FINALIZATION_IN_PROGRESS',
          message: 'Artifact finalization is already in progress.',
        },
      },
      409
    )
  }

  if (!objectMetadata) {
    await storage.completeMultipartUpload(
      session.storageKey,
      session.multipartUploadId,
      parsed.data.parts
    )
    objectMetadata = await storage.getMetadata(session.storageKey)
  }
  if (!objectMetadata) {
    return c.json(
      {
        error: {
          code: 'ARTIFACT_STORAGE_MISSING',
          message: 'Uploaded artifact was not found in object storage.',
        },
      },
      409
    )
  }
  if (objectMetadata.size !== session.size) {
    return c.json(
      {
        error: {
          code: 'ARTIFACT_SIZE_MISMATCH',
          message: 'Uploaded artifact size does not match the build metadata.',
        },
      },
      409
    )
  }

  const artifact = await recordBuildArtifact(
    job,
    {
      provider: session.provider as 's3' | 'r2',
      bucket: session.bucket,
      storageKey: session.storageKey,
      fileName: session.fileName,
      contentType: session.contentType,
      size: session.size,
      checksumSha256: session.checksumSha256,
      artifactKind: session.artifactKind,
      manifest: asRecord(session.manifest),
      metadata: {
        ...asRecord(session.manifest),
        directUpload: true,
        uploadSessionId: session.id,
        partCount: parsed.data.parts.length,
      },
    },
    session.id
  )
  await appendLog(job.build.id, 'info', 'Artifact direct upload finalized', {
    artifactId: artifact.id,
    fileName: artifact.fileName,
    size: artifact.size,
  })
  return c.json({ data: artifact }, 201)
})

rootAgentRoute.post('/root-agent/jobs/:id/artifacts', async (c) => {
  const job = await findBuildForAgent(c, c.req.param('id'))
  if (!job) return notFound(c, 'Build not found')
  const sessionId = c.req.header('x-planisfy-artifact-upload-session-id')
  if (!sessionId) {
    return c.json(
      {
        error: { code: 'UPLOAD_SESSION_REQUIRED', message: 'Artifact upload session is required.' },
      },
      409
    )
  }
  const [session] = await db
    .select()
    .from(rootAgentArtifactUploadSessions)
    .where(
      and(
        eq(rootAgentArtifactUploadSessions.id, sessionId),
        eq(rootAgentArtifactUploadSessions.accountId, c.get('accountId')),
        eq(rootAgentArtifactUploadSessions.workerNodeId, c.get('workerNodeId')),
        eq(rootAgentArtifactUploadSessions.claimId, job.claim.id),
        eq(rootAgentArtifactUploadSessions.buildId, job.build.id),
        inArray(rootAgentArtifactUploadSessions.status, ['ready', 'completed'])
      )
    )
    .limit(1)
  if (!session) return notFound(c, 'Artifact upload session not found')
  if (session.status === 'completed' && session.completedArtifactId) {
    const existing = await findArtifactById(job, session.completedArtifactId)
    if (existing) return c.json({ data: existing })
  }
  if (session.expiresAt <= new Date()) {
    return c.json(
      { error: { code: 'ARTIFACT_UPLOAD_SESSION_EXPIRED', message: 'Upload session expired.' } },
      409
    )
  }
  const body = c.req.raw.body
  if (!body) {
    return c.json(
      { error: { code: 'BAD_REQUEST', message: 'Artifact upload body is required' } },
      400
    )
  }

  const storage = getStorage()
  const storageInfo = storage.getInfo()
  const uploaded = await storage.upload(
    session.storageKey,
    Readable.fromWeb(body as unknown as import('node:stream/web').ReadableStream),
    session.contentType,
    session.size
  )
  if (uploaded.size !== session.size) {
    await storage.delete(session.storageKey).catch(() => undefined)
    return c.json(
      {
        error: {
          code: 'ARTIFACT_SIZE_MISMATCH',
          message: 'Uploaded artifact size does not match the upload session.',
        },
      },
      409
    )
  }
  const artifact = await recordBuildArtifact(
    job,
    {
      provider: storageInfo.provider,
      bucket: storageInfo.bucket,
      storageKey: uploaded.key,
      fileName: session.fileName,
      contentType: session.contentType,
      size: session.size,
      checksumSha256: session.checksumSha256,
      artifactKind: session.artifactKind,
      manifest: asRecord(session.manifest),
      metadata: { ...asRecord(session.manifest), uploadSessionId: session.id },
    },
    session.id
  )
  await appendLog(job.build.id, 'info', 'Artifact uploaded', {
    artifactId: artifact?.id,
    fileName: session.fileName,
    size: session.size,
  })
  return c.json({ data: artifact }, 201)
})

rootAgentRoute.get('/root-agent/artifacts/:id/download', async (c) => {
  const artifactId = c.req.param('id')
  const [routingArtifact] = await db
    .select()
    .from(routingGraphArtifacts)
    .where(
      and(
        eq(routingGraphArtifacts.id, artifactId),
        eq(routingGraphArtifacts.accountId, c.get('accountId'))
      )
    )
    .limit(1)
  const artifact = routingArtifact
    ? { kind: 'routing' as const, artifact: routingArtifact }
    : ((await findBasemapArtifactForDownload(artifactId)) ??
      (await findGeocodingArtifactForDownload(artifactId)))
  if (!artifact?.artifact.storageObjectId) return notFound(c, 'Artifact not found')
  const build =
    artifact.kind === 'routing'
      ? await findRoutingBuildForArtifact(c, artifact.artifact.buildId)
      : artifact.kind === 'basemap'
        ? await findBasemapBuildForArtifact(c, artifact.artifact.buildId)
        : await findGeocodingBuildForArtifact(c, artifact.artifact.buildId)
  if (!build) return notFound(c, 'Artifact not found')
  const downloadClaim =
    artifact.kind === 'routing'
      ? await requireAgentClaim(c, 'routing_activation', build.id, 'activation')
      : artifact.kind === 'basemap'
        ? await requireAgentClaim(c, 'basemap_activation', build.id, 'activation')
        : await findGeocodingDownloadClaim(c, artifact.artifact.id)
  if (!downloadClaim) return notFound(c, 'Artifact not found')
  const [object] = await db
    .select()
    .from(storageObjects)
    .where(
      and(
        eq(storageObjects.id, artifact.artifact.storageObjectId),
        eq(storageObjects.accountId, c.get('accountId')),
        isNull(storageObjects.deletedAt)
      )
    )
    .limit(1)
  if (!object) return notFound(c, 'Storage object not found')
  const storage = getStorage()
  const totalSize = object.size ?? artifact.artifact.size ?? null
  const range = parseByteRange(c.req.header('range'), totalSize)
  if (range.status === 'invalid') {
    return new Response(null, {
      status: 416,
      headers: totalSize === null ? undefined : { 'content-range': `bytes */${totalSize}` },
    })
  }
  if (range.status === 'partial') {
    const length = range.end - range.start + 1
    const chunk = await storage.readRange(object.storageKey, range.start, length)
    return new Response(new Uint8Array(chunk), {
      status: 206,
      headers: {
        'accept-ranges': 'bytes',
        'content-type': object.contentType ?? 'application/octet-stream',
        'content-length': String(chunk.length),
        'content-range': `bytes ${range.start}-${range.start + chunk.length - 1}/${totalSize}`,
        'content-disposition': `attachment; filename="${artifact.artifact.fileName}"`,
      },
    })
  }
  const stream = storage.downloadStream
    ? await storage.downloadStream(object.storageKey)
    : Readable.from([await storage.download(object.storageKey)])
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      'accept-ranges': totalSize === null ? 'none' : 'bytes',
      'content-type': object.contentType ?? 'application/octet-stream',
      ...(totalSize === null ? {} : { 'content-length': String(totalSize) }),
      'content-disposition': `attachment; filename="${artifact.artifact.fileName}"`,
    },
  })
})

async function authenticateAgent(c: Context<AgentEnv>) {
  const token = c.req.header('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) {
    return {
      ok: false as const,
      response: c.json(
        { error: { code: 'UNAUTHORIZED', message: 'Root agent token required' } },
        401
      ),
    }
  }
  const [row] = await db
    .select()
    .from(rootAgentNodeTokens)
    .where(
      and(
        eq(rootAgentNodeTokens.tokenHash, hashToken(token)),
        isNull(rootAgentNodeTokens.revokedAt)
      )
    )
    .limit(1)
  if (!row) {
    return {
      ok: false as const,
      response: c.json(
        { error: { code: 'UNAUTHORIZED', message: 'Invalid root agent token' } },
        401
      ),
    }
  }
  const [node] = await db
    .select({ id: workerNodes.id })
    .from(workerNodes)
    .innerJoin(accounts, eq(accounts.id, workerNodes.accountId))
    .where(
      and(
        eq(workerNodes.id, row.workerNodeId),
        eq(workerNodes.accountId, row.accountId),
        isNull(workerNodes.deletedAt),
        eq(accounts.lifecycleStatus, 'ACTIVE'),
        isNull(accounts.deletedAt)
      )
    )
    .limit(1)
  if (!node) {
    await db
      .update(rootAgentNodeTokens)
      .set({ revokedAt: new Date() })
      .where(eq(rootAgentNodeTokens.id, row.id))
    return {
      ok: false as const,
      response: c.json(
        { error: { code: 'UNAUTHORIZED', message: 'Root agent node is no longer active' } },
        401
      ),
    }
  }
  await Promise.all([
    db
      .update(rootAgentNodeTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(rootAgentNodeTokens.id, row.id)),
    db
      .update(workerNodes)
      .set({ status: 'healthy', lastSeenAt: new Date(), updatedAt: new Date() })
      .where(eq(workerNodes.id, row.workerNodeId)),
  ])
  return { ok: true as const, accountId: row.accountId, workerNodeId: row.workerNodeId }
}

type DatabaseExecutor = Pick<typeof db, 'select' | 'insert' | 'update'>
type ClaimExecutor = Pick<DatabaseExecutor, 'insert'>

async function createAgentClaim(
  executor: ClaimExecutor,
  params: {
    accountId: string
    workerNodeId: string
    targetType: string
    targetId: string
    phase: 'build' | 'activation'
    now: Date
  }
) {
  const leaseExpiresAt = new Date(params.now.getTime() + ROOT_AGENT_CLAIM_LEASE_MS)
  const [claim] = await executor
    .insert(rootAgentJobClaims)
    .values({
      accountId: params.accountId,
      workerNodeId: params.workerNodeId,
      targetType: params.targetType,
      targetId: params.targetId,
      phase: params.phase,
      status: 'active',
      lastRenewedAt: params.now,
      leaseExpiresAt,
      updatedAt: params.now,
    })
    .returning()
  if (!claim) throw new Error('Failed to create root-agent claim')
  return { id: claim.id, expiresAt: claim.leaseExpiresAt.toISOString() }
}

async function requireAgentClaim(
  c: Context<AgentEnv>,
  targetType: string,
  targetId: string,
  phase: 'build' | 'activation',
  options: { allowCompleted?: boolean } = {}
) {
  const claimId = c.req.header(ROOT_AGENT_CLAIM_HEADER)
  if (!claimId) return null
  const now = new Date()
  const leaseExpiresAt = new Date(now.getTime() + ROOT_AGENT_CLAIM_LEASE_MS)
  const [claim] = await db
    .update(rootAgentJobClaims)
    .set({ lastRenewedAt: now, leaseExpiresAt, updatedAt: now })
    .where(
      and(
        eq(rootAgentJobClaims.id, claimId),
        eq(rootAgentJobClaims.accountId, c.get('accountId')),
        eq(rootAgentJobClaims.workerNodeId, c.get('workerNodeId')),
        eq(rootAgentJobClaims.targetType, targetType),
        eq(rootAgentJobClaims.targetId, targetId),
        eq(rootAgentJobClaims.phase, phase),
        eq(rootAgentJobClaims.status, 'active'),
        gt(rootAgentJobClaims.leaseExpiresAt, now)
      )
    )
    .returning()
  if (claim || !options.allowCompleted) return claim ?? null
  const [completed] = await db
    .select()
    .from(rootAgentJobClaims)
    .where(
      and(
        eq(rootAgentJobClaims.id, claimId),
        eq(rootAgentJobClaims.accountId, c.get('accountId')),
        eq(rootAgentJobClaims.workerNodeId, c.get('workerNodeId')),
        eq(rootAgentJobClaims.targetType, targetType),
        eq(rootAgentJobClaims.targetId, targetId),
        eq(rootAgentJobClaims.phase, phase),
        eq(rootAgentJobClaims.status, 'completed')
      )
    )
    .limit(1)
  return completed ?? null
}

async function expireAgentClaims(accountId: string, workerNodeId: string, now: Date) {
  const expired = await db
    .select()
    .from(rootAgentJobClaims)
    .where(
      and(
        eq(rootAgentJobClaims.accountId, accountId),
        eq(rootAgentJobClaims.workerNodeId, workerNodeId),
        eq(rootAgentJobClaims.status, 'active'),
        lt(rootAgentJobClaims.leaseExpiresAt, now)
      )
    )
  for (const claim of expired) {
    await db.transaction(async (tx) => {
      const [marked] = await tx
        .update(rootAgentJobClaims)
        .set({ status: 'expired', completedAt: now, outcome: 'lease_expired', updatedAt: now })
        .where(
          and(
            eq(rootAgentJobClaims.id, claim.id),
            eq(rootAgentJobClaims.status, 'active'),
            lt(rootAgentJobClaims.leaseExpiresAt, now)
          )
        )
        .returning({ id: rootAgentJobClaims.id })
      if (!marked) return
      if (claim.targetType === 'routing_build') {
        await tx
          .update(routingGraphBuilds)
          .set({ status: 'queued', assignedAt: null, updatedAt: now })
          .where(
            and(
              eq(routingGraphBuilds.id, claim.targetId),
              inArray(routingGraphBuilds.status, [
                'assigned',
                'preparing',
                'downloading_source',
                'building_admins',
                'building_tiles',
                'packaging',
                'uploading',
              ]),
              isNull(routingGraphBuilds.cancelRequestedAt)
            )
          )
        await tx
          .update(routingGraphBuilds)
          .set({ status: 'canceled', completedAt: now, updatedAt: now })
          .where(
            and(
              eq(routingGraphBuilds.id, claim.targetId),
              inArray(routingGraphBuilds.status, [
                'assigned',
                'preparing',
                'downloading_source',
                'building_admins',
                'building_tiles',
                'packaging',
                'uploading',
                'canceling',
              ]),
              gt(routingGraphBuilds.cancelRequestedAt, new Date(0))
            )
          )
      } else if (claim.targetType === 'basemap_build') {
        await tx
          .update(basemapBuilds)
          .set({ status: 'queued', assignedAt: null, updatedAt: now })
          .where(
            and(
              eq(basemapBuilds.id, claim.targetId),
              inArray(basemapBuilds.status, [
                'assigned',
                'preparing',
                'downloading_source',
                'building_tiles',
                'packaging',
                'uploading',
              ]),
              isNull(basemapBuilds.cancelRequestedAt)
            )
          )
        await tx
          .update(basemapBuilds)
          .set({ status: 'canceled', completedAt: now, updatedAt: now })
          .where(
            and(
              eq(basemapBuilds.id, claim.targetId),
              inArray(basemapBuilds.status, [
                'assigned',
                'preparing',
                'downloading_source',
                'building_tiles',
                'packaging',
                'uploading',
                'canceling',
              ]),
              gt(basemapBuilds.cancelRequestedAt, new Date(0))
            )
          )
      } else if (claim.targetType === 'routing_activation') {
        await tx
          .update(routingGraphBuilds)
          .set({ activationStatus: 'activation_requested', updatedAt: now })
          .where(
            and(
              eq(routingGraphBuilds.id, claim.targetId),
              eq(routingGraphBuilds.activationStatus, 'activating')
            )
          )
      } else if (claim.targetType === 'basemap_activation') {
        await tx
          .update(basemapBuilds)
          .set({ activationStatus: 'activation_requested', updatedAt: now })
          .where(
            and(
              eq(basemapBuilds.id, claim.targetId),
              eq(basemapBuilds.activationStatus, 'activating')
            )
          )
      } else if (claim.targetType === 'geocoding_activation') {
        await tx
          .update(geocodingReleases)
          .set({ activationStatus: 'activation_requested', updatedAt: now })
          .where(
            and(
              eq(geocodingReleases.id, claim.targetId),
              eq(geocodingReleases.activationStatus, 'activating')
            )
          )
      }
    })
    const abandonedSessions = await db
      .select()
      .from(rootAgentArtifactUploadSessions)
      .where(
        and(
          eq(rootAgentArtifactUploadSessions.claimId, claim.id),
          inArray(rootAgentArtifactUploadSessions.status, ['creating', 'ready', 'finalizing'])
        )
      )
    await db
      .update(rootAgentArtifactUploadSessions)
      .set({
        status: 'failed',
        errorMessage: 'Owning root-agent claim expired.',
        updatedAt: now,
      })
      .where(
        and(
          eq(rootAgentArtifactUploadSessions.claimId, claim.id),
          inArray(rootAgentArtifactUploadSessions.status, ['creating', 'ready', 'finalizing'])
        )
      )
    const storage = getStorage()
    if (storage.abortMultipartUpload) {
      await Promise.all(
        abandonedSessions
          .filter((session) => session.multipartUploadId)
          .map((session) =>
            storage.abortMultipartUpload!(session.storageKey, session.multipartUploadId!).catch(
              () => undefined
            )
          )
      )
    }
  }
}

async function findBuildForAgent(
  c: Context<AgentEnv>,
  buildId: string,
  options: { allowCompletedClaim?: boolean } = {}
) {
  const [routingBuild] = await db
    .select()
    .from(routingGraphBuilds)
    .where(
      and(
        eq(routingGraphBuilds.id, buildId),
        eq(routingGraphBuilds.accountId, c.get('accountId')),
        eq(routingGraphBuilds.workerNodeId, c.get('workerNodeId')),
        isNull(routingGraphBuilds.deletedAt)
      )
    )
    .limit(1)
  if (routingBuild) {
    const claim = await requireAgentClaim(c, 'routing_build', routingBuild.id, 'build', {
      allowCompleted: options.allowCompletedClaim,
    })
    if (claim) return { kind: 'routing' as const, build: routingBuild, claim }
  }
  const [basemapBuild] = await db
    .select()
    .from(basemapBuilds)
    .where(
      and(
        eq(basemapBuilds.id, buildId),
        eq(basemapBuilds.accountId, c.get('accountId')),
        eq(basemapBuilds.workerNodeId, c.get('workerNodeId')),
        isNull(basemapBuilds.deletedAt)
      )
    )
    .limit(1)
  if (!basemapBuild) return null
  const claim = await requireAgentClaim(c, 'basemap_build', basemapBuild.id, 'build', {
    allowCompleted: options.allowCompletedClaim,
  })
  return claim ? { kind: 'basemap' as const, build: basemapBuild, claim } : null
}

async function findActivationForAgent(
  c: Context<AgentEnv>,
  buildId: string,
  options: { allowCompletedClaim?: boolean } = {}
) {
  const [routingBuild] = await db
    .select()
    .from(routingGraphBuilds)
    .where(
      and(
        eq(routingGraphBuilds.id, buildId),
        eq(routingGraphBuilds.accountId, c.get('accountId')),
        eq(routingGraphBuilds.activationWorkerNodeId, c.get('workerNodeId')),
        inArray(
          routingGraphBuilds.activationStatus,
          options.allowCompletedClaim
            ? ['activation_requested', 'activating', 'active', 'failed']
            : ['activation_requested', 'activating']
        ),
        isNull(routingGraphBuilds.deletedAt)
      )
    )
    .limit(1)
  if (routingBuild) {
    const claim = await requireAgentClaim(c, 'routing_activation', routingBuild.id, 'activation', {
      allowCompleted: options.allowCompletedClaim,
    })
    if (claim) return { kind: 'routing' as const, build: routingBuild, claim }
  }
  const [basemapBuild] = await db
    .select()
    .from(basemapBuilds)
    .where(
      and(
        eq(basemapBuilds.id, buildId),
        eq(basemapBuilds.accountId, c.get('accountId')),
        eq(basemapBuilds.activationWorkerNodeId, c.get('workerNodeId')),
        inArray(
          basemapBuilds.activationStatus,
          options.allowCompletedClaim
            ? ['activation_requested', 'activating', 'active', 'failed']
            : ['activation_requested', 'activating']
        ),
        isNull(basemapBuilds.deletedAt)
      )
    )
    .limit(1)
  if (!basemapBuild) return null
  const claim = await requireAgentClaim(c, 'basemap_activation', basemapBuild.id, 'activation', {
    allowCompleted: options.allowCompletedClaim,
  })
  return claim ? { kind: 'basemap' as const, build: basemapBuild, claim } : null
}

function parseByteRange(
  header: string | undefined,
  totalSize: number | null
): { status: 'none' } | { status: 'partial'; start: number; end: number } | { status: 'invalid' } {
  if (!header) return { status: 'none' }
  if (totalSize === null || totalSize < 0) return { status: 'invalid' }
  const match = /^bytes=(\d+)-(\d*)$/.exec(header.trim())
  if (!match) return { status: 'invalid' }
  const start = Number(match[1])
  const requestedEnd = match[2] ? Number(match[2]) : totalSize - 1
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd)) {
    return { status: 'invalid' }
  }
  if (start < 0 || requestedEnd < start || start >= totalSize) {
    return { status: 'invalid' }
  }
  return { status: 'partial', start, end: Math.min(requestedEnd, totalSize - 1) }
}

async function recordRuntimeInstallation(
  params: {
    accountId: string
    workerNodeId: string
    job: NonNullable<Awaited<ReturnType<typeof findActivationForAgent>>>
    activationStatus: 'active' | 'failed'
    output: Record<string, unknown> | undefined
    errorMessage: string | undefined
    now: Date
  },
  executor: DatabaseExecutor = db
) {
  const output = asRecord(params.output)
  const [artifact] =
    params.job.kind === 'routing'
      ? await executor
          .select({ id: routingGraphArtifacts.id })
          .from(routingGraphArtifacts)
          .where(
            and(
              eq(routingGraphArtifacts.buildId, params.job.build.id),
              eq(routingGraphArtifacts.status, 'available')
            )
          )
          .limit(1)
      : await executor
          .select({ id: basemapArtifacts.id })
          .from(basemapArtifacts)
          .where(
            and(
              eq(basemapArtifacts.buildId, params.job.build.id),
              eq(basemapArtifacts.status, 'available')
            )
          )
          .limit(1)
  const [release] =
    params.job.kind === 'routing'
      ? await executor
          .select({ id: routingGraphReleases.id })
          .from(routingGraphReleases)
          .where(eq(routingGraphReleases.buildId, params.job.build.id))
          .limit(1)
      : await executor
          .select({ id: basemapReleases.id })
          .from(basemapReleases)
          .where(eq(basemapReleases.buildId, params.job.build.id))
          .limit(1)
  const runtimePath =
    stringFromRecord(output, 'valhallaDataDir') ??
    stringFromRecord(output, 'martinPath') ??
    stringFromRecord(output, 'martinSourcesDir')
  const versionedPath =
    stringFromRecord(output, 'valhallaReleaseDir') ??
    stringFromRecord(output, 'martinPathVersioned')

  await executor.insert(runtimeInstallations).values({
    accountId: params.accountId,
    workerNodeId: params.workerNodeId,
    resourceType: params.job.kind === 'routing' ? 'routing_graph' : 'basemap',
    buildId: params.job.build.id,
    artifactId: artifact?.id ?? null,
    releaseId: release?.id ?? null,
    status: params.activationStatus === 'active' ? 'active' : 'failed',
    runtimePath,
    versionedPath,
    metadata: output,
    errorMessage: params.errorMessage ?? null,
    installedAt: params.activationStatus === 'active' ? params.now : null,
    activatedAt: params.activationStatus === 'active' ? params.now : null,
    updatedAt: params.now,
  })
}

async function appendLog(buildId: string, level: string, message: string, metadata: unknown) {
  const [routingBuild] = await db
    .select({ id: routingGraphBuilds.id })
    .from(routingGraphBuilds)
    .where(eq(routingGraphBuilds.id, buildId))
    .limit(1)
  if (routingBuild) {
    await db.insert(routingGraphBuildLogs).values({ buildId, level, message, metadata })
    return
  }
  await db.insert(basemapBuildLogs).values({ buildId, level, message, metadata })
}

function serializeUploadSession(session: typeof rootAgentArtifactUploadSessions.$inferSelect) {
  if (session.status === 'completed') {
    return {
      strategy: 'completed' as const,
      sessionId: session.id,
      artifactId: session.completedArtifactId,
    }
  }
  if (session.provider === 'local') {
    return {
      strategy: 'legacy_proxy' as const,
      sessionId: session.id,
      reason: 'Storage provider does not support signed multipart uploads.',
      uploadUrl: `/root-agent/jobs/${session.buildId}/artifacts`,
    }
  }
  return {
    strategy: 'multipart' as const,
    sessionId: session.id,
    multipart: {
      partSize: session.partSize!,
      expiresAt: session.expiresAt.toISOString(),
      parts: Array.isArray(session.parts) ? session.parts : [],
    },
  }
}

async function findArtifactById(
  job: NonNullable<Awaited<ReturnType<typeof findBuildForAgent>>>,
  artifactId: string
) {
  if (job.kind === 'routing') {
    const [artifact] = await db
      .select()
      .from(routingGraphArtifacts)
      .where(
        and(
          eq(routingGraphArtifacts.id, artifactId),
          eq(routingGraphArtifacts.accountId, job.build.accountId),
          eq(routingGraphArtifacts.buildId, job.build.id)
        )
      )
      .limit(1)
    return artifact ?? null
  }
  const [artifact] = await db
    .select()
    .from(basemapArtifacts)
    .where(
      and(
        eq(basemapArtifacts.id, artifactId),
        eq(basemapArtifacts.accountId, job.build.accountId),
        eq(basemapArtifacts.buildId, job.build.id)
      )
    )
    .limit(1)
  return artifact ?? null
}

async function recordBuildArtifact(
  job: NonNullable<Awaited<ReturnType<typeof findBuildForAgent>>>,
  params: {
    provider: 'local' | 's3' | 'r2'
    bucket: string
    storageKey: string
    fileName: string
    contentType: string
    size: number
    checksumSha256: string | null
    artifactKind: string
    manifest: Record<string, unknown>
    metadata: Record<string, unknown>
  },
  uploadSessionId: string
) {
  return db.transaction(async (tx) => {
    const objectValues = {
      accountId: job.build.accountId,
      provider: params.provider,
      bucket: params.bucket,
      storageKey: params.storageKey,
      fileName: params.fileName,
      contentType: params.contentType,
      size: params.size,
      contentHash: params.checksumSha256,
      resourceType: job.kind === 'routing' ? 'routing_graph_build' : 'basemap_build',
      resourceId: job.build.id,
      artifactKind: params.artifactKind,
      metadata: params.metadata,
    }
    const [insertedObject] = await tx
      .insert(storageObjects)
      .values(objectValues)
      .onConflictDoNothing()
      .returning()
    const [storageObject] = insertedObject
      ? [insertedObject]
      : await tx
          .select()
          .from(storageObjects)
          .where(
            and(
              eq(storageObjects.accountId, job.build.accountId),
              eq(storageObjects.provider, params.provider),
              eq(storageObjects.bucket, params.bucket),
              eq(storageObjects.storageKey, params.storageKey),
              eq(storageObjects.resourceId, job.build.id),
              isNull(storageObjects.deletedAt)
            )
          )
          .limit(1)
    if (!storageObject) {
      throw new Error('Artifact storage key is already owned by another tenant or resource')
    }

    let artifact
    if (job.kind === 'routing') {
      const [inserted] = await tx
        .insert(routingGraphArtifacts)
        .values({
          accountId: job.build.accountId,
          buildId: job.build.id,
          storageObjectId: storageObject.id,
          kind: params.artifactKind,
          status: 'available',
          fileName: params.fileName,
          size: params.size,
          checksumSha256: params.checksumSha256,
          manifest: params.manifest,
        })
        .onConflictDoNothing()
        .returning()
      artifact =
        inserted ??
        (
          await tx
            .select()
            .from(routingGraphArtifacts)
            .where(
              and(
                eq(routingGraphArtifacts.buildId, job.build.id),
                eq(routingGraphArtifacts.kind, params.artifactKind),
                eq(routingGraphArtifacts.status, 'available')
              )
            )
            .limit(1)
        )[0]
      if (!artifact) throw new Error('Failed to record routing graph artifact')
      if (params.artifactKind === 'valhalla_graph') {
        await ensureRoutingGraphRelease(job.build, artifact.id, params.manifest, tx)
      }
    } else {
      const [inserted] = await tx
        .insert(basemapArtifacts)
        .values({
          accountId: job.build.accountId,
          buildId: job.build.id,
          storageObjectId: storageObject.id,
          kind: params.artifactKind,
          status: 'available',
          fileName: params.fileName,
          size: params.size,
          checksumSha256: params.checksumSha256,
          manifest: params.manifest,
        })
        .onConflictDoNothing()
        .returning()
      artifact =
        inserted ??
        (
          await tx
            .select()
            .from(basemapArtifacts)
            .where(
              and(
                eq(basemapArtifacts.buildId, job.build.id),
                eq(basemapArtifacts.kind, params.artifactKind),
                eq(basemapArtifacts.status, 'available')
              )
            )
            .limit(1)
        )[0]
      if (!artifact) throw new Error('Failed to record basemap artifact')
      if (params.artifactKind === 'basemap_tiles') {
        await ensureBasemapRelease(job.build, artifact.id, storageObject.id, params.manifest, tx)
      }
    }
    await tx
      .update(rootAgentArtifactUploadSessions)
      .set({
        status: 'completed',
        completedArtifactId: artifact.id,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(rootAgentArtifactUploadSessions.id, uploadSessionId))
    return artifact
  })
}

function artifactStorageKey(
  job: NonNullable<Awaited<ReturnType<typeof findBuildForAgent>>>,
  sessionId: string,
  fileName: string
) {
  const domain = job.kind === 'routing' ? 'routing-graphs' : 'basemaps'
  return `accounts/${job.build.accountId}/${domain}/${job.build.id}/${sessionId}/${fileName}`
}

async function ensureRoutingGraphRelease(
  build: typeof routingGraphBuilds.$inferSelect,
  artifactId: string,
  manifest: Record<string, unknown>,
  executor: DatabaseExecutor = db
) {
  const [existing] = await executor
    .select()
    .from(routingGraphReleases)
    .where(
      and(
        eq(routingGraphReleases.buildId, build.id),
        eq(routingGraphReleases.artifactId, artifactId)
      )
    )
    .limit(1)
  if (existing) return existing
  const now = new Date()
  const [release] = await executor
    .insert(routingGraphReleases)
    .values({
      accountId: build.accountId,
      buildId: build.id,
      artifactId,
      name: build.name,
      version: build.id.slice(0, 8),
      status: 'published',
      activationStatus: build.activationStatus,
      sourceDataVersions: {
        sourceUrl: build.sourceUrl,
        sourcePreset: build.sourcePreset,
        valhallaImage: build.valhallaImage,
      },
      manifest,
      publishedAt: now,
    })
    .onConflictDoNothing()
    .returning()
  if (release) return release
  const [concurrent] = await executor
    .select()
    .from(routingGraphReleases)
    .where(
      and(
        eq(routingGraphReleases.buildId, build.id),
        eq(routingGraphReleases.artifactId, artifactId)
      )
    )
    .limit(1)
  return concurrent
}

async function ensureBasemapRelease(
  build: typeof basemapBuilds.$inferSelect,
  artifactId: string,
  storageObjectId: string | null,
  manifest: Record<string, unknown>,
  executor: DatabaseExecutor = db
) {
  const [existing] = await executor
    .select()
    .from(basemapReleases)
    .where(and(eq(basemapReleases.buildId, build.id), eq(basemapReleases.artifactId, artifactId)))
    .limit(1)
  if (existing) return existing
  const now = new Date()
  const releaseId = randomUUID()
  const [release] = await executor
    .insert(basemapReleases)
    .values({
      id: releaseId,
      accountId: build.accountId,
      buildId: build.id,
      artifactId,
      artifactStorageObjectId: storageObjectId,
      name: build.name,
      version: build.id.slice(0, 8),
      status: 'published',
      activationStatus: build.activationStatus,
      sourceDataVersions: {
        sourceUrl: build.sourceUrl,
        sourcePreset: build.sourcePreset,
        engine: build.engine,
        sourceKind: build.sourceKind,
      },
      schemaVersion: build.profile,
      bounds: build.areaOfInterest,
      minZoom: readNumber(manifest.minZoom, 0),
      maxZoom: readNumber(manifest.maxZoom, 14),
      attribution: typeof manifest.attribution === 'string' ? manifest.attribution : null,
      tilejson: asRecord(manifest.tilejson),
      styleCompatibility: { profile: build.profile, outputFormat: build.outputFormat },
      martinSource: basemapReleaseMartinSource(releaseId),
      martinSourceVersioned: basemapArtifactMartinSource(artifactId),
      publishedAt: now,
    })
    .onConflictDoNothing()
    .returning()
  if (release) return release
  const [concurrent] = await executor
    .select()
    .from(basemapReleases)
    .where(and(eq(basemapReleases.buildId, build.id), eq(basemapReleases.artifactId, artifactId)))
    .limit(1)
  if (!concurrent) throw new Error('Failed to create basemap release')
  return concurrent
}

async function basemapRuntimeTargetForActivation(
  build: typeof basemapBuilds.$inferSelect,
  artifact: typeof basemapArtifacts.$inferSelect
) {
  const release = await ensureBasemapRelease(
    build,
    artifact.id,
    artifact.storageObjectId ?? null,
    asRecord(artifact.manifest)
  )
  return {
    releaseId: release.id,
    artifactId: artifact.id,
    martinSource: release.martinSource ?? basemapReleaseMartinSource(release.id),
    martinSourceVersioned:
      release.martinSourceVersioned ?? basemapArtifactMartinSource(artifact.id),
    martinPrimarySource: basemapAccountPrimaryMartinSource(build.accountId),
    extension: artifact.fileName.toLowerCase().endsWith('.mbtiles') ? 'mbtiles' : 'pmtiles',
  }
}

function basemapReleaseMartinSource(releaseId: string) {
  return `basemap_release_${compactUuid(releaseId)}`
}

function basemapArtifactMartinSource(artifactId: string) {
  return `basemap_artifact_${compactUuid(artifactId)}`
}

function basemapAccountPrimaryMartinSource(accountId: string) {
  return `basemap_account_${compactUuid(accountId)}_primary`
}

function compactUuid(id: string) {
  return id.replace(/-/g, '').toLowerCase()
}

async function findBasemapArtifactForDownload(artifactId: string) {
  const [artifact] = await db
    .select()
    .from(basemapArtifacts)
    .where(eq(basemapArtifacts.id, artifactId))
    .limit(1)
  return artifact ? { kind: 'basemap' as const, artifact } : null
}

async function findGeocodingArtifactForDownload(artifactId: string) {
  const [artifact] = await db
    .select()
    .from(geocodingArtifacts)
    .where(eq(geocodingArtifacts.id, artifactId))
    .limit(1)
  return artifact ? { kind: 'geocoding' as const, artifact } : null
}

async function findGeocodingDownloadClaim(c: Context<AgentEnv>, artifactId: string) {
  const [release] = await db
    .select({ id: geocodingReleases.id })
    .from(geocodingReleases)
    .where(
      and(
        eq(geocodingReleases.artifactId, artifactId),
        eq(geocodingReleases.accountId, c.get('accountId'))
      )
    )
    .limit(1)
  return release ? requireAgentClaim(c, 'geocoding_activation', release.id, 'activation') : null
}

async function findRoutingBuildForArtifact(c: Context<AgentEnv>, buildId: string) {
  const [build] = await db
    .select()
    .from(routingGraphBuilds)
    .where(
      and(
        eq(routingGraphBuilds.id, buildId),
        eq(routingGraphBuilds.accountId, c.get('accountId')),
        isNull(routingGraphBuilds.deletedAt)
      )
    )
    .limit(1)
  if (
    !build ||
    (build.workerNodeId !== c.get('workerNodeId') &&
      build.activationWorkerNodeId !== c.get('workerNodeId'))
  ) {
    return null
  }
  return build
}

async function findBasemapBuildForArtifact(c: Context<AgentEnv>, buildId: string) {
  const [build] = await db
    .select()
    .from(basemapBuilds)
    .where(
      and(
        eq(basemapBuilds.id, buildId),
        eq(basemapBuilds.accountId, c.get('accountId')),
        isNull(basemapBuilds.deletedAt)
      )
    )
    .limit(1)
  if (
    !build ||
    (build.workerNodeId !== c.get('workerNodeId') &&
      build.activationWorkerNodeId !== c.get('workerNodeId'))
  ) {
    return null
  }
  return build
}

async function findGeocodingBuildForArtifact(c: Context<AgentEnv>, buildId: string) {
  const [build] = await db
    .select()
    .from(geocodingBuilds)
    .where(
      and(
        eq(geocodingBuilds.id, buildId),
        eq(geocodingBuilds.accountId, c.get('accountId')),
        eq(geocodingBuilds.activationWorkerNodeId, c.get('workerNodeId')),
        isNull(geocodingBuilds.deletedAt)
      )
    )
    .limit(1)
  return build ?? null
}

function readNumber(value: unknown, fallback: number) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
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

function safeFileName(name: string) {
  return name.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 180) || 'artifact.tar.gz'
}

async function readJsonObject(c: Context) {
  if (!c.req.header('content-type')?.includes('application/json')) return {}
  try {
    return asRecord(await c.req.json())
  } catch {
    return {}
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function stringFromRecord(value: Record<string, unknown>, key: string) {
  const field = value[key]
  return typeof field === 'string' && field ? field : null
}
