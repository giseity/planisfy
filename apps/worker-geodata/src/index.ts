import "dotenv/config";
import { Worker } from "bullmq";
import Redis from "ioredis";
import { processSourceJob, type SourceProcessingJob } from "./source-worker";

const REDIS_CONNECTION = getRedisConnection();

const SOURCE_PROCESSING_QUEUE_NAME = "source-processing";
const HEARTBEAT_KEY = "planisfy:worker-geodata:heartbeat";
const HEARTBEAT_INTERVAL_MS = Number(
  process.env.GEODATA_WORKER_HEARTBEAT_INTERVAL_MS || 10_000
);
const HEARTBEAT_TTL_MS = Number(
  process.env.GEODATA_WORKER_HEARTBEAT_TTL_MS || 45_000
);

const sourceWorker = new Worker<SourceProcessingJob>(
  SOURCE_PROCESSING_QUEUE_NAME,
  processSourceJob,
  {
    connection: REDIS_CONNECTION,
    concurrency: Number(process.env.GEODATA_WORKER_CONCURRENCY || 2),
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

function getRedisConnection() {
  if (process.env.REDIS_URL) {
    const url = new URL(process.env.REDIS_URL);
    return {
      host: url.hostname,
      port: Number(url.port || 6379),
      username: url.username || undefined,
      password: url.password || undefined,
    };
  }

  return {
    host: process.env.REDIS_HOST || "localhost",
    port: Number(process.env.REDIS_PORT) || 6379,
  };
}
