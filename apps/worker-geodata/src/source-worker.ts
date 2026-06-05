import type { Job } from "bullmq";
import { execFile } from "child_process";
import { mkdtemp, readFile, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";
import { eq } from "drizzle-orm";
import {
  db,
  processingJobLogs,
  processingJobs,
  storageObjects,
  tilesetSources,
} from "@planisfy/database";
import { getStorage } from "@planisfy/storage";
import { StoragePaths } from "@planisfy/storage-paths";

const execFileAsync = promisify(execFile);

export interface SourceProcessingJob {
  sourceId: string;
  ownerId: string;
  uploadKey: string;
  uploadId?: string;
  storageObjectId?: string;
  processingJobId?: string;
  format: "geojson" | "csv" | "shapefile" | "pmtiles";
  options?: {
    minZoom?: number;
    maxZoom?: number;
    dropDensest?: boolean;
    simplification?: number;
  };
}

export async function processSourceJob(job: Job<SourceProcessingJob>) {
  const { sourceId, ownerId, uploadKey, format, options, processingJobId } = job.data;
  const storage = getStorage();

  console.log(`[worker-geodata] processing source ${sourceId} (${format})`);

  if (processingJobId) {
    await markProcessingJobStarted(processingJobId);
    await logProcessingJob(processingJobId, "Source processing started", {
      sourceId,
      uploadKey,
      format,
    });
  }

  await db
    .update(tilesetSources)
    .set({ status: "PROCESSING" })
    .where(eq(tilesetSources.id, sourceId));

  const tmpDir = await mkdtemp(join(tmpdir(), "planisfy-source-"));

  try {
    const rawData = await storage.download(uploadKey);

    if (format === "pmtiles") {
      const result = await storeProcessedArtifact({
        ownerId,
        sourceId,
        processingJobId,
        data: rawData,
        format: "pmtiles",
        contentType: "application/x-protobuf",
      });

      await db
        .update(tilesetSources)
        .set({
          status: "READY",
          url: storage.getUrl(result.storageKey),
        })
        .where(eq(tilesetSources.id, sourceId));

      await markSuccess(processingJobId, {
        sourceId,
        storageKey: result.storageKey,
        size: result.size,
      });
      return;
    }

    const inputPath = join(tmpDir, `input.${format === "geojson" ? "geojson" : format}`);
    await writeFile(inputPath, rawData);

    if (format === "geojson") {
      const geojson = JSON.parse(rawData.toString("utf-8"));
      const featureCount = geojson.features?.length ?? 0;

      if (!geojson.type || !["FeatureCollection", "Feature", "GeometryCollection"].includes(geojson.type)) {
        throw new Error("Invalid GeoJSON: missing or invalid 'type' property");
      }

      if (featureCount === 0 && geojson.type === "FeatureCollection") {
        throw new Error("GeoJSON FeatureCollection has no features");
      }

      const bounds = calculateBounds(geojson);
      if (bounds) {
        await db
          .update(tilesetSources)
          .set({ bounds })
          .where(eq(tilesetSources.id, sourceId));
      }
    }

    const outputPath = join(tmpDir, "output.pmtiles");
    const minZoom = options?.minZoom ?? 0;
    const maxZoom = options?.maxZoom ?? 14;

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
      await execFileAsync("tippecanoe", tippecanoeArgs, { timeout: 300_000 });
    } catch (err) {
      if (isMissingExecutableError(err)) {
        console.warn("[worker-geodata] tippecanoe not found, storing raw file");
        const result = await storeProcessedArtifact({
          ownerId,
          sourceId,
          processingJobId,
          data: rawData,
          format,
          contentType: "application/geo+json",
        });

        await db
          .update(tilesetSources)
          .set({
            status: "READY",
            url: storage.getUrl(result.storageKey),
            type: "GEOJSON",
          })
          .where(eq(tilesetSources.id, sourceId));

        await markSuccess(processingJobId, {
          sourceId,
          storageKey: result.storageKey,
          size: result.size,
          fallback: "raw",
        });
        return;
      }

      throw err;
    }

    const pmtilesData = await readFile(outputPath);
    const result = await storeProcessedArtifact({
      ownerId,
      sourceId,
      processingJobId,
      data: pmtilesData,
      format: "pmtiles",
      contentType: "application/x-protobuf",
    });

    await db
      .update(tilesetSources)
      .set({
        status: "READY",
        url: storage.getUrl(result.storageKey),
        type: "VECTOR",
        minZoom,
        maxZoom,
      })
      .where(eq(tilesetSources.id, sourceId));

    await markSuccess(processingJobId, {
      sourceId,
      storageKey: result.storageKey,
      size: result.size,
      minZoom,
      maxZoom,
    });
  } catch (err) {
    await db
      .update(tilesetSources)
      .set({ status: "ERROR" })
      .where(eq(tilesetSources.id, sourceId));

    if (processingJobId) {
      await markProcessingJobFailed(processingJobId, err);
      await logProcessingJob(processingJobId, "Source processing failed", {
        sourceId,
        message: err instanceof Error ? err.message : String(err),
      }, "error");
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

async function storeProcessedArtifact(params: {
  ownerId: string;
  sourceId: string;
  processingJobId?: string;
  data: Buffer;
  format: string;
  contentType: string;
}) {
  const storage = getStorage();
  const fileName = sourceArtifactFileName(params.format, params.processingJobId);
  const storageKey = StoragePaths.tilesetSourceArtifact(
    params.ownerId,
    params.sourceId,
    fileName
  );
  const stored = await storage.upload(storageKey, params.data, params.contentType);
  const storageInfo = storage.getInfo();

  await db.insert(storageObjects).values({
    accountId: params.ownerId,
    provider: storageInfo.provider,
    bucket: storageInfo.bucket,
    storageKey,
    fileName,
    contentType: stored.contentType,
    size: stored.size,
    resourceType: "tileset_source",
    resourceId: params.sourceId,
    artifactKind: "processed",
    version: "current",
  });

  return {
    storageKey,
    size: stored.size,
  };
}

async function logProcessingJob(
  jobId: string,
  message: string,
  metadata?: Record<string, unknown>,
  level: "info" | "error" = "info"
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
  output: Record<string, unknown>
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

function sourceArtifactFileName(format: string, processingJobId?: string): string {
  return processingJobId ? `data-${processingJobId}.${format}` : `data.${format}`;
}

function isMissingExecutableError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && err.code === "ENOENT";
}

function calculateBounds(geojson: any): [number, number, number, number] | null {
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

  function processGeometry(geom: any) {
    if (!geom) return;
    if (geom.coordinates) processCoords(geom.coordinates);
    if (geom.geometries) geom.geometries.forEach(processGeometry);
  }

  if (geojson.type === "FeatureCollection") {
    geojson.features?.forEach((feature: any) => processGeometry(feature.geometry));
  } else if (geojson.type === "Feature") {
    processGeometry(geojson.geometry);
  } else {
    processGeometry(geojson);
  }

  return hasCoords ? [minLon, minLat, maxLon, maxLat] : null;
}
