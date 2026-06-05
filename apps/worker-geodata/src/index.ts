import "dotenv/config";
import { Worker } from "bullmq";
import { processSourceJob, type SourceProcessingJob } from "./source-worker";

const REDIS_CONNECTION = {
  host: process.env.REDIS_HOST || "localhost",
  port: Number(process.env.REDIS_PORT) || 6379,
};

const SOURCE_PROCESSING_QUEUE_NAME = "source-processing";

const sourceWorker = new Worker<SourceProcessingJob>(
  SOURCE_PROCESSING_QUEUE_NAME,
  processSourceJob,
  {
    connection: REDIS_CONNECTION,
    concurrency: Number(process.env.GEODATA_WORKER_CONCURRENCY || 2),
  }
);

sourceWorker.on("ready", () => {
  console.log("[worker-geodata] source worker ready");
});

sourceWorker.on("error", (err) => {
  console.error("[worker-geodata] source worker error:", err);
});

sourceWorker.on("failed", (job, err) => {
  console.error(`[worker-geodata] source job ${job?.id} failed:`, err);
});

async function shutdown() {
  await sourceWorker.close();
}

process.on("SIGTERM", () => {
  shutdown().catch((err) => {
    console.error("[worker-geodata] shutdown failed:", err);
    process.exitCode = 1;
  });
});
