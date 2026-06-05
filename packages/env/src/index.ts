import { z } from "zod";

export { z };

export type RuntimeEnv = Record<string, string | undefined>;

export interface CreateEnvOptions {
  appName: string;
  building?: boolean;
  onInvalid?: "exit" | "throw";
}

export type RedisConnection = {
  host: string;
  port: number;
  username?: string;
  password?: string;
};

export const nodeEnvSchema = z
  .enum(["development", "test", "production"])
  .default("development");

export const urlSchema = z.string().url();

export const portSchema = z.coerce.number().int().positive();

export function createEnv<TSchema extends z.ZodType>(
  schema: TSchema,
  runtimeEnv: RuntimeEnv,
  options: CreateEnvOptions
): z.infer<TSchema> {
  const parsed = schema.safeParse(runtimeEnv);

  if (!parsed.success) {
    if (options.building || runtimeEnv.BUILDING) {
      console.warn(`[${options.appName}] Skipping env validation during build`);
      return {} as z.infer<TSchema>;
    }

    const issues = parsed.error.issues
      .map((issue) => `  ${issue.path.join(".") || "env"}: ${issue.message}`)
      .join("\n");
    const message = `Invalid environment variables (${options.appName}):\n${issues}`;

    if (options.onInvalid === "throw") {
      throw new Error(message);
    }

    console.error(message);
    process.exit(1);
  }

  return parsed.data;
}

export function redisConnectionFromEnv(env: {
  REDIS_URL?: string;
  REDIS_HOST?: string;
  REDIS_PORT?: number | string;
}): RedisConnection {
  if (env.REDIS_URL) {
    const url = new URL(env.REDIS_URL);
    return {
      host: url.hostname,
      port: Number(url.port || 6379),
      username: url.username || undefined,
      password: url.password || undefined,
    };
  }

  return {
    host: env.REDIS_HOST || "localhost",
    port: Number(env.REDIS_PORT || 6379),
  };
}
