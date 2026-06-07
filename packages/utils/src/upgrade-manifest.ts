import { z } from "zod";

export const upgradeImageSchema = z.object({
  service: z.string().min(1),
  image: z.string().min(1),
  digest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
});

export const requiredEnvSchema = z.object({
  name: z.string().min(1),
  required: z.boolean().default(true),
  description: z.string().optional(),
});

export const upgradeReleaseManifestSchema = z.object({
  version: z.string().min(1),
  createdAt: z.string().datetime(),
  images: z.array(upgradeImageSchema).min(1),
  minimumVersion: z.string().min(1).optional(),
  migrations: z
    .object({
      database: z.array(z.string()).default([]),
      storage: z.array(z.string()).default([]),
    })
    .default({ database: [], storage: [] }),
  storageLayout: z
    .object({
      version: z.string().min(1),
      changes: z.array(z.string()).default([]),
    })
    .default({ version: "1", changes: [] }),
  workerCompatibility: z
    .object({
      minimumWorkerVersion: z.string().min(1).optional(),
      notes: z.array(z.string()).default([]),
    })
    .default({ notes: [] }),
  requiredEnv: z.array(requiredEnvSchema).default([]),
  backupRequired: z.boolean().default(true),
  rollbackSupported: z.boolean().default(false),
  notes: z.array(z.string()).default([]),
});

export type UpgradeReleaseManifest = z.infer<
  typeof upgradeReleaseManifestSchema
>;

export function parseUpgradeReleaseManifest(
  value: unknown,
): UpgradeReleaseManifest {
  return upgradeReleaseManifestSchema.parse(value);
}

export function safeParseUpgradeReleaseManifest(value: unknown) {
  return upgradeReleaseManifestSchema.safeParse(value);
}

export function missingRequiredEnv(
  manifest: UpgradeReleaseManifest,
  env: Record<string, string | undefined>,
) {
  return manifest.requiredEnv
    .filter((item) => item.required)
    .filter((item) => !env[item.name])
    .map((item) => item.name);
}

export function hasPinnedImageDigests(manifest: UpgradeReleaseManifest) {
  return manifest.images.every((image) => image.digest.startsWith("sha256:"));
}

export function canRollbackRelease(manifest: UpgradeReleaseManifest) {
  return manifest.rollbackSupported === true && manifest.backupRequired === true;
}
