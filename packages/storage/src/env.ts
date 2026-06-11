import { createEnv, z } from "@planisfy/env";
import { loadWorkspaceEnv } from "@planisfy/env/node";

loadWorkspaceEnv();

const emptyableString = z.string();
const emptyableUrl = z.union([z.literal(""), z.string().url()]);

const schema = z.object({
  STORAGE_PROVIDER: z.enum(["local", "s3", "r2"]),
  LOCAL_STORAGE_PATH: z.string().min(1),
  LOCAL_STORAGE_URL: z.string().url(),
  LOCAL_STORAGE_BUCKET: z.string().min(1),
  S3_BUCKET: emptyableString,
  S3_REGION: emptyableString,
  S3_ENDPOINT: emptyableUrl,
  AWS_ACCESS_KEY_ID: emptyableString,
  AWS_SECRET_ACCESS_KEY: emptyableString,
  S3_PUBLIC_URL: emptyableUrl,
  R2_ACCOUNT_ID: emptyableString,
  R2_BUCKET: emptyableString,
  R2_ACCESS_KEY_ID: emptyableString,
  R2_SECRET_ACCESS_KEY: emptyableString,
  R2_ENDPOINT: emptyableUrl,
  R2_PUBLIC_URL: emptyableUrl,
});

export const env = createEnv(schema, process.env, { appName: "storage" });
