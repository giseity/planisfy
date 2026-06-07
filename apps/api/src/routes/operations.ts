import { randomBytes, randomUUID } from "node:crypto";
import { resolveTxt } from "node:dns/promises";
import { Hono } from "hono";
import type { Context } from "hono";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import {
  artifactBackups,
  customDomains,
  db,
  notificationChannels,
  previewLinks,
  processingJobLogs,
  processingJobs,
  scheduledOperations,
  storageObjects,
  workerNodes,
  workflowTemplates,
} from "@planisfy/database";
import { getStorage } from "@planisfy/storage";
import type { AuthEnv } from "../middleware/auth";
import { redisConnection } from "../env";
import { enqueueOutboxEvent } from "../lib/outbox";
import {
  buildNotificationPayload,
  notificationDeliveryMode,
} from "../lib/notification-adapters";

export const operationsRoute = new Hono<AuthEnv>();

const WORKER_GEODATA_HEARTBEAT_KEY = "planisfy:worker-geodata:heartbeat";

const notificationSchema = z.object({
  name: z.string().min(1).max(128),
  provider: z.enum(["webhook", "email", "slack", "discord"]),
  target: z.string().min(1).max(2048),
  events: z.array(z.string().min(1).max(128)).default([]),
  enabled: z.boolean().default(true),
});

const scheduleSchema = z.object({
  name: z.string().min(1).max(128),
  kind: z.enum(["tileset_rebuild", "source_import", "custom_command"]),
  status: z.enum(["active", "paused"]).default("active"),
  cron: z.string().min(3).max(128),
  timezone: z.string().min(1).max(64).default("UTC"),
  payload: z.record(z.string(), z.unknown()).default({}),
});

const workerNodeSchema = z.object({
  name: z.string().min(1).max(128),
  kind: z.enum(["local", "remote", "cloud"]).default("local"),
  endpoint: z.string().url().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
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

operationsRoute.get("/operations", async (c) => {
  const accountId = c.get("ownerId");
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

  return c.json({
    data: {
      recentJobs,
      notificationChannels: channels.map(stripNotificationSecrets),
      scheduledOperations: schedules,
      artifactBackups: backups,
      workerNodes: nodes,
      previewLinks: previews,
      customDomains: domains,
      workflowTemplates: templates,
      workerHealth,
    },
  });
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
      status: ageMs !== null && ageMs <= 60_000 ? "healthy" : "degraded",
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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(endpoint, { signal: controller.signal });
    clearTimeout(timeout);
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

async function sendTestNotification(
  channel: typeof notificationChannels.$inferSelect,
) {
  const event = {
    event: "notification.test",
    message: "Planisfy test notification",
    timestamp: new Date().toISOString(),
  };
  const body = buildNotificationPayload(channel.provider, event);

  if (notificationDeliveryMode(channel.provider) === "email-adapter") {
    return {
      delivered: false,
      adapter: "email",
      payload: body,
      message:
        "Email adapter payload prepared; configure an email worker to send it.",
    };
  }

  const response = await fetch(channel.target, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return {
    delivered: response.ok,
    status: response.status,
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

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
