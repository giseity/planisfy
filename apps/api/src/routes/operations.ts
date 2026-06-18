import { randomBytes, randomUUID } from "node:crypto";
import { resolveTxt } from "node:dns/promises";
import { Queue } from "bullmq";
import { Hono } from "hono";
import type { Context } from "hono";
import { and, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import {
  artifactBackups,
  customDomains,
  db,
  executionTargets,
  notificationChannels,
  platformConfig,
  previewLinks,
  processingJobLogs,
  processingJobs,
  scheduledOperations,
  storageObjects,
  workerProfiles,
  workerNodes,
  workflowTemplates,
} from "@planisfy/database";
import {
  isQueueStateActive,
  reconcileStaleProcessingJobs,
  STALE_JOB_RECONCILED_CODE,
} from "@planisfy/database/processing-job-reconciliation";
import {
  SOURCE_PROCESSING_QUEUE_NAME,
  WORKER_GEODATA_HEARTBEAT_KEY,
  WORKER_GEODATA_HEARTBEAT_STALE_MS,
} from "@planisfy/geodata-contracts";
import { getStorage } from "@planisfy/storage";
import { requireOrgPermission, type AuthEnv } from "../middleware/auth";
import { env, redisConnection } from "../env";
import { enqueueOutboxEvent } from "../lib/outbox";
import { htmlParagraphFromText, sendEmail } from "../lib/email";
import { buildNotificationPayload } from "../lib/notification-adapters";
import {
  SourceUrlRejectedError,
  validateOutboundUrl,
} from "../lib/source-url-policy";

export const operationsRoute = new Hono<AuthEnv>();

operationsRoute.use(
  "/operations/*",
  requireOrgPermission("operations.manage"),
);

const notificationSchema = z
  .object({
    name: z.string().min(1).max(128),
    provider: z.enum(["webhook", "email", "slack", "discord"]),
    target: z.string().min(1).max(2048),
    events: z.array(z.string().min(1).max(128)).default([]),
    enabled: z.boolean().default(true),
  })
  .superRefine((notification, ctx) => {
    try {
      validateNotificationTarget(notification.provider, notification.target);
    } catch (err) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          err instanceof Error
            ? err.message
            : "Notification target is not allowed",
        path: ["target"],
      });
    }
  });

const scheduleSchema = z
  .object({
    name: z.string().min(1).max(128),
    kind: z.enum(["tileset_rebuild", "source_import", "custom_command"]),
    status: z.enum(["active", "paused"]).default("active"),
    cron: z.string().min(3).max(128),
    timezone: z.string().min(1).max(64).default("UTC"),
    payload: z.record(z.string(), z.unknown()).default({}),
  })
  .superRefine((schedule, ctx) => {
    const cronValidation = parseCronExpression(schedule.cron);
    if (!cronValidation.ok) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: cronValidation.message,
        path: ["cron"],
      });
    }
    if (!isValidScheduleTimezone(schedule.timezone)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Schedule timezone must be a valid IANA time zone",
        path: ["timezone"],
      });
    }
    if (
      schedule.kind === "tileset_rebuild" &&
      typeof schedule.payload.tilesetId !== "string"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Tileset rebuild schedules require a tilesetId payload value",
        path: ["payload", "tilesetId"],
      });
    }
  });

const workerNodeSchema = z
  .object({
    name: z.string().min(1).max(128),
    kind: z.enum(["local", "remote", "cloud"]).default("local"),
    endpoint: z.string().url().optional(),
    metadata: z.record(z.string(), z.unknown()).default({}),
  })
  .superRefine((node, ctx) => {
    if (node.kind === "local" || !node.endpoint) return;
    try {
      validateRemoteWorkerEndpoint(node.endpoint);
    } catch (err) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          err instanceof Error ? err.message : "Worker endpoint is not allowed",
        path: ["endpoint"],
      });
    }
  });

const previewLinkSchema = z.object({
  resourceType: z.string().min(1).max(64),
  resourceId: z.string().uuid(),
  targetUrl: z
    .string()
    .min(1)
    .max(2048)
    .transform((target, ctx) => {
      try {
        return validatePreviewTargetUrl(target);
      } catch (err) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            err instanceof Error
              ? err.message
              : "Preview target URL is not allowed",
        });
        return z.NEVER;
      }
    }),
  slug: z.string().min(1).max(128).optional(),
  expiresAt: z.string().datetime().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

const customDomainSchema = z.object({
  resourceType: z.string().min(1).max(64),
  resourceId: z.string().uuid().optional(),
  host: z
    .string()
    .min(1)
    .max(255)
    .regex(
      /^[a-z0-9.-]+$/i,
      "Host must be a domain name without protocol or path",
    ),
  path: z.string().min(1).max(255).default("/"),
  tlsEnabled: z.boolean().default(true),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

const templateSchema = z.object({
  name: z.string().min(1).max(128),
  category: z.string().min(1).max(64),
  description: z.string().max(2000).optional(),
  template: z.record(z.string(), z.unknown()).default({}),
});

const templateApplyBodySchema = z.object({
  values: z.record(z.string(), z.unknown()).default({}),
});

const executionTargetTemplateSchema = z.object({
  name: z.string().min(1).max(128).optional(),
  provider: z.enum(["local", "aws_batch", "gcp_batch"]).default("local"),
  authMode: z.enum(["federated", "static", "external"]).default("federated"),
  region: z.string().min(1).max(128).optional(),
  config: z.record(z.string(), z.unknown()).default({}),
  workerProfile: z
    .object({
      name: z.string().min(1).max(128).optional(),
      image: z.string().max(512).optional(),
      command: z.array(z.string().max(512)).default([]),
      args: z.array(z.string().max(512)).default([]),
      cpu: z.number().int().min(1).max(128).optional(),
      memoryMb: z.number().int().min(128).max(1_048_576).optional(),
      timeoutSeconds: z.number().int().min(1).max(604_800).optional(),
      concurrency: z.number().int().min(1).max(10_000).optional(),
      config: z.record(z.string(), z.unknown()).default({}),
    })
    .optional(),
});

const storageTemplateSchema = z
  .record(z.string(), z.unknown())
  .refine((value) => Object.keys(value).length > 0, {
    message: "Storage templates must include at least one configuration key",
  });

type WorkflowTemplateForApply = {
  id: string;
  name: string;
  category: string;
  template: unknown;
};

const slackWebhookHosts = ["hooks.slack.com", "hooks.slack-gov.com"] as const;
const discordWebhookHosts = ["discord.com", "discordapp.com"] as const;

export type WorkflowTemplateApplication =
  | {
      category: "execution-target";
      values: z.infer<typeof executionTargetTemplateSchema>;
    }
  | { category: "schedule"; values: z.infer<typeof scheduleSchema> }
  | { category: "preview"; values: z.infer<typeof previewLinkSchema> }
  | { category: "storage"; values: Record<string, unknown> };

operationsRoute.get("/operations", async (c) => {
  const accountId = c.get("ownerId");
  return c.json({ data: await buildOperationsOverview(accountId) });
});

export function validateScheduleInput(input: unknown) {
  return scheduleSchema.safeParse(input);
}

operationsRoute.get("/operations/events", async (c) => {
  const accountId = c.get("ownerId");
  const encoder = new TextEncoder();
  const signal = c.req.raw.signal;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(formatSseEvent(event, data)));
      };

      try {
        let lastSignature = "";
        let lastHeartbeat = Date.now();

        while (!closed && !signal.aborted) {
          const overview = await buildOperationsOverview(accountId);
          const signature = operationsOverviewSignature(overview);
          if (signature !== lastSignature) {
            send("operations", overview);
            lastSignature = signature;
          } else if (Date.now() - lastHeartbeat > 25_000) {
            send("heartbeat", { at: new Date().toISOString() });
            lastHeartbeat = Date.now();
          }

          await abortableDelay(2_000, signal);
        }
      } catch (err) {
        if (!signal.aborted && !closed) {
          send("operations-error", {
            message:
              err instanceof Error ? err.message : "Operations stream failed",
          });
        }
      } finally {
        closed = true;
        try {
          controller.close();
        } catch {
          // The client may already have closed the stream.
        }
      }
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
});

async function buildOperationsOverview(accountId: string) {
  const [
    recentJobs,
    channels,
    schedules,
    backups,
    nodes,
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
        and(
          eq(notificationChannels.accountId, accountId),
          isNull(notificationChannels.deletedAt),
        ),
      )
      .orderBy(desc(notificationChannels.createdAt)),
    db
      .select()
      .from(scheduledOperations)
      .where(
        and(
          eq(scheduledOperations.accountId, accountId),
          isNull(scheduledOperations.deletedAt),
        ),
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
      .where(
        and(
          eq(workerNodes.accountId, accountId),
          isNull(workerNodes.deletedAt),
        ),
      )
      .orderBy(desc(workerNodes.updatedAt)),
    db
      .select()
      .from(previewLinks)
      .where(
        and(
          eq(previewLinks.accountId, accountId),
          isNull(previewLinks.deletedAt),
        ),
      )
      .orderBy(desc(previewLinks.createdAt)),
    db
      .select()
      .from(customDomains)
      .where(
        and(
          eq(customDomains.accountId, accountId),
          isNull(customDomains.deletedAt),
        ),
      )
      .orderBy(desc(customDomains.createdAt)),
    listTemplates(accountId),
    fetchWorkerHealth(),
    fetchStaleJobReconciliationSummary(accountId),
  ]);

  return {
    recentJobs,
    notificationChannels: channels.map(stripNotificationSecrets),
    scheduledOperations: schedules,
    artifactBackups: backups,
    workerNodes: nodes,
    previewLinks: previews,
    customDomains: domains,
    workflowTemplates: templates,
    workerHealth,
    staleJobReconciliation,
  };
}

type OperationsOverview = Awaited<ReturnType<typeof buildOperationsOverview>>;

export function operationsOverviewSignature(overview: OperationsOverview) {
  return JSON.stringify({
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
  });
}

operationsRoute.post("/operations/jobs/reconcile-stale", async (c) => {
  const accountId = c.get("ownerId");
  const workerHealth = await fetchWorkerHealth();
  const result = await reconcileStaleProcessingJobs({
    accountId,
    staleMs: env.GEODATA_STALE_JOB_THRESHOLD_MS,
    hasFreshWorkerHeartbeat: workerHealth.status === "healthy",
    getQueueJobLiveness: sourceQueueJobLiveness,
  });
  return c.json({ data: result });
});

operationsRoute.get("/operations/jobs/:id/timeline", async (c) => {
  const accountId = c.get("ownerId");
  const id = c.req.param("id");
  const [job] = await db
    .select()
    .from(processingJobs)
    .where(
      and(eq(processingJobs.id, id), eq(processingJobs.accountId, accountId)),
    )
    .limit(1);
  if (!job) return notFound(c, "Job not found");

  const logs = await db
    .select()
    .from(processingJobLogs)
    .where(eq(processingJobLogs.jobId, id))
    .orderBy(processingJobLogs.createdAt);

  return c.json({
    data: {
      job,
      timeline: [
        timelineEvent("queued", "Job queued", job.createdAt, "info", {}),
        ...logs.map((log) =>
          timelineEvent(
            log.id,
            log.message,
            log.createdAt,
            log.level,
            log.metadata,
          ),
        ),
        terminalJobEvent(job),
      ].filter(Boolean),
    },
  });
});

operationsRoute.post("/operations/notification-channels", async (c) => {
  const accountId = c.get("ownerId");
  const parsed = notificationSchema.safeParse(await c.req.json());
  if (!parsed.success) return validationError(c, parsed.error);

  const [created] = await db
    .insert(notificationChannels)
    .values({ accountId, ...parsed.data })
    .returning();
  return c.json({ data: stripNotificationSecrets(created!) }, 201);
});

operationsRoute.delete("/operations/notification-channels/:id", async (c) => {
  return softDeleteNotificationChannel(c);
});

operationsRoute.post(
  "/operations/notification-channels/:id/test",
  async (c) => {
    const accountId = c.get("ownerId");
    const id = c.req.param("id");
    const [channel] = await db
      .select()
      .from(notificationChannels)
      .where(
        and(
          eq(notificationChannels.id, id),
          eq(notificationChannels.accountId, accountId),
          isNull(notificationChannels.deletedAt),
        ),
      )
      .limit(1);
    if (!channel) return notFound(c, "Notification channel not found");

    const result = await sendTestNotification(channel);
    return c.json({ data: result });
  },
);

operationsRoute.post("/operations/schedules", async (c) => {
  const accountId = c.get("ownerId");
  const parsed = scheduleSchema.safeParse(await c.req.json());
  if (!parsed.success) return validationError(c, parsed.error);
  const [created] = await db
    .insert(scheduledOperations)
    .values({
      accountId,
      ...parsed.data,
      nextRunAt: nextScheduleRunAt(
        parsed.data.status,
        parsed.data.cron,
        parsed.data.timezone,
      ),
    })
    .returning();
  return c.json({ data: created }, 201);
});

operationsRoute.post("/operations/schedules/:id/run", async (c) => {
  const accountId = c.get("ownerId");
  const id = c.req.param("id");
  const [schedule] = await db
    .select()
    .from(scheduledOperations)
    .where(
      and(
        eq(scheduledOperations.id, id),
        eq(scheduledOperations.accountId, accountId),
        isNull(scheduledOperations.deletedAt),
      ),
    )
    .limit(1);
  if (!schedule) return notFound(c, "Schedule not found");
  const prepared = prepareScheduledOperationRun(schedule);
  if (!prepared.success) {
    return c.json(
      {
        error: {
          code: prepared.code,
          message: prepared.message,
        },
      },
      409,
    );
  }
  const [updated] = await db
    .update(scheduledOperations)
    .set(prepared.update)
    .where(eq(scheduledOperations.id, id))
    .returning();
  await enqueueOutboxEvent(prepared.outbox);
  return c.json({ data: { schedule: updated, queued: true } });
});

operationsRoute.delete("/operations/schedules/:id", async (c) => {
  return softDeleteSchedule(c);
});

operationsRoute.post("/operations/artifact-backups", async (c) => {
  const accountId = c.get("ownerId");
  const parsed = z
    .object({ storageObjectId: z.string().uuid() })
    .safeParse(await c.req.json());
  if (!parsed.success) return validationError(c, parsed.error);

  const [object] = await db
    .select()
    .from(storageObjects)
    .where(
      and(
        eq(storageObjects.id, parsed.data.storageObjectId),
        eq(storageObjects.accountId, accountId),
        isNull(storageObjects.deletedAt),
      ),
    )
    .limit(1);
  if (!object) return notFound(c, "Storage object not found");

  const storage = getStorage();
  const storageInfo = storage.getInfo();
  const backupKey = `backups/${accountId}/${object.id}/${Date.now()}-${object.fileName ?? "artifact"}`;

  const result = await db.transaction(async (tx) => {
    await lockArtifactOperation(tx, object.id);

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
      .returning();

    try {
      await storage.copy(object.storageKey, backup!.backupStorageKey);
      const [updated] = await tx
        .update(artifactBackups)
        .set({ status: "completed", completedAt: new Date() })
        .where(eq(artifactBackups.id, backup!.id))
        .returning();
      return { data: updated, status: 201 as const };
    } catch (err) {
      const [failed] = await tx
        .update(artifactBackups)
        .set({
          status: "failed",
          errorMessage: errorMessage(err),
          completedAt: new Date(),
        })
        .where(eq(artifactBackups.id, backup!.id))
        .returning();
      return { data: failed, status: 500 as const };
    }
  });

  return c.json({ data: result.data }, result.status);
});

operationsRoute.post("/operations/artifact-backups/:id/restore", async (c) => {
  const accountId = c.get("ownerId");
  const id = c.req.param("id");
  const result = await db.transaction(async (tx) => {
    const [backup] = await tx
      .select()
      .from(artifactBackups)
      .where(
        and(
          eq(artifactBackups.id, id),
          eq(artifactBackups.accountId, accountId),
        ),
      )
      .limit(1);
    if (!backup) return { kind: "not-found" as const };
    if (backup.status !== "completed" && backup.status !== "restored") {
      return { kind: "invalid-state" as const };
    }

    await lockArtifactOperation(tx, backup.storageObjectId ?? backup.id);
    await getStorage().copy(backup.backupStorageKey, backup.sourceStorageKey);
    const [updated] = await tx
      .update(artifactBackups)
      .set({ status: "restored", restoredAt: new Date() })
      .where(
        and(
          eq(artifactBackups.id, id),
          inArray(artifactBackups.status, ["completed", "restored"]),
        ),
      )
      .returning();

    return updated
      ? { kind: "restored" as const, data: updated }
      : { kind: "invalid-state" as const };
  });

  if (result.kind === "not-found") return notFound(c, "Backup not found");
  if (result.kind === "invalid-state") {
    return c.json(
      {
        error: {
          code: "INVALID_BACKUP_STATE",
          message: "Backup is not restorable",
        },
      },
      400,
    );
  }
  return c.json({ data: result.data });
});

operationsRoute.post("/operations/worker-nodes", async (c) => {
  const accountId = c.get("ownerId");
  const parsed = workerNodeSchema.safeParse(await c.req.json());
  if (!parsed.success) return validationError(c, parsed.error);
  const validation = await validateWorkerNode(
    parsed.data.kind,
    parsed.data.endpoint,
  );
  const [created] = await db
    .insert(workerNodes)
    .values({
      accountId,
      ...parsed.data,
      status: validation.ok ? "healthy" : "degraded",
      validation,
      lastSeenAt: validation.ok ? new Date() : null,
    })
    .returning();
  return c.json({ data: created }, 201);
});

operationsRoute.post("/operations/worker-nodes/:id/validate", async (c) => {
  const accountId = c.get("ownerId");
  const id = c.req.param("id");
  const [node] = await db
    .select()
    .from(workerNodes)
    .where(
      and(
        eq(workerNodes.id, id),
        eq(workerNodes.accountId, accountId),
        isNull(workerNodes.deletedAt),
      ),
    )
    .limit(1);
  if (!node) return notFound(c, "Worker node not found");
  const validation = await validateWorkerNode(
    node.kind,
    node.endpoint ?? undefined,
  );
  const [updated] = await db
    .update(workerNodes)
    .set({
      status: validation.ok ? "healthy" : "degraded",
      validation,
      lastSeenAt: validation.ok ? new Date() : node.lastSeenAt,
      updatedAt: new Date(),
    })
    .where(eq(workerNodes.id, id))
    .returning();
  return c.json({ data: updated });
});

operationsRoute.delete("/operations/worker-nodes/:id", async (c) => {
  return softDeleteWorkerNode(c);
});

operationsRoute.post("/operations/preview-links", async (c) => {
  const accountId = c.get("ownerId");
  const parsed = previewLinkSchema.safeParse(await c.req.json());
  if (!parsed.success) return validationError(c, parsed.error);
  const [created] = await db
    .insert(previewLinks)
    .values({
      accountId,
      ...parsed.data,
      slug: parsed.data.slug ?? previewSlug(parsed.data.resourceType),
      expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
    })
    .returning();
  return c.json({ data: created }, 201);
});

operationsRoute.delete("/operations/preview-links/:id", async (c) => {
  return softDeletePreviewLink(c);
});

operationsRoute.post("/operations/custom-domains", async (c) => {
  const accountId = c.get("ownerId");
  const parsed = customDomainSchema.safeParse(await c.req.json());
  if (!parsed.success) return validationError(c, parsed.error);
  const [created] = await db
    .insert(customDomains)
    .values({
      accountId,
      ...parsed.data,
      verificationToken: `planisfy-domain-${randomBytes(16).toString("hex")}`,
    })
    .returning();
  return c.json({ data: created }, 201);
});

operationsRoute.post("/operations/custom-domains/:id/verify", async (c) => {
  const accountId = c.get("ownerId");
  const id = c.req.param("id");
  const [domain] = await db
    .select()
    .from(customDomains)
    .where(
      and(
        eq(customDomains.id, id),
        eq(customDomains.accountId, accountId),
        isNull(customDomains.deletedAt),
      ),
    )
    .limit(1);
  if (!domain) return notFound(c, "Custom domain not found");
  const verification = await verifyDomainDns(
    domain.host,
    domain.verificationToken,
  );
  const [updated] = await db
    .update(customDomains)
    .set({
      status: verification.verified ? "verified" : "failed",
      metadata: {
        ...(isObjectRecord(domain.metadata) ? domain.metadata : {}),
        verification,
      },
      updatedAt: new Date(),
    })
    .where(eq(customDomains.id, id))
    .returning();
  return c.json({ data: updated });
});

operationsRoute.delete("/operations/custom-domains/:id", async (c) => {
  return softDeleteCustomDomain(c);
});

operationsRoute.post("/operations/workflow-templates", async (c) => {
  const accountId = c.get("ownerId");
  const parsed = templateSchema.safeParse(await c.req.json());
  if (!parsed.success) return validationError(c, parsed.error);
  const [created] = await db
    .insert(workflowTemplates)
    .values({ accountId, ...parsed.data, builtIn: false })
    .returning();
  return c.json({ data: created }, 201);
});

operationsRoute.post("/operations/workflow-templates/:id/apply", async (c) => {
  const accountId = c.get("ownerId");
  const id = c.req.param("id");
  const template = (await listTemplates(accountId)).find(
    (row) => row.id === id,
  );
  if (!template) return notFound(c, "Workflow template not found");

  const body = templateApplyBodySchema.safeParse(await readJsonObject(c));
  if (!body.success) return validationError(c, body.error);

  const prepared = prepareWorkflowTemplateApplication(
    template,
    body.data.values,
  );
  if (!prepared.success) return validationError(c, prepared.error);

  const application = prepared.data;
  if (application.category === "schedule") {
    const [created] = await db
      .insert(scheduledOperations)
      .values({
        accountId,
        ...application.values,
        nextRunAt: nextScheduleRunAt(
          application.values.status,
          application.values.cron,
          application.values.timezone,
        ),
      })
      .returning();
    return c.json(
      { data: { applied: true, category: "schedule", schedule: created } },
      201,
    );
  }

  if (application.category === "preview") {
    const [created] = await db
      .insert(previewLinks)
      .values({
        accountId,
        ...application.values,
        slug:
          application.values.slug ??
          previewSlug(application.values.resourceType),
        expiresAt: application.values.expiresAt
          ? new Date(application.values.expiresAt)
          : null,
      })
      .returning();
    return c.json(
      { data: { applied: true, category: "preview", previewLink: created } },
      201,
    );
  }

  if (application.category === "execution-target") {
    if (env.DEPLOYMENT_MODE === "managed") {
      return c.json(
        {
          error: {
            code: "CAPABILITY_UNAVAILABLE",
            message:
              "Customer execution targets are unavailable in managed deployments.",
          },
        },
        409,
      );
    }

    const [target] = await db
      .insert(executionTargets)
      .values({
        accountId,
        name: application.values.name ?? template.name,
        provider: application.values.provider,
        authMode: application.values.authMode,
        region: application.values.region ?? null,
        config: application.values.config,
        encryptedCredentials: {},
      })
      .returning();

    let profile: typeof workerProfiles.$inferSelect | null = null;
    if (application.values.workerProfile) {
      const [createdProfile] = await db
        .insert(workerProfiles)
        .values({
          accountId,
          name:
            application.values.workerProfile.name ??
            `${application.values.name ?? template.name} profile`,
          image: application.values.workerProfile.image ?? null,
          command: application.values.workerProfile.command,
          args: application.values.workerProfile.args,
          cpu: application.values.workerProfile.cpu ?? null,
          memoryMb: application.values.workerProfile.memoryMb ?? null,
          timeoutSeconds:
            application.values.workerProfile.timeoutSeconds ?? null,
          concurrency: application.values.workerProfile.concurrency ?? null,
          config: application.values.workerProfile.config,
        })
        .returning();
      profile = createdProfile ?? null;
    }

    return c.json(
      {
        data: {
          applied: true,
          category: "execution-target",
          executionTarget: target,
          workerProfile: profile,
        },
      },
      201,
    );
  }

  const keys = Object.keys(application.values);
  const matchingConfig = await db
    .select({ key: platformConfig.key })
    .from(platformConfig)
    .where(inArray(platformConfig.key, keys));
  if (matchingConfig.length === 0) {
    return c.json({
      data: {
        applied: false,
        category: "storage",
        status: "requires_admin_config",
        message:
          "No matching platform storage settings are available for this template.",
        requiredKeys: keys,
      },
    });
  }

  return c.json({
    data: {
      applied: false,
      category: "storage",
      status: "configuration_draft",
      config: application.values,
      matchingConfigKeys: matchingConfig.map((row) => row.key),
    },
  });
});

operationsRoute.delete("/operations/workflow-templates/:id", async (c) => {
  return softDeleteWorkflowTemplate(c);
});

async function listTemplates(accountId: string) {
  const rows = await db
    .select()
    .from(workflowTemplates)
    .where(
      and(
        isNull(workflowTemplates.deletedAt),
        eq(workflowTemplates.accountId, accountId),
      ),
    )
    .orderBy(desc(workflowTemplates.createdAt));
  return [...builtInTemplates(), ...rows];
}

function builtInTemplates() {
  const now = new Date();
  return [
    {
      id: "builtin-minio-storage",
      accountId: null,
      name: "Local MinIO storage",
      category: "storage",
      description:
        "S3-compatible local storage settings for the with-minio Compose profile.",
      template: {
        STORAGE_PROVIDER: "s3",
        S3_BUCKET: "planisfy-artifacts",
        S3_REGION: "auto",
        S3_ENDPOINT: "http://minio:9000",
        S3_PUBLIC_URL: "http://localhost:9000/planisfy-artifacts",
      },
      builtIn: true,
      createdAt: now,
      deletedAt: null,
    },
    {
      id: "builtin-aws-batch-target",
      accountId: null,
      name: "AWS Batch geodata target",
      category: "execution-target",
      description: "Execution target defaults for AWS Batch geodata workers.",
      template: {
        provider: "aws_batch",
        authMode: "federated",
        region: "us-east-1",
        config: {
          jobQueue: "planisfy-geodata",
          jobDefinition: "planisfy-geodata-worker",
        },
      },
      builtIn: true,
      createdAt: now,
      deletedAt: null,
    },
    {
      id: "builtin-local-worker",
      accountId: null,
      name: "Local Docker worker",
      category: "execution-target",
      description:
        "Self-hosted tiling worker profile with common GDAL, DuckDB, and Tippecanoe defaults.",
      template: {
        provider: "local",
        workerProfile: { cpu: 2, memoryMb: 4096, timeoutSeconds: 900 },
      },
      builtIn: true,
      createdAt: now,
      deletedAt: null,
    },
    {
      id: "builtin-overture-refresh",
      accountId: null,
      name: "Nightly Overture refresh",
      category: "schedule",
      description: "Recurring source import refresh for an Overture dataset.",
      template: {
        kind: "source_import",
        cron: "0 2 * * *",
        payload: { provider: "OVERTURE" },
      },
      builtIn: true,
      createdAt: now,
      deletedAt: null,
    },
    {
      id: "builtin-preview-tileset",
      accountId: null,
      name: "Preview tileset link",
      category: "preview",
      description:
        "Temporary TileJSON preview URL for review before publishing.",
      template: {
        resourceType: "tileset",
        ttlHours: 72,
      },
      builtIn: true,
      createdAt: now,
      deletedAt: null,
    },
  ];
}

export function prepareWorkflowTemplateApplication(
  template: WorkflowTemplateForApply,
  values: Record<string, unknown> = {},
):
  | { success: true; data: WorkflowTemplateApplication }
  | { success: false; error: z.ZodError } {
  const base = isObjectRecord(template.template) ? template.template : {};
  const merged = { ...base, ...values };

  if (template.category === "execution-target") {
    const parsed = executionTargetTemplateSchema.safeParse(merged);
    return parsed.success
      ? {
          success: true,
          data: { category: "execution-target", values: parsed.data },
        }
      : { success: false, error: parsed.error };
  }

  if (template.category === "schedule") {
    const parsed = scheduleSchema.safeParse({
      name: template.name,
      ...merged,
    });
    return parsed.success
      ? { success: true, data: { category: "schedule", values: parsed.data } }
      : { success: false, error: parsed.error };
  }

  if (template.category === "preview") {
    const ttlHours =
      typeof merged.ttlHours === "number" && Number.isFinite(merged.ttlHours)
        ? merged.ttlHours
        : null;
    const parsed = previewLinkSchema.safeParse({
      ...merged,
      expiresAt:
        typeof merged.expiresAt === "string"
          ? merged.expiresAt
          : ttlHours
            ? new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString()
            : undefined,
    });
    return parsed.success
      ? { success: true, data: { category: "preview", values: parsed.data } }
      : { success: false, error: parsed.error };
  }

  if (template.category === "storage") {
    const parsed = storageTemplateSchema.safeParse(merged);
    return parsed.success
      ? { success: true, data: { category: "storage", values: parsed.data } }
      : { success: false, error: parsed.error };
  }

  const error = new z.ZodError([
    {
      code: z.ZodIssueCode.custom,
      path: ["category"],
      message: `Unsupported workflow template category: ${template.category}`,
    },
  ]);
  return { success: false, error };
}

async function fetchWorkerHealth() {
  const startedAt = Date.now();
  try {
    const Redis = await import("ioredis").then((m) => m.default);
    const redis = new Redis({
      ...redisConnection,
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      lazyConnect: true,
    });
    await redis.connect();
    const heartbeat = await redis.get(WORKER_GEODATA_HEARTBEAT_KEY);
    await redis.quit();
    if (!heartbeat) {
      return {
        status: "offline",
        message: "No geodata worker heartbeat",
        latencyMs: Date.now() - startedAt,
      };
    }
    const parsed = JSON.parse(heartbeat) as {
      timestamp?: string;
      toolchain?: unknown;
    };
    const timestamp = parsed.timestamp ? Date.parse(parsed.timestamp) : NaN;
    const ageMs = Number.isFinite(timestamp) ? Date.now() - timestamp : null;
    return {
      status:
        ageMs !== null && ageMs <= WORKER_GEODATA_HEARTBEAT_STALE_MS
          ? "healthy"
          : "degraded",
      message:
        ageMs === null
          ? "Invalid heartbeat"
          : `Heartbeat ${Math.round(ageMs / 1000)}s ago`,
      latencyMs: ageMs,
      toolchain: parsed.toolchain,
    };
  } catch (err) {
    return {
      status: "offline",
      message: errorMessage(err),
      latencyMs: Date.now() - startedAt,
    };
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
          eq(processingJobs.errorCode, STALE_JOB_RECONCILED_CODE),
        ),
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
          eq(processingJobs.errorCode, STALE_JOB_RECONCILED_CODE),
        ),
      )
      .orderBy(desc(processingJobs.updatedAt))
      .limit(5),
  ]);

  return {
    reconciled: countRow?.count ?? 0,
    latest,
  };
}

async function sourceQueueJobLiveness(jobId: string) {
  const queue = new Queue(SOURCE_PROCESSING_QUEUE_NAME, {
    connection: redisConnection,
  });
  try {
    const job = await queue.getJob(jobId);
    const state = job ? await job.getState() : null;
    return { state, active: isQueueStateActive(state) };
  } finally {
    await queue.close();
  }
}

async function validateWorkerNode(
  kind: "local" | "remote" | "cloud",
  endpoint?: string,
) {
  if (kind === "local") {
    const health = await fetchWorkerHealth();
    return {
      ok: health.status === "healthy",
      checks: [{ id: "heartbeat", ...health }],
    };
  }
  if (!endpoint) {
    return {
      ok: false,
      checks: [
        { id: "endpoint", status: "failed", message: "Endpoint is required" },
      ],
    };
  }
  try {
    const validatedEndpoint = validateRemoteWorkerEndpoint(endpoint);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(validatedEndpoint, {
      redirect: "manual",
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));
    return {
      ok: response.ok,
      checks: [
        {
          id: "endpoint",
          status: response.ok ? "healthy" : "failed",
          message: `${response.status} ${response.statusText}`,
        },
      ],
    };
  } catch (err) {
    return {
      ok: false,
      checks: [
        { id: "endpoint", status: "failed", message: errorMessage(err) },
      ],
    };
  }
}

function validateRemoteWorkerEndpoint(endpoint: string) {
  return validateOutboundUrl(endpoint);
}

export function validateNotificationTarget(
  provider: "webhook" | "email" | "slack" | "discord",
  target: string,
) {
  if (provider === "email") return target;
  if (provider === "slack") {
    return validateProviderWebhookUrl(target, slackWebhookHosts);
  }
  if (provider === "discord") {
    return validateProviderWebhookUrl(target, discordWebhookHosts);
  }
  return validateOutboundUrl(target);
}

export function validatePreviewTargetUrl(target: string) {
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    throw new Error("Preview target URL must be a valid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Preview target URL must use http or https");
  }
  return url.toString();
}

function validateProviderWebhookUrl(
  target: string,
  allowedHosts: readonly string[],
) {
  const href = validateOutboundUrl(target, { allowedHosts });
  if (new URL(href).protocol !== "https:") {
    throw new SourceUrlRejectedError("Webhook URL must use https");
  }
  return href;
}

async function sendTestNotification(
  channel: typeof notificationChannels.$inferSelect,
) {
  const event = {
    event: "notification.test",
    message: "Planisfy test notification",
    timestamp: new Date().toISOString(),
  };
  return deliverNotification(channel, event);
}

export async function deliverNotification(
  channel: Pick<
    typeof notificationChannels.$inferSelect,
    "provider" | "target"
  >,
  event: {
    event: string;
    message: string;
    timestamp: string;
    metadata?: Record<string, unknown>;
  },
) {
  if (channel.provider === "email") {
    const body = buildNotificationPayload("email", event) as {
      subject: string;
      text: string;
    };
    if (!env.RESEND_API_KEY) {
      return {
        delivered: false,
        adapter: "email",
        status: 503,
        code: "EMAIL_UNAVAILABLE",
        payload: body,
        message:
          "Email delivery is unavailable because Resend is not configured.",
      };
    }
    const delivered = await sendEmail({
      to: channel.target,
      subject: body.subject,
      html: htmlParagraphFromText(body.text),
      text: body.text,
    });
    return {
      delivered,
      adapter: "email",
      status: delivered ? 202 : 502,
      payload: body,
      message: delivered
        ? "Email adapter accepted test payload"
        : "Email adapter failed to send test payload",
    };
  }

  const body = buildNotificationPayload(channel.provider, event);
  let target: string;
  try {
    target = validateNotificationTarget(channel.provider, channel.target);
  } catch (err) {
    return {
      delivered: false,
      adapter: channel.provider,
      status: 400,
      code: "NOTIFICATION_TARGET_REJECTED",
      payload: body,
      message:
        err instanceof SourceUrlRejectedError
          ? err.message
          : "Notification target is not allowed",
    };
  }

  const response = await fetch(target, {
    method: "POST",
    redirect: "manual",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return {
    delivered: response.ok,
    adapter: channel.provider,
    status: response.status,
    payload: body,
    message: response.ok
      ? "Notification endpoint accepted test payload"
      : response.statusText,
  };
}

async function verifyDomainDns(host: string, token: string) {
  const checkedAt = new Date().toISOString();
  const candidates = [`_planisfy.${host}`, host];
  const checks = [];

  for (const candidate of candidates) {
    try {
      const records = (await resolveTxt(candidate)).map((parts) =>
        parts.join(""),
      );
      const matched = records.some((record) => record.includes(token));
      checks.push({
        host: candidate,
        status: matched ? "matched" : "missing",
        records,
      });
      if (matched) {
        return {
          verified: true,
          checkedAt,
          method: "TXT",
          expected: token,
          checks,
        };
      }
    } catch (err) {
      checks.push({
        host: candidate,
        status: "error",
        error: errorMessage(err),
      });
    }
  }

  return {
    verified: false,
    checkedAt,
    method: "TXT",
    expected: token,
    checks,
  };
}

function stripNotificationSecrets(
  channel: typeof notificationChannels.$inferSelect,
) {
  return {
    ...channel,
    encryptedConfig: undefined,
    hasConfig: Boolean(
      channel.encryptedConfig &&
      typeof channel.encryptedConfig === "object" &&
      Object.keys(channel.encryptedConfig).length > 0,
    ),
  };
}

function timelineEvent(
  id: string,
  message: string,
  timestamp: Date | string | null,
  level: string,
  metadata: unknown,
) {
  return {
    id,
    message,
    timestamp,
    level,
    metadata,
  };
}

function terminalJobEvent(job: typeof processingJobs.$inferSelect) {
  if (!job.completedAt) return null;
  return timelineEvent(
    job.status.toLowerCase(),
    `Job ${job.status.toLowerCase()}`,
    job.completedAt,
    job.status === "SUCCEEDED" ? "info" : "error",
    { errorCode: job.errorCode, errorMessage: job.errorMessage },
  );
}

async function softDeleteNotificationChannel(c: Context) {
  const accountId = c.get("ownerId");
  const id = c.req.param("id");
  if (!id) return missingRouteParam(c, "id");
  const [row] = await db
    .select({ id: notificationChannels.id })
    .from(notificationChannels)
    .where(
      and(
        eq(notificationChannels.id, id),
        eq(notificationChannels.accountId, accountId),
        isNull(notificationChannels.deletedAt),
      ),
    )
    .limit(1);
  if (!row) return notFound(c, "Notification channel not found");
  await db
    .update(notificationChannels)
    .set({ deletedAt: new Date() })
    .where(eq(notificationChannels.id, id));
  return c.json({ data: { id, deleted: true } });
}

async function softDeleteSchedule(c: Context) {
  const accountId = c.get("ownerId");
  const id = c.req.param("id");
  if (!id) return missingRouteParam(c, "id");
  const [row] = await db
    .select({ id: scheduledOperations.id })
    .from(scheduledOperations)
    .where(
      and(
        eq(scheduledOperations.id, id),
        eq(scheduledOperations.accountId, accountId),
        isNull(scheduledOperations.deletedAt),
      ),
    )
    .limit(1);
  if (!row) return notFound(c, "Schedule not found");
  await db
    .update(scheduledOperations)
    .set({ deletedAt: new Date() })
    .where(eq(scheduledOperations.id, id));
  return c.json({ data: { id, deleted: true } });
}

async function softDeleteWorkerNode(c: Context) {
  const accountId = c.get("ownerId");
  const id = c.req.param("id");
  if (!id) return missingRouteParam(c, "id");
  const [row] = await db
    .select({ id: workerNodes.id })
    .from(workerNodes)
    .where(
      and(
        eq(workerNodes.id, id),
        eq(workerNodes.accountId, accountId),
        isNull(workerNodes.deletedAt),
      ),
    )
    .limit(1);
  if (!row) return notFound(c, "Worker node not found");
  await db
    .update(workerNodes)
    .set({ deletedAt: new Date() })
    .where(eq(workerNodes.id, id));
  return c.json({ data: { id, deleted: true } });
}

async function softDeletePreviewLink(c: Context) {
  const accountId = c.get("ownerId");
  const id = c.req.param("id");
  if (!id) return missingRouteParam(c, "id");
  const [row] = await db
    .select({ id: previewLinks.id })
    .from(previewLinks)
    .where(
      and(
        eq(previewLinks.id, id),
        eq(previewLinks.accountId, accountId),
        isNull(previewLinks.deletedAt),
      ),
    )
    .limit(1);
  if (!row) return notFound(c, "Preview link not found");
  await db
    .update(previewLinks)
    .set({ deletedAt: new Date() })
    .where(eq(previewLinks.id, id));
  return c.json({ data: { id, deleted: true } });
}

async function softDeleteCustomDomain(c: Context) {
  const accountId = c.get("ownerId");
  const id = c.req.param("id");
  if (!id) return missingRouteParam(c, "id");
  const [row] = await db
    .select({ id: customDomains.id })
    .from(customDomains)
    .where(
      and(
        eq(customDomains.id, id),
        eq(customDomains.accountId, accountId),
        isNull(customDomains.deletedAt),
      ),
    )
    .limit(1);
  if (!row) return notFound(c, "Custom domain not found");
  await db
    .update(customDomains)
    .set({ deletedAt: new Date() })
    .where(eq(customDomains.id, id));
  return c.json({ data: { id, deleted: true } });
}

async function softDeleteWorkflowTemplate(c: Context) {
  const accountId = c.get("ownerId");
  const id = c.req.param("id");
  if (!id) return missingRouteParam(c, "id");
  const [row] = await db
    .select({ id: workflowTemplates.id })
    .from(workflowTemplates)
    .where(
      and(
        eq(workflowTemplates.id, id),
        eq(workflowTemplates.accountId, accountId),
        isNull(workflowTemplates.deletedAt),
      ),
    )
    .limit(1);
  if (!row) return notFound(c, "Workflow template not found");
  await db
    .update(workflowTemplates)
    .set({ deletedAt: new Date() })
    .where(eq(workflowTemplates.id, id));
  return c.json({ data: { id, deleted: true } });
}

type CronFieldName = "minute" | "hour" | "dayOfMonth" | "month" | "dayOfWeek";
type ParsedCronField = {
  values: Set<number>;
  wildcard: boolean;
};
type ParsedCronExpression = Record<CronFieldName, ParsedCronField>;
type ScheduledOperationForRun = Pick<
  typeof scheduledOperations.$inferSelect,
  | "id"
  | "accountId"
  | "kind"
  | "status"
  | "cron"
  | "timezone"
  | "payload"
  | "deletedAt"
>;

export function prepareScheduledOperationRun(
  schedule: ScheduledOperationForRun,
  now = new Date(),
) {
  if (schedule.deletedAt) {
    return {
      success: false as const,
      code: "SCHEDULE_DELETED",
      message: "Deleted schedules cannot be run.",
    };
  }
  if (schedule.status !== "active") {
    return {
      success: false as const,
      code: "SCHEDULE_PAUSED",
      message: "Paused schedules cannot be run until they are reactivated.",
    };
  }

  return {
    success: true as const,
    update: {
      lastRunAt: now,
      nextRunAt: nextScheduleRunAt(
        schedule.status,
        schedule.cron,
        schedule.timezone,
        now,
      ),
      updatedAt: now,
    },
    outbox: {
      eventName: "scheduled_operation.run_requested" as const,
      payload: {
        accountId: schedule.accountId,
        scheduleId: schedule.id,
        kind: schedule.kind,
        payload: isObjectRecord(schedule.payload) ? schedule.payload : {},
        requestedAt: now.toISOString(),
      },
    },
  };
}

export function nextScheduleRunAt(
  status: "active" | "paused",
  cron: string,
  timezone: string,
  from = new Date(),
) {
  if (status === "paused") return null;
  const parsed = parseCronExpression(cron);
  if (!parsed.ok) return null;

  const candidate = new Date(from);
  candidate.setUTCSeconds(0, 0);
  candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);

  const maxMinutes = 366 * 24 * 60;
  for (let i = 0; i < maxMinutes; i += 1) {
    if (cronMatches(candidate, parsed.expression, timezone)) {
      return new Date(candidate);
    }
    candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);
  }
  return null;
}

function parseCronExpression(cron: string):
  | { ok: true; expression: ParsedCronExpression }
  | { ok: false; message: string } {
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5) {
    return {
      ok: false,
      message: "Schedule cron must use five fields: minute hour day month weekday",
    };
  }

  const minute = parseCronField(fields[0]!, 0, 59);
  const hour = parseCronField(fields[1]!, 0, 23);
  const dayOfMonth = parseCronField(fields[2]!, 1, 31);
  const month = parseCronField(fields[3]!, 1, 12);
  const dayOfWeek = parseCronField(fields[4]!, 0, 7, { normalizeSeven: true });
  if (!minute || !hour || !dayOfMonth || !month || !dayOfWeek) {
    return {
      ok: false,
      message:
        "Schedule cron fields may use *, numbers, ranges, lists, and steps.",
    };
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
  };
}

function parseCronField(
  field: string,
  min: number,
  max: number,
  options: { normalizeSeven?: boolean } = {},
): ParsedCronField | null {
  const values = new Set<number>();
  const tokens = field.split(",");
  let wildcard = tokens.length === 1 && tokens[0] === "*";

  for (const token of tokens) {
    if (!token) return null;
    const [rangeToken, stepToken] = token.split("/");
    const step = stepToken === undefined ? 1 : Number(stepToken);
    if (!Number.isInteger(step) || step < 1) return null;

    let start: number;
    let end: number;
    if (rangeToken === "*") {
      start = min;
      end = max;
    } else if (rangeToken?.includes("-")) {
      const [rawStart, rawEnd] = rangeToken.split("-");
      start = Number(rawStart);
      end = Number(rawEnd);
    } else {
      start = Number(rangeToken);
      end = start;
    }

    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < min ||
      end > max ||
      start > end
    ) {
      return null;
    }

    for (let value = start; value <= end; value += step) {
      values.add(options.normalizeSeven && value === 7 ? 0 : value);
    }
  }

  if (values.size === 0) return null;
  wildcard ||= values.size === max - min + 1;
  return { values, wildcard };
}

export function isValidScheduleTimezone(timezone: string) {
  try {
    Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

function cronMatches(
  date: Date,
  cron: ParsedCronExpression,
  timezone: string,
) {
  const parts = zonedDateParts(date, timezone);
  const dayOfMonthMatches = cron.dayOfMonth.values.has(parts.day);
  const dayOfWeekMatches = cron.dayOfWeek.values.has(parts.dayOfWeek);
  const dayMatches =
    cron.dayOfMonth.wildcard && cron.dayOfWeek.wildcard
      ? true
      : cron.dayOfMonth.wildcard
        ? dayOfWeekMatches
        : cron.dayOfWeek.wildcard
          ? dayOfMonthMatches
          : dayOfMonthMatches || dayOfWeekMatches;

  return (
    cron.minute.values.has(parts.minute) &&
    cron.hour.values.has(parts.hour) &&
    cron.month.values.has(parts.month) &&
    dayMatches
  );
}

function zonedDateParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  const year = get("year");
  const month = get("month");
  const day = get("day");

  return {
    year,
    month,
    day,
    hour: get("hour"),
    minute: get("minute"),
    dayOfWeek: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
  };
}

function previewSlug(resourceType: string) {
  return `${resourceType}-${randomUUID().slice(0, 8)}`;
}

async function readJsonObject(c: Context) {
  if (!c.req.header("content-type")?.includes("application/json")) return {};
  try {
    const body = (await c.req.json()) as unknown;
    return isObjectRecord(body) ? body : {};
  } catch {
    return {};
  }
}

function validationError(c: Context, error: z.ZodError) {
  return c.json(
    {
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request data",
        details: error.flatten(),
      },
    },
    400,
  );
}

function notFound(c: Context, message: string) {
  return c.json({ error: { code: "NOT_FOUND", message } }, 404);
}

function missingRouteParam(c: Context, param: string) {
  return c.json(
    {
      error: {
        code: "BAD_REQUEST",
        message: `Missing route parameter: ${param}`,
      },
    },
    400,
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

type AdvisoryLockExecutor = {
  execute(query: SQL): Promise<unknown>;
};

async function lockArtifactOperation(
  tx: AdvisoryLockExecutor,
  storageObjectId: string,
) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`artifactOperation:${storageObjectId}`}))`,
  );
}

export function formatSseEvent(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function abortableDelay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }

    const timeout = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
