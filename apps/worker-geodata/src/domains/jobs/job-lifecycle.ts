import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  db,
  processingJobLogs,
  processingJobs,
  tilesets,
  uploads,
} from "@planisfy/database";
import { env } from "../../env";
import {
  getToolchainCapabilities,
  summarizeToolchainCapabilities,
} from "../toolchain/toolchain";

export async function setProcessingStatus(params: {
  tilesetId: string;
  uploadId?: string;
  processingJobId?: string;
}) {
  await db.transaction(async (tx) => {
    const [updatedTileset] = await tx
      .update(tilesets)
      .set({ status: "BUILDING" })
      .where(activeTilesetBuild(params.tilesetId, params.processingJobId))
      .returning({ id: tilesets.id });

    if (updatedTileset && params.uploadId) {
      await tx
        .update(uploads)
        .set({ status: "VALIDATING", linkedTilesetId: params.tilesetId })
        .where(eq(uploads.id, params.uploadId));
    }
  });
}

export async function setErrorStatus(params: {
  tilesetId: string;
  uploadId?: string;
  error: unknown;
  processingJobId?: string;
}) {
  await db.transaction(async (tx) => {
    const [updatedTileset] = await tx
      .update(tilesets)
      .set({ status: "ERROR", buildJobId: null, updatedAt: new Date() })
      .where(activeTilesetBuild(params.tilesetId, params.processingJobId))
      .returning({ id: tilesets.id });

    if (updatedTileset && params.uploadId) {
      await tx
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
  });
}

export async function setCanceledStatus(params: {
  tilesetId: string;
  uploadId?: string;
  processingJobId?: string;
}) {
  await db.transaction(async (tx) => {
    const [updatedTileset] = await tx
      .update(tilesets)
      .set({
        status: canceledTilesetStatusExpression(),
        buildJobId: null,
        updatedAt: new Date(),
      })
      .where(activeTilesetBuild(params.tilesetId, params.processingJobId))
      .returning({ id: tilesets.id });

    if (updatedTileset && params.uploadId) {
      await tx
        .update(uploads)
        .set({ status: "UPLOADED", linkedTilesetId: params.tilesetId })
        .where(eq(uploads.id, params.uploadId));
    }
  });
}

export function canceledTilesetStatusExpression() {
  return sql<
    typeof tilesets.status
  >`case when ${tilesets.currentVersionId} is null then 'DRAFT'::tileset_status else 'READY'::tileset_status end`;
}

export async function updateProgress(
  jobId: string,
  progress: number,
  output?: Record<string, unknown>,
) {
  await db
    .update(processingJobs)
    .set({ progress, output, updatedAt: new Date() })
    .where(activeProcessingJob(jobId));
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
    .where(
      and(
        eq(processingJobs.id, jobId),
        inArray(processingJobs.status, ["PENDING", "PROCESSING"]),
        isNull(processingJobs.cancelRequestedAt),
      ),
    );
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
    .where(activeProcessingJob(jobId));
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
    .where(
      and(
        eq(processingJobs.id, jobId),
        inArray(processingJobs.status, ["PENDING", "PROCESSING", "CANCELED"]),
      ),
    );

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

  if (
    !job ||
    !["PENDING", "PROCESSING"].includes(job.status) ||
    job.cancelRequestedAt
  ) {
    throw new ProcessingJobCanceledError(job?.cancelRequestedAt);
  }
}

export class ProcessingJobCanceledError extends Error {
  constructor(readonly cancelRequestedAt?: Date | null) {
    super("Processing job cancellation requested");
    this.name = "ProcessingJobCanceledError";
  }
}

function activeProcessingJob(jobId: string) {
  return and(
    eq(processingJobs.id, jobId),
    inArray(processingJobs.status, ["PENDING", "PROCESSING"]),
    isNull(processingJobs.cancelRequestedAt),
  );
}

function activeTilesetBuild(tilesetId: string, processingJobId?: string) {
  const base = eq(tilesets.id, tilesetId);
  return processingJobId
    ? and(base, eq(tilesets.buildJobId, processingJobId))
    : base;
}
