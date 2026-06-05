import "dotenv/config";
import { join } from "path";
import { createEnv, z } from "@planisfy/env";

const schema = z.object({
  STORAGE_PROVIDER: z.enum(["local", "s3", "r2"]).default("local"),
  LOCAL_STORAGE_PATH: z.string().min(1).default(join(process.cwd(), ".storage")),
  LOCAL_STORAGE_URL: z.string().url().default("http://localhost:4000/storage"),
  LOCAL_STORAGE_BUCKET: z.string().min(1).default("local"),
  S3_BUCKET: z.string().min(1).default("planisfy-uploads"),
  S3_REGION: z.string().min(1).default("auto"),
  S3_ENDPOINT: z.string().url().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  S3_PUBLIC_URL: z.string().url().optional(),
});

export const env = createEnv(schema, process.env, { appName: "storage" });
