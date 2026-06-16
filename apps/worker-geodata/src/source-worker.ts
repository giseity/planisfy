import type { Job } from "bullmq";
import { execFile } from "child_process";
import { mkdtemp, readFile, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";
import { eq } from "drizzle-orm";
import { db, uploads } from "@planisfy/database";
import { getStorage } from "@planisfy/storage";
import { env } from "./env";
import {
  logProcessingJob,
  logToolchainCapabilities,
  markProcessingJobCanceled,
  markProcessingJobFailed,
  markProcessingJobStarted,
  ProcessingJobCanceledError,
  setCanceledStatus,
  setErrorStatus,
  setProcessingStatus,
  throwIfCancellationRequested,
  updateProgress,
} from "./job-lifecycle";
import {
  finalizeProcessedArtifact,
  storeProcessedArtifact,
} from "./tileset-artifacts";
import {
  buildTippecanoeArgs,
  missingTippecanoeMessage,
  shouldStoreRawFallback,
  validateUpload,
  type SourceFormat,
} from "./upload-tiling";

const execFileAsync = promisify(execFile);

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
  executionTarget?: {
    id: string;
    name: string;
    provider: "local" | "aws_batch" | "gcp_batch";
    config: Record<string, unknown>;
  } | null;
  workerProfile?: {
    id: string;
    name: string;
    image: string | null;
    command: string[];
    args: string[];
    cpu: number | null;
    memoryMb: number | null;
    timeoutSeconds: number | null;
    concurrency: number | null;
    config: Record<string, unknown>;
  } | null;
  env?: Record<string, string>;
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
    executionTarget,
    workerProfile,
  } = job.data;
  const storage = getStorage();
  const minZoom = options?.minZoom ?? 0;
  const maxZoom = options?.maxZoom ?? 14;
  const childEnv = { ...process.env, ...(job.data.env ?? {}) };
  const toolTimeoutMs = (workerProfile?.timeoutSeconds ?? 300) * 1000;

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
        executionTarget,
        workerProfile,
        env: Object.keys(job.data.env ?? {}),
      });
      await logToolchainCapabilities(processingJobId);
    }

    await setProcessingStatus({
      tilesetId,
      uploadId,
      processingJobId,
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
          { env: childEnv, timeout: toolTimeoutMs },
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
        env: childEnv,
        timeout: toolTimeoutMs,
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
      await setCanceledStatus({ tilesetId, uploadId, processingJobId });
      await markProcessingJobCanceled(processingJobId, err);
      return;
    }

    await setErrorStatus({
      tilesetId,
      uploadId,
      processingJobId,
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

function inputExtension(format: SourceFormat) {
  if (format === "shapefile") return "zip";
  if (format === "geojson") return "geojson";
  return format;
}

function isMissingExecutableError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    err.code === "ENOENT"
  );
}

