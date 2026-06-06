import { Hono } from "hono";
import type { Context } from "hono";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import {
  datasets,
  db,
  savedRegions,
  sourceConnections,
  sourceCredentials,
  sourceImports,
} from "@planisfy/database";
import type { AuthEnv } from "../middleware/auth";
import { createProcessingJob, logProcessingJob } from "../lib/processing-jobs";
import { enqueueOutboxEvent } from "../lib/outbox";
import { logAudit } from "../lib/audit";

export const importsRoute = new Hono<AuthEnv>();

const handleSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-]*$/);
const bboxSchema = z
  .tuple([z.number(), z.number(), z.number(), z.number()])
  .refine(([west, south, east, north]) => west < east && south < north, {
    message: "bbox must be [west, south, east, north]",
  });
const providerSchema = z.enum(["OVERTURE", "NATURAL_EARTH", "CUSTOM"]);

const regionSchema = z.object({
  handle: handleSchema,
  name: z.string().min(1).max(128),
  description: z.string().max(1000).optional(),
  bbox: bboxSchema,
  geometry: z.unknown().optional(),
});

const credentialSchema = z.object({
  name: z.string().min(1).max(128),
  provider: providerSchema,
  encryptedPayload: z.record(z.string(), z.unknown()).default({}),
});

const sourceConnectionSchema = z.object({
  handle: handleSchema,
  name: z.string().min(1).max(128),
  provider: providerSchema,
  url: z.string().url().optional(),
  credentialId: z.string().uuid().optional(),
  config: z.record(z.string(), z.unknown()).default({}),
});

const overtureImportSchema = z.object({
  handle: handleSchema,
  name: z.string().min(1).max(128),
  description: z.string().max(1000).optional(),
  regionId: z.string().uuid(),
  sourceConnectionId: z.string().uuid().optional(),
  theme: z.string().min(1).max(64),
  type: z.string().min(1).max(64).optional(),
});

importsRoute.get("/regions", async (c) => {
  const accountId = c.get("ownerId");
  const rows = await db
    .select()
    .from(savedRegions)
    .where(and(eq(savedRegions.accountId, accountId), isNull(savedRegions.deletedAt)))
    .orderBy(desc(savedRegions.createdAt));

  return c.json({ data: rows });
});

importsRoute.post("/regions", async (c) => {
  const accountId = c.get("ownerId");
  const parsed = regionSchema.safeParse(await c.req.json());
  if (!parsed.success) return validationError(c, parsed.error);

  const [created] = await db
    .insert(savedRegions)
    .values({
      accountId,
      handle: parsed.data.handle,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      bbox: parsed.data.bbox,
      geometry: parsed.data.geometry,
    })
    .returning();

  return c.json({ data: created }, 201);
});

importsRoute.get("/source-credentials", async (c) => {
  const accountId = c.get("ownerId");
  const rows = await db
    .select({
      id: sourceCredentials.id,
      accountId: sourceCredentials.accountId,
      name: sourceCredentials.name,
      provider: sourceCredentials.provider,
      lastUsedAt: sourceCredentials.lastUsedAt,
      createdAt: sourceCredentials.createdAt,
      updatedAt: sourceCredentials.updatedAt,
    })
    .from(sourceCredentials)
    .where(
      and(
        eq(sourceCredentials.accountId, accountId),
        isNull(sourceCredentials.deletedAt),
      ),
    )
    .orderBy(desc(sourceCredentials.createdAt));

  return c.json({ data: rows });
});

importsRoute.post("/source-credentials", async (c) => {
  const accountId = c.get("ownerId");
  const parsed = credentialSchema.safeParse(await c.req.json());
  if (!parsed.success) return validationError(c, parsed.error);

  const [created] = await db
    .insert(sourceCredentials)
    .values({
      accountId,
      name: parsed.data.name,
      provider: parsed.data.provider,
      encryptedPayload: parsed.data.encryptedPayload,
    })
    .returning({
      id: sourceCredentials.id,
      accountId: sourceCredentials.accountId,
      name: sourceCredentials.name,
      provider: sourceCredentials.provider,
      lastUsedAt: sourceCredentials.lastUsedAt,
      createdAt: sourceCredentials.createdAt,
      updatedAt: sourceCredentials.updatedAt,
    });

  return c.json({ data: created }, 201);
});

importsRoute.get("/source-connections", async (c) => {
  const accountId = c.get("ownerId");
  const rows = await db
    .select()
    .from(sourceConnections)
    .where(
      and(
        eq(sourceConnections.accountId, accountId),
        isNull(sourceConnections.deletedAt),
      ),
    )
    .orderBy(desc(sourceConnections.createdAt));

  return c.json({ data: rows });
});

importsRoute.post("/source-connections", async (c) => {
  const accountId = c.get("ownerId");
  const parsed = sourceConnectionSchema.safeParse(await c.req.json());
  if (!parsed.success) return validationError(c, parsed.error);

  const [created] = await db
    .insert(sourceConnections)
    .values({
      accountId,
      handle: parsed.data.handle,
      name: parsed.data.name,
      provider: parsed.data.provider,
      url: parsed.data.url ?? null,
      credentialId: parsed.data.credentialId ?? null,
      config: parsed.data.config,
    })
    .returning();

  return c.json({ data: created }, 201);
});

importsRoute.get("/source-imports", async (c) => {
  const accountId = c.get("ownerId");
  const rows = await db
    .select()
    .from(sourceImports)
    .where(eq(sourceImports.accountId, accountId))
    .orderBy(desc(sourceImports.createdAt));

  return c.json({ data: rows });
});

importsRoute.post("/source-imports/overture", async (c) => {
  const accountId = c.get("ownerId");
  const userId = c.get("userId");
  const parsed = overtureImportSchema.safeParse(await c.req.json());
  if (!parsed.success) return validationError(c, parsed.error);

  const [existing] = await db
    .select({ id: datasets.id })
    .from(datasets)
    .where(
      and(
        eq(datasets.accountId, accountId),
        eq(datasets.handle, parsed.data.handle),
        isNull(datasets.deletedAt),
      ),
    )
    .limit(1);
  if (existing) {
    return c.json(
      { error: { code: "CONFLICT", message: "Dataset handle already exists" } },
      409,
    );
  }

  const [region] = await db
    .select()
    .from(savedRegions)
    .where(
      and(
        eq(savedRegions.id, parsed.data.regionId),
        eq(savedRegions.accountId, accountId),
        isNull(savedRegions.deletedAt),
      ),
    )
    .limit(1);
  if (!region) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Region not found" } },
      404,
    );
  }

  const dataset = await createDataset(accountId, parsed.data);
  const job = await createProcessingJob({
    accountId,
    type: "source.import_overture",
    input: {
      provider: "OVERTURE",
      datasetId: dataset.id,
      regionId: region.id,
      bbox: region.bbox,
      sourceConnectionId: parsed.data.sourceConnectionId,
      theme: parsed.data.theme,
      type: parsed.data.type,
    },
  });
  const [sourceImport] = await db
    .insert(sourceImports)
    .values({
      accountId,
      provider: "OVERTURE",
      sourceName: parsed.data.theme,
      sourceConnectionId: parsed.data.sourceConnectionId ?? null,
      regionId: region.id,
      datasetId: dataset.id,
      processingJobId: job.id,
      input: job.input,
    })
    .returning();

  await logProcessingJob(job.id, "Overture import queued", {
    metadata: {
      importId: sourceImport?.id,
      datasetId: dataset.id,
      regionId: region.id,
      theme: parsed.data.theme,
      type: parsed.data.type,
    },
  });
  await enqueueOutboxEvent({
    eventName: "source.import.requested",
    payload: {
      importId: sourceImport!.id,
      accountId,
      jobId: job.id,
      datasetId: dataset.id,
      provider: "OVERTURE",
    },
  });
  logAudit({
    profileId: userId,
    action: "source.import_requested",
    resourceType: "dataset",
    resourceId: dataset.id,
    metadata: { importId: sourceImport?.id, jobId: job.id },
  });

  return c.json({ data: { dataset, sourceImport, processingJob: job } }, 202);
});

async function createDataset(
  accountId: string,
  data: z.infer<typeof overtureImportSchema>,
) {
  const [dataset] = await db
    .insert(datasets)
    .values({
      accountId,
      handle: data.handle,
      name: data.name,
      description: data.description ?? null,
      status: "DRAFT",
    })
    .returning();
  return dataset!;
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
