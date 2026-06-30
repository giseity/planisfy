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
import { encryptCredentialPayload } from "@planisfy/credentials";
import type { AuthEnv } from "../../middleware/auth";
import {
  ActiveProcessingJobLimitError,
  createProcessingJob,
  logProcessingJob,
} from "../resources/processing-jobs";
import { enqueueOutboxEvent } from "../../shared/outbox/outbox";
import { logAudit } from "../../shared/audit";
import { env } from "../../env";
import {
  SourceUrlRejectedError,
  validateRemoteSourceUrl,
} from "./source-url-policy";
import { buildOvertureImportEstimate } from "./import-estimates";
import {
  UnsupportedOvertureTypeError,
  overtureCatalogResponse,
} from "./overture-catalog";
import {
  assertOvertureReleaseConfigured,
  parseOvertureImportRequest,
  sourceImportHandleSchema,
  type OvertureImportRequest,
} from "./source-import-requests";
import { buildDatasetTilesetProcessingInput } from "@planisfy/geodata-contracts";
import { requireOrgMutationPermission } from "../../middleware/auth";

export const importsRoute = new Hono<AuthEnv>();

importsRoute.use("/regions", requireOrgMutationPermission("resource.write"));
importsRoute.use("/regions/*", requireOrgMutationPermission("resource.write"));
importsRoute.use(
  "/source-imports",
  requireOrgMutationPermission("resource.write"),
);
importsRoute.use(
  "/source-imports/*",
  requireOrgMutationPermission("resource.write"),
);
importsRoute.use("/datasets/*", requireOrgMutationPermission("resource.write"));
importsRoute.use("/tilesets/*", requireOrgMutationPermission("resource.write"));
importsRoute.use(
  "/source-credentials",
  requireOrgMutationPermission("integration.manage"),
);
importsRoute.use(
  "/source-credentials/*",
  requireOrgMutationPermission("integration.manage"),
);
importsRoute.use(
  "/source-connections",
  requireOrgMutationPermission("integration.manage"),
);
importsRoute.use(
  "/source-connections/*",
  requireOrgMutationPermission("integration.manage"),
);

const handleSchema = sourceImportHandleSchema;
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

const datasetTilesetSchema = z.object({
  datasetId: z.string().uuid(),
  datasetVersionId: z.string().uuid().optional(),
  minZoom: z.number().int().min(0).max(24).optional(),
  maxZoom: z.number().int().min(0).max(24).optional(),
});

importsRoute.get("/regions", async (c) => {
  const accountId = c.get("ownerId");
  const rows = await db
    .select()
    .from(savedRegions)
    .where(
      and(
        eq(savedRegions.accountId, accountId),
        isNull(savedRegions.deletedAt),
      ),
    )
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

importsRoute.get("/source-imports/overture/catalog", (c) => {
  return c.json(overtureCatalogResponse());
});

importsRoute.post("/source-imports/overture", async (c) => {
  const accountId = c.get("ownerId");
  const userId = c.get("userId");
  const parsed = parseOvertureImportRequest(await c.req.json(), {
    allowExperimental: env.OVERTURE_ALLOW_EXPERIMENTAL_TYPES,
  });
  if (!parsed.success) {
    if (parsed.error instanceof UnsupportedOvertureTypeError) {
      return c.json(
        {
          error: {
            code: "UNSUPPORTED_OVERTURE_TYPE",
            message: parsed.error.message,
          },
        },
        400,
      );
    }
    return validationError(c, parsed.error);
  }
  const releaseReadiness = assertOvertureReleaseConfigured(
    env.OVERTURE_RELEASE,
  );
  if (!releaseReadiness.ok) {
    return c.json(
      {
        error: {
          code: releaseReadiness.code,
          message: releaseReadiness.message,
        },
      },
      503,
    );
  }
  const catalogEntry = parsed.catalogEntry;
  let targetTileset: typeof tilesets.$inferSelect | null = null;
  if (parsed.data.targetTilesetId) {
    const [row] = await db
      .select()
      .from(tilesets)
      .where(
        and(
          eq(tilesets.id, parsed.data.targetTilesetId),
          eq(tilesets.accountId, accountId),
          isNull(tilesets.deletedAt),
        ),
      )
      .limit(1);
    if (!row) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Target tileset not found" } },
        404,
      );
    }
    targetTileset = row;
  }

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

  let importEstimate;
  try {
    importEstimate = buildOvertureImportEstimate({
      bbox: region.bbox,
      maxFeatures: Number(process.env.SOURCE_IMPORT_MAX_FEATURES ?? 50_000),
      timeoutMs: Number(process.env.SOURCE_IMPORT_TIMEOUT_MS ?? 900_000),
    });
  } catch (err) {
    return c.json(
      {
        error: {
          code: "INVALID_REGION_BOUNDS",
          message: err instanceof Error ? err.message : String(err),
        },
      },
      400,
    );
  }

  const dataset = await createDataset(accountId, parsed.data);
  let job;
  try {
    job = await createProcessingJob({
      accountId,
      type: "source.import_overture",
      input: {
        provider: "OVERTURE",
        datasetId: dataset.id,
        targetTilesetId: targetTileset?.id,
        regionId: region.id,
        bbox: region.bbox,
        estimate: importEstimate,
        sourceConnectionId: parsed.data.sourceConnectionId,
        theme: parsed.data.theme,
        type: parsed.data.type,
        catalog: catalogEntry
          ? {
              label: catalogEntry.label,
              geometry: catalogEntry.geometry,
              defaultLayerId: catalogEntry.defaultLayerId,
            }
          : undefined,
      },
    });
  } catch (err) {
    const response = processingJobLimitResponse(c, err);
    if (response) return response;
    throw err;
  }
  const [sourceImport] = await db
    .insert(sourceImports)
    .values({
      accountId,
      provider: "OVERTURE",
      sourceName: parsed.data.theme,
      sourceConnectionId: parsed.data.sourceConnectionId ?? null,
      regionId: region.id,
      datasetId: dataset.id,
      targetTilesetId: targetTileset?.id ?? null,
      processingJobId: job.id,
      input: job.input,
    })
    .returning();

  await logProcessingJob(job.id, "Overture import queued", {
    metadata: {
      importId: sourceImport?.id,
      datasetId: dataset.id,
      targetTilesetId: targetTileset?.id,
      regionId: region.id,
      theme: parsed.data.theme,
      type: parsed.data.type,
      catalog: catalogEntry,
      estimate: importEstimate,
    },
  });
  await enqueueOutboxEvent({
    eventName: "source.import.requested",
    payload: {
      importId: sourceImport!.id,
      accountId,
      jobId: job.id,
      datasetId: dataset.id,
      targetTilesetId: targetTileset?.id,
      provider: "OVERTURE",
    },
  });
  logAudit({
    profileId: userId,
    action: "source.import_requested",
    resourceType: "dataset",
    resourceId: dataset.id,
    metadata: {
      importId: sourceImport?.id,
      jobId: job.id,
      targetTilesetId: targetTileset?.id,
      estimate: importEstimate,
    },
  });

  return c.json(
    { data: { dataset, sourceImport, processingJob: job, importEstimate } },
    202,
  );
});

importsRoute.post("/tilesets/:id/dataset-builds", async (c) => {
  const accountId = c.get("ownerId");
  const userId = c.get("userId");
  const tilesetId = c.req.param("id");
  const parsed = datasetTilesetSchema.safeParse(await c.req.json());
  if (!parsed.success) return validationError(c, parsed.error);

  const result = await queueExistingDatasetTilesetBuild({
    accountId,
    userId,
    tilesetId,
    datasetId: parsed.data.datasetId,
    datasetVersionId: parsed.data.datasetVersionId,
    minZoom: parsed.data.minZoom,
    maxZoom: parsed.data.maxZoom,
    c,
  });
  if (result instanceof Response) return result;
  return c.json({ data: result }, 202);
});

async function queueExistingDatasetTilesetBuild(params: {
  accountId: string;
  userId: string;
  tilesetId: string;
  datasetId: string;
  datasetVersionId?: string;
  minZoom?: number;
  maxZoom?: number;
  c: Context;
}) {
  const [tileset] = await db
    .select()
    .from(tilesets)
    .where(
      and(
        eq(tilesets.id, params.tilesetId),
        eq(tilesets.accountId, params.accountId),
        isNull(tilesets.deletedAt),
      ),
    )
    .limit(1);
  if (!tileset) {
    return params.c.json(
      { error: { code: "NOT_FOUND", message: "Tileset not found" } },
      404,
    );
  }

  const [dataset] = await db
    .select()
    .from(datasets)
    .where(
      and(
        eq(datasets.id, params.datasetId),
        eq(datasets.accountId, params.accountId),
        isNull(datasets.deletedAt),
      ),
    )
    .limit(1);
  if (!dataset) {
    return params.c.json(
      { error: { code: "NOT_FOUND", message: "Dataset not found" } },
      404,
    );
  }
  if (dataset.status !== "READY") {
    return params.c.json(
      {
        error: {
          code: "DATASET_NOT_READY",
          message: "Dataset must be ready before it can be tiled",
        },
      },
      400,
    );
  }

  const targetDatasetVersionId =
    params.datasetVersionId ?? dataset.currentVersionId;
  if (!targetDatasetVersionId) {
    return params.c.json(
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
    return params.c.json(
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
    return params.c.json(
      { error: { code: "NOT_FOUND", message: "Dataset artifact not found" } },
      404,
    );
  }

  const minZoom = params.minZoom ?? tileset.minZoom ?? 0;
  const maxZoom = params.maxZoom ?? tileset.maxZoom ?? 14;

  const jobInput = buildDatasetTilesetProcessingInput({
    tilesetId: tileset.id,
    datasetId: dataset.id,
    datasetVersionId: version.id,
    storageObjectId: storageObject.id,
    storageKey: storageObject.storageKey,
    options: { minZoom, maxZoom },
  });
  let processingJob;
  try {
    processingJob = await createProcessingJob({
      accountId: params.accountId,
      type: "tileset.process_dataset",
      input: jobInput,
    });
  } catch (err) {
    const response = processingJobLimitResponse(params.c, err);
    if (response) return response;
    throw err;
  }

  const [updatedTileset] = await db
    .update(tilesets)
    .set({
      status: "BUILDING",
      buildJobId: processingJob.id,
      bounds: version.bounds ?? dataset.bounds,
      minZoom,
      maxZoom,
      layerMetadata: dataset.schemaSummary,
      updatedAt: new Date(),
    })
    .where(eq(tilesets.id, tileset.id))
    .returning();

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
      accountId: params.accountId,
      tilesetId: tileset.id,
      jobId: processingJob.id,
      sourceResourceType: "dataset",
      sourceResourceId: version.id,
      options: { minZoom, maxZoom },
    },
  });
  logAudit({
    profileId: params.userId,
    action: "tileset.dataset_build_requested",
    resourceType: "tileset",
    resourceId: tileset.id,
    metadata: {
      datasetId: dataset.id,
      datasetVersionId: version.id,
      processingJobId: processingJob.id,
    },
  });

  return {
    dataset,
    datasetVersion: version,
    tileset: updatedTileset ?? tileset,
    processingJob,
  };
}

async function createDataset(accountId: string, data: OvertureImportRequest) {
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

function processingJobLimitResponse(c: Context, err: unknown) {
  if (!(err instanceof ActiveProcessingJobLimitError)) return null;
  return c.json(
    {
      error: {
        code: err.code,
        message: `Too many active processing jobs (${err.current}/${err.limit}). Wait for a job to finish before queueing more work.`,
      },
    },
    429,
  );
}

function credentialSecret() {
  return (
    env.SOURCE_CREDENTIAL_ENCRYPTION_KEY ||
    env.BETTER_AUTH_SECRET ||
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
