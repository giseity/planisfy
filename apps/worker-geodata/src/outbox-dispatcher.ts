import { Queue } from "bullmq";
import { and, asc, eq, inArray, lte, max, sql } from "drizzle-orm";
import {
  SOURCE_PROCESSING_QUEUE_NAME,
  parseSourceProcessingJobInput as parseSharedSourceProcessingJobInput,
} from "@planisfy/geodata-contracts";
import {
  db,
  datasets,
  datasetVersions,
  eventOutbox,
  processingJobLogs,
  processingJobs,
  sourceImports,
  storageObjects,
} from "@planisfy/database";
import { parseEventPayload } from "@planisfy/events";
import { getStorage } from "@planisfy/storage";
import { StoragePaths } from "@planisfy/storage-paths";
import { env, redisConnection } from "./env";
import {
  parseOvertureImportInput,
  runOvertureImport,
  type OvertureImportResult,
} from "./overture-import";
import { resolveLocalExecutionRuntime } from "./execution-runtime";
import type { SourceProcessingJob } from "./source-worker";

const DISPATCHABLE_EVENTS = [
  "tileset.build.requested",
  "source.import.requested",
] as const;
const MAX_ATTEMPTS = 5;

type DispatchableEventName = (typeof DISPATCHABLE_EVENTS)[number];
type OutboxEvent = typeof eventOutbox.$inferSelect;
type ExistingQueueJob = {
  getState(): Promise<string>;
  remove(): Promise<void>;
};
type SourceQueue = Pick<Queue<SourceProcessingJob>, "add"> & {
  getJob(jobId: string): Promise<ExistingQueueJob | null | undefined>;
};

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
      case "source.import.requested":
        await dispatchSourceImportRequested(event);
        break;
      default:
        throw new Error(`Unsupported geodata outbox event: ${event.eventName}`);
    }
    await completeOutboxEvent(event.id);
  } catch (err) {
    await failOutboxEvent(event, err);
  }
}

async function dispatchSourceImportRequested(event: OutboxEvent) {
  const payload = parseEventPayload("source.import.requested", event.payload);
  const [processingJob] = await db
    .select()
    .from(processingJobs)
    .where(eq(processingJobs.id, payload.jobId))
    .limit(1);

  if (!processingJob) {
    throw new Error(`Processing job not found: ${payload.jobId}`);
  }

  const now = new Date();
  await markSourceImportProcessing({
    jobId: payload.jobId,
    importId: payload.importId,
    datasetId: payload.datasetId,
    startedAt: processingJob.startedAt ?? now,
  });

  try {
    if (processingJob.status === "CANCELED" || processingJob.cancelRequestedAt) {
      throw new Error("Source import skipped because processing job is canceled");
    }

    const input = parseOvertureImportInput(processingJob.input);
    const result = await runOvertureImport(input, {
      duckdbPath: env.DUCKDB_PATH,
      release: env.OVERTURE_RELEASE,
      parquetUrlTemplate: env.OVERTURE_PARQUET_URL_TEMPLATE,
      maxFeatures: env.SOURCE_IMPORT_MAX_FEATURES,
      timeoutMs: env.SOURCE_IMPORT_TIMEOUT_MS,
    });
    const stored = await storeDatasetArtifact({
      accountId: payload.accountId,
      datasetId: payload.datasetId,
      result,
    });

    const output = {
      provider: payload.provider,
      importId: payload.importId,
      datasetId: payload.datasetId,
      stage: "extracted",
      storageKey: stored.storageKey,
      storageObjectId: stored.storageObjectId,
      datasetVersionId: stored.datasetVersionId,
      version: stored.version,
      featureCount: result.featureCount,
      bounds: result.bounds,
      schema: result.schemaSummary,
      provenance: result.provenance,
      warnings: result.warnings,
    };

    await markSourceImportSucceeded({
      jobId: payload.jobId,
      importId: payload.importId,
      datasetId: payload.datasetId,
      datasetVersionId: stored.datasetVersionId,
      output,
    });
  } catch (err) {
    await markSourceImportFailed({
      jobId: payload.jobId,
      importId: payload.importId,
      datasetId: payload.datasetId,
      error: err,
    });
  }
}

async function markSourceImportProcessing(params: {
  jobId: string;
  importId: string;
  datasetId: string;
  startedAt: Date;
}) {
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(processingJobs)
      .set({
        status: "PROCESSING",
        progress: 20,
        startedAt: params.startedAt,
        updatedAt: now,
      })
      .where(eq(processingJobs.id, params.jobId));

    await tx
      .update(sourceImports)
      .set({ status: "PROCESSING", updatedAt: now })
      .where(eq(sourceImports.id, params.importId));

    await tx
      .update(datasets)
      .set({ updatedAt: now })
      .where(eq(datasets.id, params.datasetId));

    await tx.insert(processingJobLogs).values({
      jobId: params.jobId,
      level: "info",
      message: "Overture DuckDB extract started",
      metadata: { importId: params.importId, datasetId: params.datasetId },
    });
  });
}

async function storeDatasetArtifact(params: {
  accountId: string;
  datasetId: string;
  result: OvertureImportResult;
}) {
  const version = await nextDatasetVersion(params.datasetId);
  const storageKey = StoragePaths.datasetVersion(
    params.accountId,
    params.datasetId,
    version,
  );
  const storage = getStorage();
  const stored = await storage.upload(
    storageKey,
    params.result.data,
    "application/geo+json",
  );
  const storageInfo = storage.getInfo();

  const [storageObject] = await db
    .insert(storageObjects)
    .values({
      accountId: params.accountId,
      provider: storageInfo.provider,
      bucket: storageInfo.bucket,
      storageKey,
      fileName: "features.geojson",
      contentType: stored.contentType,
      size: stored.size,
      resourceType: "dataset",
      resourceId: params.datasetId,
      artifactKind: "import",
      version: `v${version}`,
    })
    .returning({ id: storageObjects.id });

  const [datasetVersion] = await db
    .insert(datasetVersions)
    .values({
      datasetId: params.datasetId,
      version,
      storageObjectId: storageObject!.id,
      bounds: params.result.bounds,
      featureCount: params.result.featureCount,
      schemaSummary: params.result.schemaSummary,
    })
    .returning({ id: datasetVersions.id });

  return {
    storageKey,
    storageObjectId: storageObject!.id,
    datasetVersionId: datasetVersion!.id,
    version,
  };
}

async function markSourceImportSucceeded(params: {
  jobId: string;
  importId: string;
  datasetId: string;
  datasetVersionId: string;
  output: Record<string, unknown>;
}) {
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(datasets)
      .set({
        status: "READY",
        currentVersionId: params.datasetVersionId,
        bounds: params.output.bounds,
        featureCount: params.output.featureCount as number | undefined,
        schemaSummary: params.output.schema,
        updatedAt: now,
      })
      .where(eq(datasets.id, params.datasetId));

    await tx
      .update(sourceImports)
      .set({
        status: "SUCCEEDED",
        output: params.output,
        updatedAt: now,
      })
      .where(eq(sourceImports.id, params.importId));

    await tx
      .update(processingJobs)
      .set({
        status: "SUCCEEDED",
        progress: 100,
        output: params.output,
        completedAt: now,
        updatedAt: now,
      })
      .where(eq(processingJobs.id, params.jobId));

    await tx.insert(processingJobLogs).values({
      jobId: params.jobId,
      level: "info",
      message: "Overture import extracted and stored",
      metadata: params.output,
    });
  });
}

async function markSourceImportFailed(params: {
  jobId: string;
  importId: string;
  datasetId: string;
  error: unknown;
}) {
  const now = new Date();
  const message = params.error instanceof Error ? params.error.message : String(params.error);
  await db.transaction(async (tx) => {
    await tx
      .update(datasets)
      .set({ status: "ERROR", updatedAt: now })
      .where(eq(datasets.id, params.datasetId));

    await tx
      .update(sourceImports)
      .set({
        status: "FAILED",
        errorCode: "OVERTURE_IMPORT_FAILED",
        errorMessage: message,
        updatedAt: now,
      })
      .where(eq(sourceImports.id, params.importId));

    await tx
      .update(processingJobs)
      .set({
        status: "FAILED",
        errorCode: "OVERTURE_IMPORT_FAILED",
        errorMessage: message,
        completedAt: now,
        updatedAt: now,
      })
      .where(eq(processingJobs.id, params.jobId));

    await tx.insert(processingJobLogs).values({
      jobId: params.jobId,
      level: "error",
      message: "Overture DuckDB extract failed",
      metadata: { importId: params.importId, datasetId: params.datasetId, message },
    });
  });
}

async function nextDatasetVersion(datasetId: string) {
  const [versionState] = await db
    .select({ latest: max(datasetVersions.version) })
    .from(datasetVersions)
    .where(eq(datasetVersions.datasetId, datasetId));

  return (versionState?.latest ?? 0) + 1;
}

async function dispatchTilesetBuildRequested(
  queue: SourceQueue,
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

  if (processingJob.status === "CANCELED" || processingJob.cancelRequestedAt) {
    await db.insert(processingJobLogs).values({
      jobId: payload.jobId,
      level: "warn",
      message: "Build request skipped because processing job is canceled",
      metadata: {
        outboxEventId: event.id,
        tilesetId: payload.tilesetId,
        uploadId: payload.sourceResourceId,
      },
    });
    return;
  }

  const input = parseSourceProcessingJobInput(processingJob.input, {
    ownerId: processingJob.accountId,
    processingJobId: payload.jobId,
  });
  const existingQueueJob = await removeRetryableSourceProcessingJob(
    queue,
    payload.jobId,
  );
  if (existingQueueJob.action === "kept") {
    await db.insert(processingJobLogs).values({
      jobId: payload.jobId,
      level: "info",
      message: "Build request already exists in geodata queue",
      metadata: {
        outboxEventId: event.id,
        tilesetId: payload.tilesetId,
        queueState: existingQueueJob.state,
      },
    });
    return;
  }

  const runtime = await resolveLocalExecutionRuntime({
    accountId: processingJob.accountId,
    executionTargetId: processingJob.executionTargetId,
    workerProfileId: processingJob.workerProfileId,
    secret: credentialSecret(),
  });
  await queue.add("process", { ...input, ...runtime }, { jobId: payload.jobId });
  await db.insert(processingJobLogs).values({
    jobId: payload.jobId,
    level: "info",
    message: "Build request dispatched to geodata queue",
    metadata: {
      outboxEventId: event.id,
      tilesetId: payload.tilesetId,
      uploadId: payload.sourceResourceId,
      executionTargetId: processingJob.executionTargetId,
      workerProfileId: processingJob.workerProfileId,
      env: Object.keys(runtime.env),
    },
  });
}

export async function removeRetryableSourceProcessingJob(
  queue: Pick<SourceQueue, "getJob">,
  jobId: string,
): Promise<
  | { action: "none" }
  | { action: "kept"; state: string }
  | { action: "removed"; state: string }
> {
  const existing = await queue.getJob(jobId);
  if (!existing) return { action: "none" };

  const state = await existing.getState();
  if (isRunnableBullMqState(state)) {
    return { action: "kept", state };
  }

  await existing.remove();
  return { action: "removed", state };
}

function isRunnableBullMqState(state: string) {
  return (
    state === "active" ||
    state === "delayed" ||
    state === "prioritized" ||
    state === "waiting" ||
    state === "waiting-children"
  );
}

export function parseSourceProcessingJobInput(
  input: unknown,
  context: {
    ownerId: string;
    processingJobId: string;
  },
): SourceProcessingJob {
  const parsed = parseSharedSourceProcessingJobInput(input);

  return {
    ownerId: context.ownerId,
    tilesetId: parsed.tilesetId,
    uploadKey: parsed.uploadKey,
    uploadId: parsed.uploadId,
    datasetId: parsed.datasetId,
    datasetVersionId: parsed.datasetVersionId,
    storageObjectId: parsed.storageObjectId,
    processingJobId: context.processingJobId,
    format: parsed.format,
    csv: parsed.csv,
    options: parsed.options,
  };
}

function credentialSecret() {
  return (
    env.SOURCE_CREDENTIAL_ENCRYPTION_KEY ||
    env.BETTER_AUTH_SECRET ||
    env.INTERNAL_API_SECRET
  );
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
