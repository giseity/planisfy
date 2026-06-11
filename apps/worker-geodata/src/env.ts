import { loadWorkspaceEnv } from "@planisfy/env/node";
import {
  createEnv,
  portSchema,
  redisConnectionFromEnv,
  z,
} from "@planisfy/env";

loadWorkspaceEnv();

const emptyableString = z.string();
const emptyableUrl = z.union([z.literal(""), z.string().url()]);

const schema = z.object({
  REDIS_URL: emptyableUrl,
  REDIS_HOST: z.string().min(1),
  REDIS_PORT: portSchema,
  GEODATA_WORKER_CONCURRENCY: z.coerce.number().int().positive(),
  GEODATA_WORKER_HEARTBEAT_INTERVAL_MS: z.coerce.number().int().positive(),
  GEODATA_WORKER_HEARTBEAT_TTL_MS: z.coerce.number().int().positive(),
  GEODATA_OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().positive(),
  GEODATA_OUTBOX_BATCH_SIZE: z.coerce.number().int().positive(),
  DUCKDB_PATH: z.string().min(1),
  TIPPECANOE_PATH: z.string().min(1),
  OGR2OGR_PATH: z.string().min(1),
  GEODATA_ALLOW_RAW_FALLBACK: z.preprocess(
    (value) => value === "true" || value === "1",
    z.boolean(),
  ),
  OVERTURE_RELEASE: emptyableString,
  OVERTURE_PARQUET_URL_TEMPLATE: z.string().min(1),
  SOURCE_IMPORT_MAX_FEATURES: z.coerce.number().int().positive(),
  SOURCE_IMPORT_TIMEOUT_MS: z.coerce.number().int().positive(),
  SOURCE_CREDENTIAL_ENCRYPTION_KEY: emptyableString,
  BETTER_AUTH_SECRET: z.string().min(1),
  INTERNAL_API_SECRET: z.string().min(1),
});

export const env = createEnv(schema, process.env, {
  appName: "worker-geodata",
});

export const redisConnection = redisConnectionFromEnv(env);
