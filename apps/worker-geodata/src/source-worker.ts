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
  tilesetSources,
  tilesetVersions,
  uploads,
} from "@planisfy/database";
import { getStorage } from "@planisfy/storage";
import {
  StoragePaths,
  type TilesetArtifactFormat,
} from "@planisfy/storage-paths";

const execFileAsync = promisify(execFile);

type SourceFormat = "geojson" | "csv" | "shapefile" | "pmtiles" | "mbtiles";

export interface SourceProcessingJob {
  sourceId?: string;
  tilesetId?: string;
  ownerId: string;
  uploadKey: string;
  uploadId?: string;
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
    sourceId,
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
  const resourceId = sourceId ?? tilesetId;
  if (!resourceId) {
    throw new Error("Source processing job requires sourceId or tilesetId");
  }

  console.log(
    `[worker-geodata] processing ${tilesetId ? "tileset" : "source"} ${resourceId} (${format})`,
  );

  if (processingJobId) {
    await markProcessingJobStarted(processingJobId);
    await logProcessingJob(processingJobId, "Geodata processing started", {
      sourceId,
      tilesetId,
      uploadId,
      uploadKey,
      format,
    });
  }

  await setProcessingStatus({
    sourceId: tilesetId ? undefined : sourceId,
    tilesetId,
    uploadId,
  });
  const tmpDir = await mkdtemp(join(tmpdir(), "planisfy-source-"));

  try {
    const rawData = await storage.download(uploadKey);
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
    }

    if (format === "pmtiles" || format === "mbtiles") {
      const result = await storeProcessedArtifact({
        ownerId,
        sourceId: resourceId,
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

      await finalizeProcessedArtifact({
        ownerId,
        sourceId: resourceId,
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

    let inputPath = join(
      tmpDir,
      `input.${format === "geojson" ? "geojson" : format}`,
    );
    await writeFile(inputPath, rawData);

    const bounds = validation.bounds;
    if (format === "geojson") {
      if (bounds && !tilesetId) {
        await db
          .update(tilesetSources)
          .set({ bounds })
          .where(eq(tilesetSources.id, resourceId));
      }
    } else if (format === "shapefile") {
      const convertedPath = join(tmpDir, "input.geojsonseq");
      try {
        await execFileAsync(
          "ogr2ogr",
          ["-f", "GeoJSONSeq", convertedPath, inputPath],
          { timeout: 300_000 },
        );
      } catch (err) {
        if (isMissingExecutableError(err)) {
          throw new Error(
            "Shapefile uploads require GDAL/ogr2ogr in the geodata worker.",
          );
        }
        throw err;
      }
      inputPath = convertedPath;
    }

    const outputPath = join(tmpDir, "output.pmtiles");
    const tippecanoeArgs = [
      "-o",
      outputPath,
      `-z${maxZoom}`,
      `-Z${minZoom}`,
      "--force",
      "--no-tile-compression",
    ];

    if (options?.dropDensest) {
      tippecanoeArgs.push("--drop-densest-as-needed");
    } else {
      tippecanoeArgs.push("--coalesce-densest-as-needed");
    }

    if (options?.simplification) {
      tippecanoeArgs.push(`--simplification=${options.simplification}`);
    }

    tippecanoeArgs.push(inputPath);

    try {
      if (processingJobId) {
        await updateProgress(processingJobId, 40, { stage: "tiling" });
        await logProcessingJob(processingJobId, "Tile generation started", {
          minZoom,
          maxZoom,
        });
      }
      await execFileAsync("tippecanoe", tippecanoeArgs, { timeout: 300_000 });
    } catch (err) {
      if (isMissingExecutableError(err)) {
        console.warn("[worker-geodata] tippecanoe not found, storing raw file");
        const result = await storeProcessedArtifact({
          ownerId,
          sourceId: resourceId,
          tilesetId,
          processingJobId,
          data: rawData,
          format,
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

        await finalizeProcessedArtifact({
          ownerId,
          sourceId: resourceId,
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

      throw err;
    }

    const pmtilesData = await readFile(outputPath);
    const result = await storeProcessedArtifact({
      ownerId,
      sourceId: resourceId,
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

    await finalizeProcessedArtifact({
      ownerId,
      sourceId: resourceId,
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
    await setErrorStatus({
      sourceId: tilesetId ? undefined : sourceId,
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
          sourceId,
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
  sourceId?: string;
  tilesetId?: string;
  uploadId?: string;
}) {
  if (params.sourceId) {
    await db
      .update(tilesetSources)
      .set({ status: "PROCESSING" })
      .where(eq(tilesetSources.id, params.sourceId));
  }
  if (params.tilesetId) {
    await db
      .update(tilesets)
      .set({ status: "BUILDING" })
      .where(eq(tilesets.id, params.tilesetId));
  }
  if (params.uploadId) {
    await db
      .update(uploads)
      .set({ status: "VALIDATING", linkedTilesetId: params.tilesetId })
      .where(eq(uploads.id, params.uploadId));
  }
}

async function setErrorStatus(params: {
  sourceId?: string;
  tilesetId?: string;
  uploadId?: string;
  error: unknown;
}) {
  if (params.sourceId) {
    await db
      .update(tilesetSources)
      .set({ status: "ERROR" })
      .where(eq(tilesetSources.id, params.sourceId));
  }
  if (params.tilesetId) {
    await db
      .update(tilesets)
      .set({ status: "ERROR" })
      .where(eq(tilesets.id, params.tilesetId));
  }
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

async function storeProcessedArtifact(params: {
  ownerId: string;
  sourceId: string;
  tilesetId?: string;
  processingJobId?: string;
  data: Buffer;
  format: SourceFormat;
  contentType: string;
}) {
  const storage = getStorage();
  const fileName = sourceArtifactFileName(
    params.format,
    params.processingJobId,
  );
  let versionNumber: number | undefined;
  const storageFormat: TilesetArtifactFormat =
    params.format === "pmtiles" ? "pmtiles" : "directory";
  const storageKey = params.tilesetId
    ? await (async () => {
        const [versionState] = await db
          .select({ latest: max(tilesetVersions.version) })
          .from(tilesetVersions)
          .where(eq(tilesetVersions.tilesetId, params.tilesetId!));
        versionNumber = (versionState?.latest ?? 0) + 1;
        return StoragePaths.tilesetVersion(
          params.ownerId,
          params.tilesetId!,
          versionNumber,
          storageFormat,
        );
      })()
    : StoragePaths.tilesetSourceArtifact(
        params.ownerId,
        params.sourceId,
        fileName,
      );

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
      fileName: params.tilesetId ? `tiles.${storageFormat}` : fileName,
      contentType: stored.contentType,
      size: stored.size,
      resourceType: params.tilesetId ? "tileset" : "tileset_source",
      resourceId: params.tilesetId ?? params.sourceId,
      artifactKind: "processed",
      version: versionNumber
        ? `v${versionNumber}`
        : (params.processingJobId ?? "current"),
    })
    .returning({ id: storageObjects.id });

  return {
    storageObjectId: storageObject!.id,
    storageKey,
    size: stored.size,
    versionNumber,
  };
}

async function finalizeProcessedArtifact(params: {
  ownerId: string;
  sourceId: string;
  tilesetId?: string;
  uploadId?: string;
  processingJobId?: string;
  artifact: Awaited<ReturnType<typeof storeProcessedArtifact>>;
  format: SourceFormat;
  minZoom: number;
  maxZoom: number;
  bounds?: [number, number, number, number] | null;
  fallback?: string;
}) {
  const storage = getStorage();

  if (params.tilesetId) {
    const versionNumber =
      params.artifact.versionNumber ??
      (await nextTilesetVersion(params.tilesetId));
    const [tilesetVersion] = await db
      .insert(tilesetVersions)
      .values({
        tilesetId: params.tilesetId,
        version: versionNumber,
        artifactStorageObjectId: params.artifact.storageObjectId,
        format: tileArtifactFormat(params.format),
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
    return;
  }

  await db
    .update(tilesetSources)
    .set({
      status: "READY",
      url: storage.getUrl(params.artifact.storageKey),
      type: params.format === "pmtiles" ? "VECTOR" : "GEOJSON",
      minZoom: params.minZoom,
      maxZoom: params.maxZoom,
    })
    .where(eq(tilesetSources.id, params.sourceId));

  await markSuccess(params.processingJobId, {
    sourceId: params.sourceId,
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
  level: "info" | "error" = "info",
) {
  await db.insert(processingJobLogs).values({
    jobId,
    level,
    message,
    metadata,
  });
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

function sourceArtifactFileName(
  format: string,
  processingJobId?: string,
): string {
  return processingJobId
    ? `data-${processingJobId}.${format}`
    : `data.${format}`;
}

function tileArtifactFormat(format: SourceFormat): "PMTILES" | "MBTILES" | "DIRECTORY" {
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
