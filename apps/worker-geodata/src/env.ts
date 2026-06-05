import "dotenv/config";
import {
  createEnv,
  portSchema,
  redisConnectionFromEnv,
  z,
} from "@planisfy/env";

const schema = z.object({
  REDIS_URL: z.string().url().optional(),
  REDIS_HOST: z.string().min(1).default("localhost"),
  REDIS_PORT: portSchema.default(6379),
  GEODATA_WORKER_CONCURRENCY: z.coerce.number().int().positive().default(2),
  GEODATA_WORKER_HEARTBEAT_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(10_000),
  GEODATA_WORKER_HEARTBEAT_TTL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(45_000),
  GEODATA_OUTBOX_POLL_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(5_000),
  GEODATA_OUTBOX_BATCH_SIZE: z.coerce.number().int().positive().default(10),
});

export const env = createEnv(schema, process.env, {
  appName: "worker-geodata",
});

export const redisConnection = redisConnectionFromEnv(env);
