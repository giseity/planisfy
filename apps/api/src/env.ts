import "dotenv/config";
import {
  createEnv,
  nodeEnvSchema,
  portSchema,
  redisConnectionFromEnv,
  z,
} from "@planisfy/env";

const schema = z.object({
  NODE_ENV: nodeEnvSchema,
  PORT: portSchema.default(4000),
  APP_VERSION: z.string().min(1).default("dev"),

  REDIS_URL: z.string().url().optional(),
  REDIS_HOST: z.string().min(1).default("localhost"),
  REDIS_PORT: portSchema.default(6379),

  INTERNAL_API_URL: z.string().url().default("http://localhost:4000"),
  INTERNAL_API_SECRET: z.string().min(1).optional(),
  CONSOLE_URL: z.string().url().default("http://localhost:3001"),

  MARTIN_URL: z.string().url().default("http://localhost:3005"),
  VALHALLA_URL: z.string().url().default("http://localhost:3007"),
  PELIAS_URL: z.string().url().default("http://localhost:4000/geocoding"),
  GLYPHS_URL: z.string().url().default("https://demotiles.maplibre.org/font"),
  STATIC_MAP_URL: z.string().url().optional(),
  ELEVATION_URL: z.string().url().default("https://api.open-elevation.com/api/v1"),

  RESEND_API_KEY: z.string().min(1).optional(),
  FROM_EMAIL: z.string().min(1).default("Planisfy <noreply@planisfy.com>"),
  POLAR_ACCESS_TOKEN: z.string().min(1).optional(),
});

export const env = createEnv(schema, process.env, { appName: "api" });

export const redisConnection = redisConnectionFromEnv(env);
