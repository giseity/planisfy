import "dotenv/config";
import {
  createEnv,
  nodeEnvSchema,
  portSchema,
  redisConnectionFromEnv,
  z,
} from "@planisfy/env";

const optionalString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);
const optionalUrl = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().url().optional(),
);

const schema = z.object({
  NODE_ENV: nodeEnvSchema,
  PORT: portSchema.default(4000),
  APP_VERSION: z.string().min(1).default("dev"),

  REDIS_URL: optionalUrl,
  REDIS_HOST: z.string().min(1).default("localhost"),
  REDIS_PORT: portSchema.default(6379),

  INTERNAL_API_URL: z.string().url().default("https://api.planisfy.localhost"),
  INTERNAL_API_SECRET: optionalString,
  BETTER_AUTH_SECRET: optionalString,
  CONSOLE_URL: z.string().url().default("https://console.planisfy.localhost"),

  MARTIN_URL: z.string().url().default("http://localhost:3005"),
  VALHALLA_URL: z.string().url().default("http://localhost:3007"),
  PELIAS_URL: z.string().url().default("https://api.planisfy.localhost/geocoding"),
  GLYPHS_URL: z.string().url().default("https://demotiles.maplibre.org/font"),
  STATIC_MAP_URL: optionalUrl,
  ELEVATION_URL: z.string().url().default("https://api.open-elevation.com/api/v1"),

  RESEND_API_KEY: optionalString,
  FROM_EMAIL: z.string().min(1).default("Planisfy <noreply@planisfy.com>"),
  DODO_PAYMENTS_API_KEY: optionalString,
  DODO_PAYMENTS_API_URL: optionalUrl,
  DODO_PAYMENTS_ENVIRONMENT: z
    .enum(["test_mode", "live_mode"])
    .default("test_mode"),
  DODO_PAYMENTS_WEBHOOK_SECRET: optionalString,
  DODO_PRO_PRODUCT_ID: optionalString,
  DODO_ENTERPRISE_PRODUCT_ID: optionalString,
  SOURCE_CREDENTIAL_ENCRYPTION_KEY: optionalString,
  ALLOW_PRIVATE_SOURCE_URLS: z
    .preprocess((value) => value === "true" || value === true, z.boolean())
    .default(false),
  OVERTURE_ALLOW_EXPERIMENTAL_TYPES: z
    .preprocess((value) => value === "true" || value === true, z.boolean())
    .default(false),
});

export const env = createEnv(schema, process.env, { appName: "api" });

export const redisConnection = redisConnectionFromEnv(env);
