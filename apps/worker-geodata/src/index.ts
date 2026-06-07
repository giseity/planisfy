import { Worker } from "bullmq";
import Redis from "ioredis";
import {
  SOURCE_PROCESSING_QUEUE_NAME,
  WORKER_GEODATA_HEARTBEAT_KEY,
} from "@planisfy/geodata-contracts";
import { env, redisConnection } from "./env";
import { startOutboxDispatcher } from "./outbox-dispatcher";
import { processSourceJob, type SourceProcessingJob } from "./source-worker";
import {
  getToolchainCapabilities,
  summarizeToolchainCapabilities,
  type ToolchainCapabilities,
} from "./toolchain";

const REDIS_CONNECTION = redisConnection;

const HEARTBEAT_INTERVAL_MS = env.GEODATA_WORKER_HEARTBEAT_INTERVAL_MS;
const HEARTBEAT_TTL_MS = env.GEODATA_WORKER_HEARTBEAT_TTL_MS;
let toolchainCapabilities: ToolchainCapabilities | undefined;

const sourceWorker = new Worker<SourceProcessingJob>(
  SOURCE_PROCESSING_QUEUE_NAME,
  processSourceJob,
  {
    connection: REDIS_CONNECTION,
    concurrency: env.GEODATA_WORKER_CONCURRENCY,
  }
);
const heartbeatRedis = new Redis(REDIS_CONNECTION);
const outboxDispatcher = startOutboxDispatcher({
  intervalMs: env.GEODATA_OUTBOX_POLL_INTERVAL_MS,
  batchSize: env.GEODATA_OUTBOX_BATCH_SIZE,
});
const heartbeat = setInterval(() => {
  writeHeartbeat().catch((err) => {
    console.error("[worker-geodata] heartbeat failed:", err);
  });
}, HEARTBEAT_INTERVAL_MS);

refreshToolchainCapabilities().catch((err) => {
  console.error("[worker-geodata] toolchain capability check failed:", err);
});

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
  await outboxDispatcher.close();
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
    WORKER_GEODATA_HEARTBEAT_KEY,
    JSON.stringify({
      status: "ok",
      pid: process.pid,
      timestamp: new Date().toISOString(),
      toolchain: toolchainCapabilities,
    }),
    "PX",
    HEARTBEAT_TTL_MS
  );
}

async function refreshToolchainCapabilities() {
  toolchainCapabilities = await getToolchainCapabilities({
    duckdbPath: env.DUCKDB_PATH,
    tippecanoePath: env.TIPPECANOE_PATH,
    ogr2ogrPath: env.OGR2OGR_PATH,
  });
  console.log(
    `[worker-geodata] toolchain ${summarizeToolchainCapabilities(toolchainCapabilities)}`,
  );
}
