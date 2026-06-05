import { eq } from "drizzle-orm";
import { db, processingJobLogs, processingJobs } from "@planisfy/database";

type DatabaseClient = typeof db;
type JsonObject = Record<string, unknown>;

export async function createProcessingJob(
  params: {
    accountId: string;
    type: string;
    input?: JsonObject;
  },
  database: DatabaseClient = db
) {
  const [job] = await database
    .insert(processingJobs)
    .values({
      accountId: params.accountId,
      type: params.type,
      input: params.input,
      status: "PENDING",
    })
    .returning();

  return job!;
}

export async function logProcessingJob(
  jobId: string,
  message: string,
  params: {
    level?: "debug" | "info" | "warn" | "error";
    metadata?: JsonObject;
  } = {},
  database: DatabaseClient = db
) {
  const [log] = await database
    .insert(processingJobLogs)
    .values({
      jobId,
      level: params.level ?? "info",
      message,
      metadata: params.metadata,
    })
    .returning();

  return log!;
}

export async function updateProcessingJobProgress(
  jobId: string,
  progress: number,
  output?: JsonObject
) {
  await db
    .update(processingJobs)
    .set({
      progress: Math.max(0, Math.min(100, progress)),
      output,
      updatedAt: new Date(),
    })
    .where(eq(processingJobs.id, jobId));
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
  jobId: string,
  output?: JsonObject
) {
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
  params: { errorCode?: string } = {}
) {
  const message = error instanceof Error ? error.message : String(error);
  await db
    .update(processingJobs)
    .set({
      status: "FAILED",
      errorCode: params.errorCode ?? "PROCESSING_FAILED",
      errorMessage: message,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(processingJobs.id, jobId));
}
