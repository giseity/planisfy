import { Queue, Worker } from "bullmq";
import { db, usageLogs } from "@planisfy/database";
import type { UsageLogEntry } from "@planisfy/utils/usage-writer";
import { redisConnection } from "../env";

const REDIS_CONNECTION = redisConnection;

const QUEUE_NAME = "usage-logging";
const BATCH_SIZE = 50;
const BATCH_INTERVAL_MS = 5_000; // Flush every 5 seconds

// ── Queue (producer) ────────────────────────────────────────────────────────

export const usageQueue = new Queue<UsageLogEntry>(QUEUE_NAME, {
  connection: REDIS_CONNECTION,
  defaultJobOptions: {
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
    attempts: 3,
    backoff: { type: "exponential", delay: 1000 },
  },
});

/**
 * Enqueue a usage log entry (non-blocking).
 * Safe to call in the hot path — never throws.
 */
export function enqueueUsageLog(entry: UsageLogEntry): void {
  usageQueue.add("log", entry).catch((err) => {
    console.error("[usage-queue] Failed to enqueue:", err);
  });
}

// ── Worker (consumer) — batch insert ────────────────────────────────────────

const batch: UsageLogEntry[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

async function flushBatch(): Promise<void> {
  if (batch.length === 0) return;

  const toInsert = batch.splice(0, batch.length);
  try {
    await db.insert(usageLogs).values(
      toInsert.map((entry) => ({
        apiKeyId: entry.apiKeyId ?? null,
        profileId: entry.profileId ?? null,
        endpoint: entry.endpoint,
        method: entry.method,
        statusCode: entry.statusCode,
        cost: entry.cost ?? 1,
        ipAddress: entry.ipAddress ?? null,
        referer: entry.referer ?? null,
        userAgent: entry.userAgent ?? null,
      })),
    );
  } catch (err) {
    console.error(
      `[usage-worker] Failed to insert ${toInsert.length} rows:`,
      err,
    );
    // Put failed entries back for retry on next flush
    batch.unshift(...toInsert);
  }
}

function scheduleBatchFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(async () => {
    flushTimer = null;
    await flushBatch();
  }, BATCH_INTERVAL_MS);
}

export const usageWorker = new Worker<UsageLogEntry>(
  QUEUE_NAME,
  async (job) => {
    batch.push(job.data);
    if (batch.length >= BATCH_SIZE) {
      await flushBatch();
    } else {
      scheduleBatchFlush();
    }
  },
  {
    connection: REDIS_CONNECTION,
    concurrency: 1, // Process sequentially for batch efficiency
  },
);

usageWorker.on("error", (err) => {
  console.error("[usage-worker] Error:", err);
});

usageWorker.on("failed", (job, err) => {
  console.error(`[usage-worker] Job ${job?.id} failed:`, err);
});

// Flush remaining batch on shutdown
process.on("SIGTERM", async () => {
  await flushBatch();
  await usageWorker.close();
  await usageQueue.close();
});
