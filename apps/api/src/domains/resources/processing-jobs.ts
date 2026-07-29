import { and, count, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import {
  db,
  processingJobLogs,
  processingJobs,
  tilesets,
} from "@planisfy/database";

type DatabaseClient = typeof db;
export type DatabaseTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];
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

export class ActiveTilesetBuildError extends Error {
  code = "ACTIVE_TILESET_BUILD";

  constructor(
    public tilesetId: string,
    public jobId: string,
  ) {
    super(`Tileset already has active processing job ${jobId}`);
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
    targetTilesetId?: string;
  },
  database: DatabaseClient = db,
) {
  const job = await database.transaction(async (tx) => {
    return createProcessingJobInTransaction(params, tx);
  });

  return job!;
}

export async function createProcessingJobInTransaction(
  params: {
    accountId: string;
    type: string;
    input?: JsonObject;
    targetTilesetId?: string;
  },
  tx: DatabaseTransaction,
) {
  await lockProcessingJobAdmission(
    {
      accountId: params.accountId,
      targetTilesetId: params.targetTilesetId,
    },
    tx,
  );

  const [created] = await tx
    .insert(processingJobs)
    .values({
      accountId: params.accountId,
      type: params.type,
      input: params.input,
      status: "PENDING",
    })
    .returning();

  return created!;
}

export async function lockProcessingJobAdmission(
  params: {
    accountId: string;
    targetTilesetId?: string;
    excludeJobId?: string;
  },
  tx: DatabaseTransaction,
) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`processingJobs:${params.accountId}`}))`,
  );

  if (params.targetTilesetId) {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`tilesetBuild:${params.targetTilesetId}`}))`,
    );
  }

  const [row] = await tx
    .select({ count: count() })
    .from(processingJobs)
    .where(
      and(
        eq(processingJobs.accountId, params.accountId),
        inArray(processingJobs.status, [...ACTIVE_JOB_STATUSES]),
        params.excludeJobId
          ? ne(processingJobs.id, params.excludeJobId)
          : undefined,
      ),
    );
  const current = row?.count ?? 0;
  const limit = activeProcessingJobLimit();
  if (current >= limit) {
    throw new ActiveProcessingJobLimitError(current, limit);
  }

  if (!params.targetTilesetId) return;

  const [target] = await tx
    .select({ buildJobId: tilesets.buildJobId })
    .from(tilesets)
    .where(
      and(
        eq(tilesets.id, params.targetTilesetId),
        eq(tilesets.accountId, params.accountId),
        isNull(tilesets.deletedAt),
      ),
    )
    .limit(1);

  if (!target) {
    throw new Error("Target tileset was not found during job admission");
  }

  const [active] = await tx
    .select({ id: processingJobs.id })
    .from(processingJobs)
    .where(
      and(
        eq(processingJobs.accountId, params.accountId),
        inArray(processingJobs.status, [...ACTIVE_JOB_STATUSES]),
        params.excludeJobId
          ? ne(processingJobs.id, params.excludeJobId)
          : undefined,
        or(
          target.buildJobId
            ? eq(processingJobs.id, target.buildJobId)
            : undefined,
          sql`${processingJobs.input}->>'tilesetId' = ${params.targetTilesetId}`,
          sql`${processingJobs.input}->>'targetTilesetId' = ${params.targetTilesetId}`,
        ),
      ),
    )
    .limit(1);

  if (active) {
    throw new ActiveTilesetBuildError(params.targetTilesetId, active.id);
  }

  if (target.buildJobId) {
    await tx
      .update(tilesets)
      .set({ buildJobId: null, updatedAt: new Date() })
      .where(
        and(
          eq(tilesets.id, params.targetTilesetId),
          eq(tilesets.buildJobId, target.buildJobId),
        ),
      );
  }
}

export async function logProcessingJob(
  jobId: string,
  message: string,
  params: {
    level?: "debug" | "info" | "warn" | "error";
    metadata?: JsonObject;
  } = {},
  database: DatabaseClient | DatabaseTransaction = db,
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
