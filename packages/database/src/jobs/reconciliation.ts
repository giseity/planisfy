import { and, eq, inArray, lt } from "drizzle-orm";
import { db } from "../index";
import {
  processingJobLogs,
  processingJobs,
  sourceImports,
  tilesets,
  uploads,
} from "../schema";

export const STALE_JOB_RECONCILED_CODE = "STALE_JOB_RECONCILED";
export const DEFAULT_STALE_PROCESSING_JOB_MS = 60 * 60 * 1000;
export const ACTIVE_QUEUE_STATES = new Set([
  "active",
  "waiting",
  "delayed",
  "prioritized",
  "waiting-children",
  "paused",
]);

export type QueueJobLiveness = {
  state: string | null;
  active: boolean;
};

export type ReconcileStaleProcessingJobsOptions = {
  accountId?: string;
  now?: Date;
  staleMs?: number;
  limit?: number;
  hasFreshWorkerHeartbeat: boolean;
  getQueueJobLiveness?: (jobId: string) => Promise<QueueJobLiveness>;
};

export type ReconciledProcessingJob = {
  id: string;
  accountId: string;
  type: string;
  previousStatus: "PENDING" | "PROCESSING";
  updatedAt: Date;
  queueState: string | null;
  reason: string;
};

export type ReconcileStaleProcessingJobsResult = {
  scanned: number;
  reconciled: number;
  skippedActive: number;
  latest: ReconciledProcessingJob[];
};

export function shouldReconcileStaleProcessingJob(params: {
  status: string;
  updatedAt: Date;
  now: Date;
  staleMs: number;
  queueActive: boolean;
  hasFreshWorkerHeartbeat: boolean;
}) {
  if (params.status !== "PENDING" && params.status !== "PROCESSING") {
    return false;
  }
  const ageMs = params.now.getTime() - params.updatedAt.getTime();
  if (ageMs <= params.staleMs) return false;
  return !params.queueActive || !params.hasFreshWorkerHeartbeat;
}

export async function reconcileStaleProcessingJobs(
  options: ReconcileStaleProcessingJobsOptions,
): Promise<ReconcileStaleProcessingJobsResult> {
  const now = options.now ?? new Date();
  const staleMs = options.staleMs ?? DEFAULT_STALE_PROCESSING_JOB_MS;
  const cutoff = new Date(now.getTime() - staleMs);
  const limit = options.limit ?? 50;
  const conditions = [
    inArray(processingJobs.status, ["PENDING", "PROCESSING"]),
    lt(processingJobs.updatedAt, cutoff),
  ];

  if (options.accountId) {
    conditions.push(eq(processingJobs.accountId, options.accountId));
  }

  const candidates = await db
    .select({
      id: processingJobs.id,
      accountId: processingJobs.accountId,
      type: processingJobs.type,
      status: processingJobs.status,
      input: processingJobs.input,
      updatedAt: processingJobs.updatedAt,
    })
    .from(processingJobs)
    .where(and(...conditions))
    .orderBy(processingJobs.updatedAt)
    .limit(limit);

  const latest: ReconciledProcessingJob[] = [];
  let skippedActive = 0;

  for (const job of candidates) {
    const queue = await queueLiveness(job.id, options.getQueueJobLiveness);
    if (
      !shouldReconcileStaleProcessingJob({
        status: job.status,
        updatedAt: job.updatedAt,
        now,
        staleMs,
        queueActive: queue.active,
        hasFreshWorkerHeartbeat: options.hasFreshWorkerHeartbeat,
      })
    ) {
      skippedActive += 1;
      continue;
    }

    const reason = staleReason({
      queue,
      hasFreshWorkerHeartbeat: options.hasFreshWorkerHeartbeat,
      staleMs,
    });
    const input = parseProcessingJobResourceInput(job.input);
    const transitioned = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(processingJobs)
        .set({
          status: "FAILED",
          errorCode: STALE_JOB_RECONCILED_CODE,
          errorMessage: reason,
          completedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(processingJobs.id, job.id),
            inArray(processingJobs.status, ["PENDING", "PROCESSING"]),
            lt(processingJobs.updatedAt, cutoff),
          ),
        )
        .returning({ id: processingJobs.id });

      if (!updated) return false;

      await tx.insert(processingJobLogs).values({
        jobId: job.id,
        level: "warn",
        message: "Stale processing job reconciled",
        metadata: {
          reason,
          staleMs,
          queueState: queue.state,
          hasFreshWorkerHeartbeat: options.hasFreshWorkerHeartbeat,
        },
      });

      if (input.tilesetId) {
        await tx
          .update(tilesets)
          .set({ status: "ERROR", updatedAt: now })
          .where(eq(tilesets.id, input.tilesetId));
      } else {
        await tx
          .update(tilesets)
          .set({ status: "ERROR", updatedAt: now })
          .where(eq(tilesets.buildJobId, job.id));
      }

      if (input.uploadId) {
        await tx
          .update(uploads)
          .set({
            status: "ERROR",
            validationResult: {
              ok: false,
              errorCode: STALE_JOB_RECONCILED_CODE,
              message: reason,
            },
            updatedAt: now,
          })
          .where(eq(uploads.id, input.uploadId));
      }

      await tx
        .update(sourceImports)
        .set({
          status: "FAILED",
          errorCode: STALE_JOB_RECONCILED_CODE,
          errorMessage: reason,
          updatedAt: now,
        })
        .where(eq(sourceImports.processingJobId, job.id));

      return true;
    });

    if (!transitioned) continue;

    latest.push({
      id: job.id,
      accountId: job.accountId,
      type: job.type,
      previousStatus: job.status as "PENDING" | "PROCESSING",
      updatedAt: now,
      queueState: queue.state,
      reason,
    });
  }

  return {
    scanned: candidates.length,
    reconciled: latest.length,
    skippedActive,
    latest,
  };
}

export function isQueueStateActive(state: string | null | undefined) {
  return typeof state === "string" && ACTIVE_QUEUE_STATES.has(state);
}

async function queueLiveness(
  jobId: string,
  getQueueJobLiveness: ReconcileStaleProcessingJobsOptions["getQueueJobLiveness"],
): Promise<QueueJobLiveness> {
  if (!getQueueJobLiveness) return { state: null, active: false };

  try {
    return await getQueueJobLiveness(jobId);
  } catch {
    return {
      state: "unavailable",
      active: false,
    };
  }
}

function staleReason(params: {
  queue: QueueJobLiveness;
  hasFreshWorkerHeartbeat: boolean;
  staleMs: number;
}) {
  const missingQueue = !params.queue.active;
  const staleHeartbeat = !params.hasFreshWorkerHeartbeat;
  if (missingQueue && staleHeartbeat) {
    return `Processing job exceeded ${params.staleMs}ms without an active queue job or fresh worker heartbeat.`;
  }
  if (missingQueue) {
    return `Processing job exceeded ${params.staleMs}ms without an active queue job.`;
  }
  return `Processing job exceeded ${params.staleMs}ms without a fresh worker heartbeat.`;
}

function parseProcessingJobResourceInput(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }
  const record = input as Record<string, unknown>;
  return {
    tilesetId:
      typeof record.tilesetId === "string" ? record.tilesetId : undefined,
    uploadId: typeof record.uploadId === "string" ? record.uploadId : undefined,
  };
}
