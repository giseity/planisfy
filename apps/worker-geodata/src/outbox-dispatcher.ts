import { Queue } from "bullmq";
import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import {
  db,
  eventOutbox,
  processingJobLogs,
  processingJobs,
} from "@planisfy/database";
import { parseEventPayload } from "@planisfy/events";
import { redisConnection } from "./env";
import type { SourceProcessingJob } from "./source-worker";

const SOURCE_PROCESSING_QUEUE_NAME = "source-processing";
const DISPATCHABLE_EVENTS = ["tileset.build.requested"] as const;
const SOURCE_FORMATS = ["geojson", "csv", "shapefile", "pmtiles", "mbtiles"];
const MAX_ATTEMPTS = 5;

type DispatchableEventName = (typeof DISPATCHABLE_EVENTS)[number];
type OutboxEvent = typeof eventOutbox.$inferSelect;

export interface OutboxDispatcher {
  close(): Promise<void>;
}

export function startOutboxDispatcher(params: {
  intervalMs: number;
  batchSize: number;
}): OutboxDispatcher {
  const queue = new Queue<SourceProcessingJob>(SOURCE_PROCESSING_QUEUE_NAME, {
    connection: redisConnection,
    defaultJobOptions: {
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 1000 },
      attempts: 2,
      backoff: { type: "exponential", delay: 5000 },
    },
  });
  let closed = false;
  let running = false;

  async function tick() {
    if (closed || running) return;
    running = true;
    try {
      const events = await claimDueDispatchableEvents(params.batchSize);
      for (const event of events) {
        await dispatchEvent(queue, event);
      }
    } catch (err) {
      console.error("[worker-geodata] outbox dispatch failed:", err);
    } finally {
      running = false;
    }
  }

  const timer = setInterval(() => {
    tick().catch((err) => {
      console.error("[worker-geodata] outbox dispatch tick failed:", err);
    });
  }, params.intervalMs);

  tick().catch((err) => {
    console.error("[worker-geodata] initial outbox dispatch failed:", err);
  });

  return {
    async close() {
      closed = true;
      clearInterval(timer);
      await queue.close();
    },
  };
}

async function claimDueDispatchableEvents(limit: number) {
  const due = await db
    .select({ id: eventOutbox.id })
    .from(eventOutbox)
    .where(
      and(
        eq(eventOutbox.status, "PENDING"),
        inArray(eventOutbox.eventName, [...DISPATCHABLE_EVENTS]),
        lte(eventOutbox.processAt, new Date()),
      ),
    )
    .orderBy(asc(eventOutbox.processAt), asc(eventOutbox.createdAt))
    .limit(limit);

  if (due.length === 0) return [];

  return db
    .update(eventOutbox)
    .set({
      status: "PROCESSING",
      attempts: sql<number>`${eventOutbox.attempts} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(eventOutbox.status, "PENDING"),
        inArray(
          eventOutbox.id,
          due.map((event) => event.id),
        ),
      ),
    )
    .returning();
}

async function dispatchEvent(
  queue: Queue<SourceProcessingJob>,
  event: OutboxEvent,
) {
  try {
    switch (event.eventName as DispatchableEventName) {
      case "tileset.build.requested":
        await dispatchTilesetBuildRequested(queue, event);
        break;
      default:
        throw new Error(`Unsupported geodata outbox event: ${event.eventName}`);
    }
    await completeOutboxEvent(event.id);
  } catch (err) {
    await failOutboxEvent(event, err);
  }
}

async function dispatchTilesetBuildRequested(
  queue: Queue<SourceProcessingJob>,
  event: OutboxEvent,
) {
  const payload = parseEventPayload("tileset.build.requested", event.payload);
  const [processingJob] = await db
    .select()
    .from(processingJobs)
    .where(eq(processingJobs.id, payload.jobId))
    .limit(1);

  if (!processingJob) {
    throw new Error(`Processing job not found: ${payload.jobId}`);
  }

  const input = parseSourceProcessingJobInput(processingJob.input);
  await queue.add("process", input, { jobId: payload.jobId });
  await db.insert(processingJobLogs).values({
    jobId: payload.jobId,
    level: "info",
    message: "Build request dispatched to geodata queue",
    metadata: {
      outboxEventId: event.id,
      tilesetId: payload.tilesetId,
      uploadId: payload.sourceResourceId,
    },
  });
}

function parseSourceProcessingJobInput(input: unknown): SourceProcessingJob {
  if (typeof input !== "object" || input === null) {
    throw new Error("Processing job input is missing");
  }

  const candidate = input as Partial<SourceProcessingJob>;
  if (
    !candidate.ownerId ||
    !candidate.tilesetId ||
    !candidate.uploadKey ||
    !candidate.processingJobId ||
    !candidate.format ||
    !SOURCE_FORMATS.includes(candidate.format)
  ) {
    throw new Error("Processing job input is incomplete");
  }

  return {
    ownerId: candidate.ownerId,
    tilesetId: candidate.tilesetId,
    uploadKey: candidate.uploadKey,
    uploadId: candidate.uploadId,
    storageObjectId: candidate.storageObjectId,
    processingJobId: candidate.processingJobId,
    format: candidate.format,
    csv: candidate.csv,
    options: candidate.options,
  };
}

async function completeOutboxEvent(id: string) {
  await db
    .update(eventOutbox)
    .set({ status: "COMPLETED", updatedAt: new Date() })
    .where(eq(eventOutbox.id, id));
}

async function failOutboxEvent(event: OutboxEvent, error: unknown) {
  const archive = event.attempts >= MAX_ATTEMPTS;
  await db
    .update(eventOutbox)
    .set({
      status: archive ? "FAILED" : "PENDING",
      lastError: error instanceof Error ? error.message : String(error),
      processAt: new Date(Date.now() + retryDelayMs(event.attempts)),
      updatedAt: new Date(),
    })
    .where(eq(eventOutbox.id, event.id));
}

function retryDelayMs(attempts: number) {
  return Math.min(60_000 * 2 ** Math.max(0, attempts - 1), 15 * 60_000);
}
