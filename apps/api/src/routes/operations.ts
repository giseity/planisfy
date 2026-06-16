import { randomBytes, randomUUID } from "node:crypto";
import { resolveTxt } from "node:dns/promises";
import { Hono } from "hono";
import type { Context } from "hono";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
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
  WORKER_GEODATA_HEARTBEAT_KEY,
  WORKER_GEODATA_HEARTBEAT_STALE_MS,
} from "@planisfy/geodata-contracts";
import { getStorage } from "@planisfy/storage";
import { requireOrgMutationPermission, type AuthEnv } from "../middleware/auth";
import { env, redisConnection } from "../env";
import { enqueueOutboxEvent } from "../lib/outbox";
import { sendEmail } from "../lib/email";
import { buildNotificationPayload } from "../lib/notification-adapters";
import {
  SourceUrlRejectedError,
  validateOutboundUrl,
} from "../lib/source-url-policy";

export const operationsRoute = new Hono<AuthEnv>();

operationsRoute.use(
  "/operations/*",
  requireOrgMutationPermission("operations.manage"),
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
  targetUrl: z.string().min(1).max(2048),
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
  });
}

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
      nextRunAt: roughNextRunAt(parsed.data.status),
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
  const [updated] = await db
    .update(scheduledOperations)
    .set({
      lastRunAt: new Date(),
      nextRunAt: roughNextRunAt(schedule.status),
      updatedAt: new Date(),
    })
    .where(eq(scheduledOperations.id, id))
    .returning();
  await enqueueOutboxEvent({
    eventName: "scheduled_operation.run_requested",
    payload: {
      accountId,
      scheduleId: schedule.id,
      kind: schedule.kind,
      payload: isObjectRecord(schedule.payload) ? schedule.payload : {},
      requestedAt: new Date().toISOString(),
    },
  });
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
  const [backup] = await db
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
    await storage.copy(object.storageKey, backupKey);
    const [updated] = await db
      .update(artifactBackups)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(artifactBackups.id, backup!.id))
      .returning();
    return c.json({ data: updated }, 201);
  } catch (err) {
    const [failed] = await db
      .update(artifactBackups)
      .set({
        status: "failed",
        errorMessage: errorMessage(err),
        completedAt: new Date(),
      })
      .where(eq(artifactBackups.id, backup!.id))
      .returning();
    return c.json({ data: failed }, 500);
  }
});

operationsRoute.post("/operations/artifact-backups/:id/restore", async (c) => {
  const accountId = c.get("ownerId");
  const id = c.req.param("id");
  const [backup] = await db
    .select()
    .from(artifactBackups)
    .where(
      and(eq(artifactBackups.id, id), eq(artifactBackups.accountId, accountId)),
    )
    .limit(1);
  if (!backup) return notFound(c, "Backup not found");
  if (backup.status !== "completed" && backup.status !== "restored") {
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
  await getStorage().copy(backup.backupStorageKey, backup.sourceStorageKey);
  const [updated] = await db
    .update(artifactBackups)
    .set({ status: "restored", restoredAt: new Date() })
    .where(eq(artifactBackups.id, id))
    .returning();
  return c.json({ data: updated });
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
        nextRunAt: roughNextRunAt(application.values.status),
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
      html: `<p>${body.text.replaceAll("\n", "<br />")}</p>`,
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

function roughNextRunAt(status: "active" | "paused") {
  return status === "active" ? new Date(Date.now() + 60 * 60 * 1000) : null;
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
