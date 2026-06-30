import { and, count, eq, inArray, sql } from "drizzle-orm";
import { db, processingJobLogs, processingJobs } from "@planisfy/database";

type DatabaseClient = typeof db;
type JsonObject = Record<string, unknown>;
const ACTIVE_JOB_STATUSES = ["PENDING", "PROCESSING"] as const;
const DEFAULT_ACTIVE_PROCESSING_JOB_LIMIT = 5;

export class ActiveProcessingJobLimitError extends Error {
  code = "ACTIVE_JOB_LIMIT";

  constructor(
    public current: number,
    public limit: number,
  ) {
    super(`Active processing job limit reached (${current}/${limit})`);
  }
}

export function activeProcessingJobLimit() {
  const configured = Number(process.env.PROCESSING_ACTIVE_JOB_LIMIT);
  return Number.isInteger(configured) && configured > 0
    ? configured
    : DEFAULT_ACTIVE_PROCESSING_JOB_LIMIT;
}

export async function createProcessingJob(
  params: {
    accountId: string;
    type: string;
    input?: JsonObject;
  },
  database: DatabaseClient = db
) {
  const job = await database.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`processingJobs:${params.accountId}`}))`,
    );
    const limit = activeProcessingJobLimit();
    const [row] = await tx
      .select({ count: count() })
      .from(processingJobs)
      .where(
        and(
          eq(processingJobs.accountId, params.accountId),
          inArray(processingJobs.status, [...ACTIVE_JOB_STATUSES]),
        ),
      );
    const current = row?.count ?? 0;
    if (current >= limit) {
      throw new ActiveProcessingJobLimitError(current, limit);
    }

    const [created] = await tx
      .insert(processingJobs)
      .values({
        accountId: params.accountId,
        type: params.type,
        input: params.input,
        status: "PENDING",
      })
      .returning();

    return created;
  });

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
