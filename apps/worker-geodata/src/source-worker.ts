import type { Job } from "bullmq";
import { execFile } from "child_process";
import { mkdtemp, readFile, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";
import { eq, max } from "drizzle-orm";
import {
  db,
  processingJobLogs,
  processingJobs,
  storageObjects,
  tilesets,
  tilesetVersions,
  uploads,
} from "@planisfy/database";
import { getStorage } from "@planisfy/storage";
import {
  StoragePaths,
  type TilesetArtifactFormat,
} from "@planisfy/storage-paths";
import { env } from "./env";
import {
  getToolchainCapabilities,
  summarizeToolchainCapabilities,
} from "./toolchain";
import {
  buildTippecanoeArgs,
  missingTippecanoeMessage,
  shouldStoreRawFallback,
} from "./upload-tiling";

const execFileAsync = promisify(execFile);

type SourceFormat = "geojson" | "csv" | "shapefile" | "pmtiles" | "mbtiles";

export interface SourceProcessingJob {
  tilesetId: string;
  ownerId: string;
  uploadKey: string;
  uploadId?: string;
  datasetId?: string;
  datasetVersionId?: string;
  storageObjectId?: string;
  processingJobId?: string;
  format: SourceFormat;
  csv?: {
    latitude?: string;
    longitude?: string;
  };
  options?: {
    minZoom?: number;
    maxZoom?: number;
    dropDensest?: boolean;
    simplification?: number;
  };
}

export async function processSourceJob(job: Job<SourceProcessingJob>) {
  const {
    tilesetId,
    ownerId,
    uploadKey,
    uploadId,
    format,
    options,
    processingJobId,
  } = job.data;
  const storage = getStorage();
  const minZoom = options?.minZoom ?? 0;
  const maxZoom = options?.maxZoom ?? 14;

  console.log(`[worker-geodata] processing tileset ${tilesetId} (${format})`);

  const tmpDir = await mkdtemp(join(tmpdir(), "planisfy-source-"));

  try {
    if (processingJobId) {
      await throwIfCancellationRequested(processingJobId);
      await markProcessingJobStarted(processingJobId);
      await logProcessingJob(processingJobId, "Geodata processing started", {
        tilesetId,
        uploadId,
        uploadKey,
        format,
      });
      await logToolchainCapabilities(processingJobId);
    }

    await setProcessingStatus({
      tilesetId,
      uploadId,
    });
    if (processingJobId) {
      await throwIfCancellationRequested(processingJobId);
    }

    const rawData = await storage.download(uploadKey);
    if (processingJobId) {
      await throwIfCancellationRequested(processingJobId);
    }

    const validation = validateUpload(rawData, format, job.data.csv);
    if (uploadId) {
      await db
        .update(uploads)
        .set({ status: "READY", validationResult: validation })
        .where(eq(uploads.id, uploadId));
    }
    if (processingJobId) {
      await updateProgress(processingJobId, 20, {
        stage: "downloaded",
        bytes: rawData.byteLength,
        validation,
      });
      await logProcessingJob(processingJobId, "Upload downloaded", {
        bytes: rawData.byteLength,
        validation,
      });
      await throwIfCancellationRequested(processingJobId);
    }

    if (format === "pmtiles" || format === "mbtiles") {
      if (processingJobId) {
        await throwIfCancellationRequested(processingJobId);
      }
      const result = await storeProcessedArtifact({
        ownerId,
        tilesetId,
        processingJobId,
        data: rawData,
        format,
        contentType:
          format === "pmtiles" ? "application/x-protobuf" : "application/vnd.sqlite3",
      });

      if (processingJobId) {
        await updateProgress(processingJobId, 80, {
          stage: "artifact_stored",
          storageKey: result.storageKey,
        });
      }

      if (processingJobId) {
        await throwIfCancellationRequested(processingJobId);
      }
      await finalizeProcessedArtifact({
        ownerId,
        tilesetId,
        uploadId,
        processingJobId,
        artifact: result,
        format,
        minZoom,
        maxZoom,
        bounds: validation.bounds,
      });
      return;
    }

    let inputPath = join(tmpDir, `input.${inputExtension(format)}`);
    await writeFile(inputPath, rawData);

    const bounds = validation.bounds;
    if (format === "shapefile") {
      const convertedPath = join(tmpDir, "input.geojsonseq");
      try {
        await execFileAsync(
          env.OGR2OGR_PATH,
          ["-f", "GeoJSONSeq", convertedPath, inputPath],
          { timeout: 300_000 },
        );
        if (processingJobId) {
          await throwIfCancellationRequested(processingJobId);
        }
      } catch (err) {
        if (isMissingExecutableError(err)) {
          throw new Error(
            `Shapefile uploads require GDAL/ogr2ogr at ${env.OGR2OGR_PATH} in the geodata worker.`,
          );
        }
        throw err;
      }
      inputPath = convertedPath;
    }

    const outputPath = join(tmpDir, "output.pmtiles");
    const tippecanoeArgs = buildTippecanoeArgs({
      inputPath,
      outputPath,
      options: {
        minZoom,
        maxZoom,
        dropDensest: options?.dropDensest,
        simplification: options?.simplification,
      },
    });

    try {
      if (processingJobId) {
        await updateProgress(processingJobId, 40, { stage: "tiling" });
        await logProcessingJob(processingJobId, "Tile generation started", {
          minZoom,
          maxZoom,
        });
        await throwIfCancellationRequested(processingJobId);
      }
      await execFileAsync(env.TIPPECANOE_PATH, tippecanoeArgs, {
        timeout: 300_000,
      });
      if (processingJobId) {
        await throwIfCancellationRequested(processingJobId);
      }
    } catch (err) {
      if (
        shouldStoreRawFallback({
          missingTippecanoe: isMissingExecutableError(err),
          allowRawFallback: env.GEODATA_ALLOW_RAW_FALLBACK,
        })
      ) {
        console.warn(
          "[worker-geodata] tippecanoe not found, storing raw file because GEODATA_ALLOW_RAW_FALLBACK=true",
        );
        if (processingJobId) {
          await throwIfCancellationRequested(processingJobId);
        }
        const result = await storeProcessedArtifact({
          ownerId,
          tilesetId,
          processingJobId,
          data: rawData,
          format,
          artifactFormat: "directory",
          contentType:
            format === "csv"
              ? "text/csv"
              : format === "shapefile"
                ? "application/zip"
                : "application/geo+json",
        });

        if (processingJobId) {
          await updateProgress(processingJobId, 80, {
            stage: "fallback_stored",
            storageKey: result.storageKey,
          });
        }

        if (processingJobId) {
          await throwIfCancellationRequested(processingJobId);
        }
        await finalizeProcessedArtifact({
          ownerId,
          tilesetId,
          uploadId,
          processingJobId,
          artifact: result,
          format,
          minZoom,
          maxZoom,
          bounds,
          fallback: "raw",
        });
        return;
      }

      if (isMissingExecutableError(err)) {
        throw new Error(missingTippecanoeMessage(env.TIPPECANOE_PATH));
      }

      throw err;
    }

    const pmtilesData = await readFile(outputPath);
    if (processingJobId) {
      await throwIfCancellationRequested(processingJobId);
    }
    const result = await storeProcessedArtifact({
      ownerId,
      tilesetId,
      processingJobId,
      data: pmtilesData,
      format: "pmtiles",
      contentType: "application/x-protobuf",
    });

    if (processingJobId) {
      await updateProgress(processingJobId, 80, {
        stage: "artifact_stored",
        storageKey: result.storageKey,
      });
    }

    if (processingJobId) {
      await throwIfCancellationRequested(processingJobId);
    }
    await finalizeProcessedArtifact({
      ownerId,
      tilesetId,
      uploadId,
      processingJobId,
      artifact: result,
      format: "pmtiles",
      minZoom,
      maxZoom,
      bounds,
    });
  } catch (err) {
    if (err instanceof ProcessingJobCanceledError) {
      await setCanceledStatus({ tilesetId, uploadId });
      await markProcessingJobCanceled(processingJobId, err);
      return;
    }

    await setErrorStatus({
      tilesetId,
      uploadId,
      error: err,
    });

    if (processingJobId) {
      await markProcessingJobFailed(processingJobId, err);
      await logProcessingJob(
        processingJobId,
        "Geodata processing failed",
        {
          tilesetId,
          uploadId,
          message: err instanceof Error ? err.message : String(err),
        },
        "error",
      );
    }

    throw err;
  } finally {
    try {
      const { rm } = await import("fs/promises");
      await rm(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors.
    }
  }
}

async function setProcessingStatus(params: {
  tilesetId: string;
  uploadId?: string;
}) {
  await db
    .update(tilesets)
    .set({ status: "BUILDING" })
    .where(eq(tilesets.id, params.tilesetId));

  if (params.uploadId) {
    await db
      .update(uploads)
      .set({ status: "VALIDATING", linkedTilesetId: params.tilesetId })
      .where(eq(uploads.id, params.uploadId));
  }
}

async function setErrorStatus(params: {
  tilesetId: string;
  uploadId?: string;
  error: unknown;
}) {
  await db
    .update(tilesets)
    .set({ status: "ERROR" })
    .where(eq(tilesets.id, params.tilesetId));

  if (params.uploadId) {
    await db
      .update(uploads)
      .set({
        status: "ERROR",
        validationResult: {
          message:
            params.error instanceof Error
              ? params.error.message
              : String(params.error),
        },
      })
      .where(eq(uploads.id, params.uploadId));
  }
}

async function setCanceledStatus(params: {
  tilesetId: string;
  uploadId?: string;
}) {
  const [versionState] = await db
    .select({ latest: max(tilesetVersions.version) })
    .from(tilesetVersions)
    .where(eq(tilesetVersions.tilesetId, params.tilesetId));

  await db
    .update(tilesets)
    .set({ status: versionState?.latest ? "READY" : "DRAFT" })
    .where(eq(tilesets.id, params.tilesetId));

  if (params.uploadId) {
    await db
      .update(uploads)
      .set({ status: "UPLOADED", linkedTilesetId: params.tilesetId })
      .where(eq(uploads.id, params.uploadId));
  }
}

async function storeProcessedArtifact(params: {
  ownerId: string;
  tilesetId: string;
  processingJobId?: string;
  data: Buffer;
  format: SourceFormat;
  artifactFormat?: TilesetArtifactFormat;
  contentType: string;
}) {
  const storage = getStorage();
  let versionNumber: number | undefined;
  const storageFormat =
    params.artifactFormat ?? tileStorageFormat(params.format);
  const storageKey = await (async () => {
    const [versionState] = await db
      .select({ latest: max(tilesetVersions.version) })
      .from(tilesetVersions)
      .where(eq(tilesetVersions.tilesetId, params.tilesetId));
    versionNumber = (versionState?.latest ?? 0) + 1;
    return StoragePaths.tilesetVersion(
      params.ownerId,
      params.tilesetId,
      versionNumber,
      storageFormat,
    );
  })();

  const stored = await storage.upload(
    storageKey,
    params.data,
    params.contentType,
  );
  const storageInfo = storage.getInfo();

  const [storageObject] = await db
    .insert(storageObjects)
    .values({
      accountId: params.ownerId,
      provider: storageInfo.provider,
      bucket: storageInfo.bucket,
      storageKey,
      fileName: `tiles.${storageFormat}`,
      contentType: stored.contentType,
      size: stored.size,
      resourceType: "tileset",
      resourceId: params.tilesetId,
      artifactKind: "processed",
      version: versionNumber
        ? `v${versionNumber}`
        : (params.processingJobId ?? "current"),
    })
    .returning({ id: storageObjects.id });

  return {
    storageObjectId: storageObject!.id,
    storageKey,
    artifactFormat: storageFormat,
    size: stored.size,
    versionNumber,
  };
}

async function finalizeProcessedArtifact(params: {
  ownerId: string;
  tilesetId: string;
  uploadId?: string;
  processingJobId?: string;
  artifact: Awaited<ReturnType<typeof storeProcessedArtifact>>;
  format: SourceFormat;
  minZoom: number;
  maxZoom: number;
  bounds?: [number, number, number, number] | null;
  fallback?: string;
}) {
  const versionNumber =
    params.artifact.versionNumber ??
    (await nextTilesetVersion(params.tilesetId));
  const [tilesetVersion] = await db
    .insert(tilesetVersions)
    .values({
      tilesetId: params.tilesetId,
      version: versionNumber,
      artifactStorageObjectId: params.artifact.storageObjectId,
      format: tileArtifactFormat(params.artifact.artifactFormat),
      buildJobId: params.processingJobId,
      schema: {
        vector_layers: [
          {
            id: "data",
            fields: {},
            minzoom: params.minZoom,
            maxzoom: params.maxZoom,
          },
        ],
        fallback: params.fallback,
      },
      bounds: params.bounds,
      minZoom: params.minZoom,
      maxZoom: params.maxZoom,
    })
    .returning();

  await db
    .update(tilesets)
    .set({
      status: "READY",
      bounds: params.bounds,
      minZoom: params.minZoom,
      maxZoom: params.maxZoom,
      layerMetadata: tilesetVersion!.schema,
    })
    .where(eq(tilesets.id, params.tilesetId));

  if (params.uploadId) {
    await db
      .update(uploads)
      .set({ status: "READY", linkedTilesetId: params.tilesetId })
      .where(eq(uploads.id, params.uploadId));
  }

  await markSuccess(params.processingJobId, {
    tilesetId: params.tilesetId,
    tilesetVersionId: tilesetVersion!.id,
    version: versionNumber,
    storageKey: params.artifact.storageKey,
    size: params.artifact.size,
    minZoom: params.minZoom,
    maxZoom: params.maxZoom,
    fallback: params.fallback,
  });
}

async function nextTilesetVersion(tilesetId: string): Promise<number> {
  const [versionState] = await db
    .select({ latest: max(tilesetVersions.version) })
    .from(tilesetVersions)
    .where(eq(tilesetVersions.tilesetId, tilesetId));

  return (versionState?.latest ?? 0) + 1;
}

async function updateProgress(
  jobId: string,
  progress: number,
  output?: Record<string, unknown>,
) {
  await db
    .update(processingJobs)
    .set({ progress, output, updatedAt: new Date() })
    .where(eq(processingJobs.id, jobId));
}

async function logProcessingJob(
  jobId: string,
  message: string,
  metadata?: Record<string, unknown>,
  level: "info" | "warn" | "error" = "info",
) {
  await db.insert(processingJobLogs).values({
    jobId,
    level,
    message,
    metadata,
  });
}

async function logToolchainCapabilities(jobId: string) {
  const capabilities = await getToolchainCapabilities({
    duckdbPath: env.DUCKDB_PATH,
    tippecanoePath: env.TIPPECANOE_PATH,
    ogr2ogrPath: env.OGR2OGR_PATH,
  });
  await logProcessingJob(
    jobId,
    `Geodata toolchain: ${summarizeToolchainCapabilities(capabilities)}`,
    { toolchain: capabilities },
    Object.values(capabilities).every((tool) => tool.available)
      ? "info"
      : "warn",
  );
}

async function markProcessingJobStarted(jobId: string) {
  await db
    .update(processingJobs)
    .set({
      status: "PROCESSING",
      startedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(processingJobs.id, jobId));
}

async function markSuccess(
  jobId: string | undefined,
  output: Record<string, unknown>,
) {
  if (!jobId) {
    return;
  }

  await db
    .update(processingJobs)
    .set({
      status: "SUCCEEDED",
      progress: 100,
      output,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(processingJobs.id, jobId));
}

async function markProcessingJobFailed(jobId: string, error: unknown) {
  await db
    .update(processingJobs)
    .set({
      status: "FAILED",
      errorCode: "PROCESSING_FAILED",
      errorMessage: error instanceof Error ? error.message : String(error),
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(processingJobs.id, jobId));
}

async function markProcessingJobCanceled(
  jobId: string | undefined,
  error: ProcessingJobCanceledError,
) {
  if (!jobId) return;

  await db
    .update(processingJobs)
    .set({
      status: "CANCELED",
      errorCode: null,
      errorMessage: null,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(processingJobs.id, jobId));

  await logProcessingJob(
    jobId,
    "Geodata processing canceled",
    { cancelRequestedAt: error.cancelRequestedAt?.toISOString() },
    "warn",
  );
}

async function throwIfCancellationRequested(jobId: string) {
  const [job] = await db
    .select({
      status: processingJobs.status,
      cancelRequestedAt: processingJobs.cancelRequestedAt,
    })
    .from(processingJobs)
    .where(eq(processingJobs.id, jobId))
    .limit(1);

  if (job?.status === "CANCELED" || job?.cancelRequestedAt) {
    throw new ProcessingJobCanceledError(job.cancelRequestedAt);
  }
}

class ProcessingJobCanceledError extends Error {
  constructor(readonly cancelRequestedAt?: Date | null) {
    super("Processing job cancellation requested");
    this.name = "ProcessingJobCanceledError";
  }
}

function inputExtension(format: SourceFormat) {
  if (format === "shapefile") return "zip";
  if (format === "geojson") return "geojson";
  return format;
}

function tileStorageFormat(format: SourceFormat): TilesetArtifactFormat {
  if (format === "mbtiles") return "mbtiles";
  if (format === "pmtiles") return "pmtiles";
  return "pmtiles";
}

function tileArtifactFormat(
  format: TilesetArtifactFormat,
): "PMTILES" | "MBTILES" | "DIRECTORY" {
  if (format === "pmtiles") return "PMTILES";
  if (format === "mbtiles") return "MBTILES";
  return "DIRECTORY";
}

function isMissingExecutableError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    err.code === "ENOENT"
  );
}

type GeoJsonLike = {
  type?: string;
  coordinates?: unknown;
  geometries?: GeoJsonLike[];
  geometry?: GeoJsonLike;
  features?: Array<{ geometry?: GeoJsonLike }>;
};

function calculateBounds(
  geojson: GeoJsonLike,
): [number, number, number, number] | null {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  let hasCoords = false;

  function processCoord(coord: number[]) {
    if (coord.length >= 2) {
      hasCoords = true;
      minLon = Math.min(minLon, coord[0]!);
      minLat = Math.min(minLat, coord[1]!);
      maxLon = Math.max(maxLon, coord[0]!);
      maxLat = Math.max(maxLat, coord[1]!);
    }
  }

  function processCoords(coords: unknown) {
    if (!Array.isArray(coords)) return;
    if (typeof coords[0] === "number") {
      processCoord(coords as number[]);
    } else {
      for (const coord of coords) processCoords(coord);
    }
  }

  function processGeometry(geom: GeoJsonLike | undefined) {
    if (!geom) return;
    if (geom.coordinates) processCoords(geom.coordinates);
    if (geom.geometries) geom.geometries.forEach(processGeometry);
  }

  if (geojson.type === "FeatureCollection") {
    geojson.features?.forEach((feature) => processGeometry(feature.geometry));
  } else if (geojson.type === "Feature") {
    processGeometry(geojson.geometry);
  } else {
    processGeometry(geojson);
  }

  return hasCoords ? [minLon, minLat, maxLon, maxLat] : null;
}

type UploadValidation = {
  format: SourceFormat;
  featureCount?: number;
  bounds?: [number, number, number, number] | null;
  schema?: { fields: Record<string, string>; columns?: string[] };
  csv?: { latitude: string; longitude: string };
  byteLength: number;
};

function validateUpload(
  data: Buffer,
  format: SourceFormat,
  csv?: { latitude?: string; longitude?: string },
): UploadValidation {
  if (format === "geojson") {
    const geojson = JSON.parse(data.toString("utf-8")) as GeoJsonLike;
    if (
      !geojson.type ||
      !["FeatureCollection", "Feature", "GeometryCollection"].includes(
        geojson.type,
      )
    ) {
      throw new Error("Invalid GeoJSON: missing or invalid 'type' property");
    }

    const features = geojson.features ?? [];
    if (geojson.type === "FeatureCollection" && features.length === 0) {
      throw new Error("GeoJSON FeatureCollection has no features");
    }

    return {
      format,
      featureCount: features.length,
      bounds: calculateBounds(geojson),
      schema: { fields: summarizeGeoJsonFields(features) },
      byteLength: data.byteLength,
    };
  }

  if (format === "csv") {
    const text = data.toString("utf-8");
    const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
    const columns = splitCsvLine(lines[0] ?? "");
    if (columns.length === 0) throw new Error("CSV upload has no header row");
    const latitude = csv?.latitude ?? inferColumn(columns, ["lat", "latitude", "y"]);
    const longitude = csv?.longitude ?? inferColumn(columns, ["lon", "lng", "longitude", "x"]);
    if (!latitude || !longitude) {
      throw new Error(
        "CSV uploads require latitude/longitude columns or explicit csvLatitude/csvLongitude options.",
      );
    }
    return {
      format,
      featureCount: Math.max(0, lines.length - 1),
      schema: { fields: Object.fromEntries(columns.map((col) => [col, "string"])), columns },
      csv: { latitude, longitude },
      byteLength: data.byteLength,
    };
  }

  if (format === "shapefile") {
    return {
      format,
      schema: { fields: {}, columns: [] },
      byteLength: data.byteLength,
    };
  }

  return {
    format,
    byteLength: data.byteLength,
  };
}

function splitCsvLine(line: string): string[] {
  return line
    .split(",")
    .map((column) => column.trim().replace(/^"|"$/g, ""))
    .filter(Boolean);
}

function inferColumn(columns: string[], candidates: string[]): string | undefined {
  const normalized = new Map(columns.map((column) => [column.toLowerCase(), column]));
  for (const candidate of candidates) {
    const match = normalized.get(candidate);
    if (match) return match;
  }
  return undefined;
}

function summarizeGeoJsonFields(
  features: Array<{ geometry?: GeoJsonLike; properties?: Record<string, unknown> }>,
): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const feature of features.slice(0, 100)) {
    for (const [key, value] of Object.entries(feature.properties ?? {})) {
      if (!(key in fields)) fields[key] = typeof value;
    }
  }
  return fields;
}
