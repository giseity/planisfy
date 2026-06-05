import { Queue } from "bullmq";
import { redisConnection } from "../env";

export const SOURCE_PROCESSING_QUEUE_NAME = "source-processing";

export const REDIS_CONNECTION = redisConnection;

export interface SourceProcessingJob {
  sourceId: string;
  ownerId: string;
  uploadKey: string;
  uploadId?: string;
  storageObjectId?: string;
  processingJobId?: string;
  format: "geojson" | "csv" | "shapefile" | "pmtiles";
  options?: {
    minZoom?: number;
    maxZoom?: number;
    dropDensest?: boolean;
    simplification?: number;
  };
}

export const sourceQueue = new Queue<SourceProcessingJob>(
  SOURCE_PROCESSING_QUEUE_NAME,
  {
    connection: REDIS_CONNECTION,
    defaultJobOptions: {
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 1000 },
      attempts: 2,
      backoff: { type: "exponential", delay: 5000 },
    },
  }
);

export function enqueueSourceProcessing(job: SourceProcessingJob): void {
  sourceQueue.add("process", job).catch((err) => {
    console.error("[source-queue] Failed to enqueue:", err);
  });
}

process.on("SIGTERM", async () => {
  await sourceQueue.close();
});
