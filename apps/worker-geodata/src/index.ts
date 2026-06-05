import { Worker } from "bullmq";
import Redis from "ioredis";
import { env, redisConnection } from "./env";
import { processSourceJob, type SourceProcessingJob } from "./source-worker";

const REDIS_CONNECTION = redisConnection;

const SOURCE_PROCESSING_QUEUE_NAME = "source-processing";
const HEARTBEAT_KEY = "planisfy:worker-geodata:heartbeat";
const HEARTBEAT_INTERVAL_MS = env.GEODATA_WORKER_HEARTBEAT_INTERVAL_MS;
const HEARTBEAT_TTL_MS = env.GEODATA_WORKER_HEARTBEAT_TTL_MS;

const sourceWorker = new Worker<SourceProcessingJob>(
  SOURCE_PROCESSING_QUEUE_NAME,
  processSourceJob,
  {
    connection: REDIS_CONNECTION,
    concurrency: env.GEODATA_WORKER_CONCURRENCY,
  }
);
const heartbeatRedis = new Redis(REDIS_CONNECTION);
const heartbeat = setInterval(() => {
  writeHeartbeat().catch((err) => {
    console.error("[worker-geodata] heartbeat failed:", err);
  });
}, HEARTBEAT_INTERVAL_MS);

sourceWorker.on("ready", () => {
  console.log("[worker-geodata] source worker ready");
  writeHeartbeat().catch((err) => {
    console.error("[worker-geodata] initial heartbeat failed:", err);
  });
});

sourceWorker.on("error", (err) => {
  console.error("[worker-geodata] source worker error:", err);
});

sourceWorker.on("failed", (job, err) => {
  console.error(`[worker-geodata] source job ${job?.id} failed:`, err);
});

async function shutdown() {
  clearInterval(heartbeat);
  await sourceWorker.close();
  await heartbeatRedis.quit();
}

process.on("SIGTERM", () => {
  shutdown().catch((err) => {
    console.error("[worker-geodata] shutdown failed:", err);
    process.exitCode = 1;
  });
});

async function writeHeartbeat() {
  await heartbeatRedis.set(
    HEARTBEAT_KEY,
    JSON.stringify({
      status: "ok",
      pid: process.pid,
      timestamp: new Date().toISOString(),
    }),
    "PX",
    HEARTBEAT_TTL_MS
  );
}
