import { eq, max } from "drizzle-orm";
import {
  db,
  processingJobLogs,
  processingJobs,
  tilesets,
  tilesetVersions,
  uploads,
} from "@planisfy/database";
import { env } from "./env";
import {
  getToolchainCapabilities,
  summarizeToolchainCapabilities,
} from "./toolchain";

export async function setProcessingStatus(params: {
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

export async function setErrorStatus(params: {
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

export async function setCanceledStatus(params: {
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

export async function updateProgress(
  jobId: string,
  progress: number,
  output?: Record<string, unknown>,
) {
  await db
    .update(processingJobs)
    .set({ progress, output, updatedAt: new Date() })
    .where(eq(processingJobs.id, jobId));
}

export async function logProcessingJob(
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

export async function logToolchainCapabilities(jobId: string) {
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

export async function markProcessingJobStarted(jobId: string) {
  await db
    .update(processingJobs)
    .set({
      status: "PROCESSING",
      startedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(processingJobs.id, jobId));
}

export async function markProcessingJobSucceeded(
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

export async function markProcessingJobFailed(
  jobId: string,
  error: unknown,
) {
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

export async function markProcessingJobCanceled(
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

export async function throwIfCancellationRequested(jobId: string) {
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

export class ProcessingJobCanceledError extends Error {
  constructor(readonly cancelRequestedAt?: Date | null) {
    super("Processing job cancellation requested");
    this.name = "ProcessingJobCanceledError";
  }
}
