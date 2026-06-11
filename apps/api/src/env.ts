import { loadWorkspaceEnv } from "@planisfy/env/node";
import {
  createEnv,
  nodeEnvSchema,
  portSchema,
  redisConnectionFromEnv,
  z,
} from "@planisfy/env";

loadWorkspaceEnv();

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
  DEPLOYMENT_MODE: z.enum(["self_host", "managed"]).default("self_host"),

  REDIS_URL: optionalUrl,
  REDIS_HOST: z.string().min(1).default("localhost"),
  REDIS_PORT: portSchema.default(6379),

  INTERNAL_API_URL: z.string().url().default("https://api.planisfy.localhost"),
  INTERNAL_API_SECRET: optionalString,
  BETTER_AUTH_SECRET: optionalString,
  CONSOLE_URL: z.string().url().default("https://console.planisfy.localhost"),

  MARTIN_URL: z.string().url().default("http://localhost:3005"),
  VALHALLA_URL: z.string().url().default("http://localhost:3007"),
  PELIAS_URL: z
    .string()
    .url()
    .default("https://api.planisfy.localhost/geocoding"),
  GLYPHS_URL: z.string().url().default("https://demotiles.maplibre.org/font"),
  STATIC_MAP_URL: optionalUrl,
  ELEVATION_URL: z
    .string()
    .url()
    .default("https://api.open-elevation.com/api/v1"),

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
  OVERTURE_RELEASE: optionalString,
  DEMO_PMTILES_PATH: optionalString,
  STORAGE_PROVIDER: z.enum(["local", "s3", "r2"]).default("local"),
  LOCAL_STORAGE_PATH: optionalString,
  S3_BUCKET: optionalString,
  S3_REGION: optionalString,
  S3_ENDPOINT: optionalUrl,
  S3_PUBLIC_URL: optionalUrl,
  AWS_ACCESS_KEY_ID: optionalString,
  AWS_SECRET_ACCESS_KEY: optionalString,
  R2_ACCOUNT_ID: optionalString,
  R2_BUCKET: optionalString,
  R2_ENDPOINT: optionalUrl,
  R2_PUBLIC_URL: optionalUrl,
  R2_ACCESS_KEY_ID: optionalString,
  R2_SECRET_ACCESS_KEY: optionalString,
});

export const env = createEnv(schema, process.env, { appName: "api" });

assertManagedProductionEnv(env);

export const redisConnection = redisConnectionFromEnv(env);

function assertManagedProductionEnv(value: typeof env) {
  if (value.NODE_ENV !== "production" || value.DEPLOYMENT_MODE !== "managed") {
    return;
  }

  const missing = managedProductionEnvIssues(value);
  if (missing.length > 0) {
    throw new Error(
      `Managed production requires complete platform configuration: ${missing.join(", ")}`,
    );
  }
}

function managedProductionEnvIssues(value: typeof env): string[] {
  const issues: string[] = [];

  if (!value.DODO_PAYMENTS_API_KEY) issues.push("DODO_PAYMENTS_API_KEY");
  if (!value.DODO_PAYMENTS_WEBHOOK_SECRET) {
    issues.push("DODO_PAYMENTS_WEBHOOK_SECRET");
  }
  if (!value.DODO_PRO_PRODUCT_ID) issues.push("DODO_PRO_PRODUCT_ID");
  if (!value.RESEND_API_KEY) issues.push("RESEND_API_KEY");
  if (!value.BETTER_AUTH_SECRET || isPlaceholderSecret(value.BETTER_AUTH_SECRET)) {
    issues.push("BETTER_AUTH_SECRET");
  }
  if (
    !value.INTERNAL_API_SECRET ||
    isPlaceholderSecret(value.INTERNAL_API_SECRET)
  ) {
    issues.push("INTERNAL_API_SECRET");
  }
  if (value.STORAGE_PROVIDER !== "r2") issues.push("STORAGE_PROVIDER=r2");
  if (!value.R2_BUCKET && !value.S3_BUCKET) issues.push("R2_BUCKET");
  if (!value.R2_ENDPOINT && !value.R2_ACCOUNT_ID) {
    issues.push("R2_ENDPOINT or R2_ACCOUNT_ID");
  }
  if (!value.R2_ACCESS_KEY_ID && !value.AWS_ACCESS_KEY_ID) {
    issues.push("R2_ACCESS_KEY_ID");
  }
  if (!value.R2_SECRET_ACCESS_KEY && !value.AWS_SECRET_ACCESS_KEY) {
    issues.push("R2_SECRET_ACCESS_KEY");
  }
  if (!value.R2_PUBLIC_URL && !value.S3_PUBLIC_URL) issues.push("R2_PUBLIC_URL");

  return issues;
}

function isPlaceholderSecret(value: string) {
  return /generate-a-random|change-this|changeme|secret-here/i.test(value);
}
