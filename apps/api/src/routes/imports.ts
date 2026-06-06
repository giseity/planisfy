import { Hono } from "hono";
import type { Context } from "hono";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import {
  datasetVersions,
  datasets,
  db,
  storageObjects,
  savedRegions,
  sourceConnections,
  sourceCredentials,
  sourceImports,
  tilesets,
} from "@planisfy/database";
import type { AuthEnv } from "../middleware/auth";
import { createProcessingJob, logProcessingJob } from "../lib/processing-jobs";
import { enqueueOutboxEvent } from "../lib/outbox";
import { logAudit } from "../lib/audit";
import { env } from "../env";
import { encryptCredentialPayload } from "../lib/source-credentials";
import {
  SourceUrlRejectedError,
  validateRemoteSourceUrl,
} from "../lib/source-url-policy";
import { checkResourceLimit } from "../lib/plan-check";
import { buildDatasetTilesetProcessingInput } from "../lib/tileset-build-input";

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
  payload: z.record(z.string(), z.unknown()).optional(),
  encryptedPayload: z.record(z.string(), z.unknown()).optional(),
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

const datasetTilesetSchema = z.object({
  handle: handleSchema,
  name: z.string().min(1).max(128),
  description: z.string().max(1000).optional(),
  datasetVersionId: z.string().uuid().optional(),
  minZoom: z.number().int().min(0).max(24).optional(),
  maxZoom: z.number().int().min(0).max(24).optional(),
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
  const payload = parsed.data.payload ?? parsed.data.encryptedPayload ?? {};
  let encryptedPayload: ReturnType<typeof encryptCredentialPayload>;
  try {
    encryptedPayload = encryptCredentialPayload(payload, credentialSecret());
  } catch (err) {
    return c.json(
      {
        error: {
          code: "CREDENTIAL_ENCRYPTION_NOT_CONFIGURED",
          message: err instanceof Error ? err.message : String(err),
        },
      },
      500,
    );
  }

  const [created] = await db
    .insert(sourceCredentials)
    .values({
      accountId,
      name: parsed.data.name,
      provider: parsed.data.provider,
      encryptedPayload,
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
  const urlResult = validateSourceUrl(parsed.data.url);
  if (urlResult instanceof Response) return urlResult;
  if (parsed.data.credentialId) {
    const [credential] = await db
      .select({ id: sourceCredentials.id })
      .from(sourceCredentials)
      .where(
        and(
          eq(sourceCredentials.id, parsed.data.credentialId),
          eq(sourceCredentials.accountId, accountId),
          isNull(sourceCredentials.deletedAt),
        ),
      )
      .limit(1);
    if (!credential) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Credential not found" } },
        404,
      );
    }
  }

  const [created] = await db
    .insert(sourceConnections)
    .values({
      accountId,
      handle: parsed.data.handle,
      name: parsed.data.name,
      provider: parsed.data.provider,
      url: urlResult ?? null,
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

importsRoute.post("/datasets/:id/tilesets", async (c) => {
  const accountId = c.get("ownerId");
  const userId = c.get("userId");
  const datasetId = c.req.param("id");
  const parsed = datasetTilesetSchema.safeParse(await c.req.json());
  if (!parsed.success) return validationError(c, parsed.error);

  const [dataset] = await db
    .select()
    .from(datasets)
    .where(
      and(
        eq(datasets.id, datasetId),
        eq(datasets.accountId, accountId),
        isNull(datasets.deletedAt),
      ),
    )
    .limit(1);
  if (!dataset) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Dataset not found" } },
      404,
    );
  }
  if (dataset.status !== "READY") {
    return c.json(
      {
        error: {
          code: "DATASET_NOT_READY",
          message: "Dataset must be ready before it can be tiled",
        },
      },
      400,
    );
  }

  const [existing] = await db
    .select({ id: tilesets.id })
    .from(tilesets)
    .where(
      and(
        eq(tilesets.accountId, accountId),
        eq(tilesets.handle, parsed.data.handle),
        isNull(tilesets.deletedAt),
      ),
    )
    .limit(1);
  if (existing) {
    return c.json(
      { error: { code: "CONFLICT", message: "Tileset handle already exists" } },
      409,
    );
  }

  const planCheck = await checkResourceLimit(userId, accountId, "tilesets");
  if (!planCheck.allowed) {
    return c.json(
      {
        error: {
          code: "PLAN_LIMIT",
          message: `You've reached the maximum of ${planCheck.limit} tilesets on your current plan. Please upgrade to create more.`,
        },
      },
      403,
    );
  }

  const targetDatasetVersionId =
    parsed.data.datasetVersionId ?? dataset.currentVersionId;
  if (!targetDatasetVersionId) {
    return c.json(
      {
        error: {
          code: "DATASET_ARTIFACT_NOT_FOUND",
          message: "Dataset has no current version to tile",
        },
      },
      400,
    );
  }

  const [version] = await db
    .select()
    .from(datasetVersions)
    .where(
      and(
        eq(datasetVersions.datasetId, dataset.id),
        eq(datasetVersions.id, targetDatasetVersionId),
      ),
    )
    .limit(1);
  if (!version?.storageObjectId) {
    return c.json(
      {
        error: {
          code: "DATASET_ARTIFACT_NOT_FOUND",
          message: "Dataset version has no stored GeoJSON artifact",
        },
      },
      400,
    );
  }

  const [storageObject] = await db
    .select()
    .from(storageObjects)
    .where(eq(storageObjects.id, version.storageObjectId))
    .limit(1);
  if (!storageObject) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Dataset artifact not found" } },
      404,
    );
  }

  const minZoom = parsed.data.minZoom ?? 0;
  const maxZoom = parsed.data.maxZoom ?? 14;
  const [tileset] = await db
    .insert(tilesets)
    .values({
      accountId,
      name: parsed.data.name,
      handle: parsed.data.handle,
      description: parsed.data.description ?? dataset.description ?? null,
      status: "BUILDING",
      minZoom,
      maxZoom,
      bounds: version.bounds ?? dataset.bounds,
      layerMetadata: dataset.schemaSummary,
    })
    .returning();
  if (!tileset) {
    return c.json(
      {
        error: { code: "INTERNAL_ERROR", message: "Failed to create tileset" },
      },
      500,
    );
  }

  const jobInput = buildDatasetTilesetProcessingInput({
    tilesetId: tileset.id,
    datasetId: dataset.id,
    datasetVersionId: version.id,
    storageObjectId: storageObject.id,
    storageKey: storageObject.storageKey,
    options: { minZoom, maxZoom },
  });
  const processingJob = await createProcessingJob({
    accountId,
    type: "tileset.process_dataset",
    input: jobInput,
  });

  await logProcessingJob(processingJob.id, "Dataset tiling queued", {
    metadata: {
      datasetId: dataset.id,
      datasetVersionId: version.id,
      storageObjectId: storageObject.id,
      tilesetId: tileset.id,
    },
  });
  await enqueueOutboxEvent({
    eventName: "tileset.build.requested",
    payload: {
      accountId,
      tilesetId: tileset.id,
      jobId: processingJob.id,
      sourceResourceType: "dataset",
      sourceResourceId: version.id,
      options: { minZoom, maxZoom },
    },
  });
  logAudit({
    profileId: userId,
    action: "tileset.dataset_build_requested",
    resourceType: "tileset",
    resourceId: tileset.id,
    metadata: {
      datasetId: dataset.id,
      datasetVersionId: version.id,
      processingJobId: processingJob.id,
    },
  });

  return c.json(
    { data: { dataset, datasetVersion: version, tileset, processingJob } },
    202,
  );
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

function credentialSecret() {
  return (
    env.SOURCE_CREDENTIAL_ENCRYPTION_KEY ??
    env.BETTER_AUTH_SECRET ??
    env.INTERNAL_API_SECRET
  );
}

function validateSourceUrl(url: string | undefined): string | Response | null {
  if (!url) return null;
  try {
    return validateRemoteSourceUrl(url, {
      allowPrivateUrls: env.ALLOW_PRIVATE_SOURCE_URLS,
    });
  } catch (err) {
    if (err instanceof SourceUrlRejectedError) {
      return Response.json(
        { error: { code: "SOURCE_URL_REJECTED", message: err.message } },
        { status: 400 },
      );
    }
    throw err;
  }
}
