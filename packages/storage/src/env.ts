import "dotenv/config";
import { join } from "path";
import { createEnv, z } from "@planisfy/env";

const optionalString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);
const optionalUrl = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().url().optional(),
);

const schema = z.object({
  STORAGE_PROVIDER: z.enum(["local", "s3", "r2"]).default("local"),
  LOCAL_STORAGE_PATH: z.string().min(1).default(join(process.cwd(), ".storage")),
  LOCAL_STORAGE_URL: z.string().url().default("https://api.planisfy.localhost/storage"),
  LOCAL_STORAGE_BUCKET: z.string().min(1).default("local"),
  S3_BUCKET: z.string().min(1).default("planisfy-uploads"),
  S3_REGION: z.string().min(1).default("auto"),
  S3_ENDPOINT: optionalUrl,
  AWS_ACCESS_KEY_ID: optionalString,
  AWS_SECRET_ACCESS_KEY: optionalString,
  S3_PUBLIC_URL: optionalUrl,
  R2_ACCOUNT_ID: optionalString,
  R2_BUCKET: optionalString,
  R2_ACCESS_KEY_ID: optionalString,
  R2_SECRET_ACCESS_KEY: optionalString,
  R2_ENDPOINT: optionalUrl,
  R2_PUBLIC_URL: optionalUrl,
});

export const env = createEnv(schema, process.env, { appName: "storage" });
