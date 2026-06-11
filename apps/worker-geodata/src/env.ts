import { loadWorkspaceEnv } from "@planisfy/env/node";
import {
  createEnv,
  portSchema,
  redisConnectionFromEnv,
  z,
} from "@planisfy/env";

loadWorkspaceEnv();

const optionalString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);

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
  DUCKDB_PATH: z.string().min(1).default("duckdb"),
  TIPPECANOE_PATH: z.string().min(1).default("tippecanoe"),
  OGR2OGR_PATH: z.string().min(1).default("ogr2ogr"),
  GEODATA_ALLOW_RAW_FALLBACK: z.preprocess(
    (value) => value === "true" || value === "1",
    z.boolean().default(false),
  ),
  OVERTURE_RELEASE: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(1).optional(),
  ),
  OVERTURE_PARQUET_URL_TEMPLATE: z
    .string()
    .min(1)
    .default(
      "s3://overturemaps-us-west-2/release/{release}/theme={theme}/type={type}/*",
    ),
  SOURCE_IMPORT_MAX_FEATURES: z.coerce
    .number()
    .int()
    .positive()
    .default(50_000),
  SOURCE_IMPORT_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(900_000),
  SOURCE_CREDENTIAL_ENCRYPTION_KEY: optionalString,
  BETTER_AUTH_SECRET: optionalString,
  INTERNAL_API_SECRET: optionalString,
});

export const env = createEnv(schema, process.env, {
  appName: "worker-geodata",
});

export const redisConnection = redisConnectionFromEnv(env);
