import assert from "node:assert/strict";
import test from "node:test";
import {
  canRollbackRelease,
  hasPinnedImageDigests,
  missingRequiredEnv,
  parseUpgradeReleaseManifest,
  safeParseUpgradeReleaseManifest,
} from "@planisfy/utils/upgrade-manifest";

const VALID_MANIFEST = {
  version: "1.2.0",
  createdAt: "2026-06-07T00:00:00.000Z",
  minimumVersion: "1.1.0",
  images: [
    {
      service: "api",
      image: "ghcr.io/acme/planisfy/api",
      digest:
        "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    },
  ],
  migrations: { database: ["0005_upgrade.sql"], storage: [] },
  storageLayout: { version: "1", changes: [] },
  workerCompatibility: { minimumWorkerVersion: "1.2.0", notes: [] },
  requiredEnv: [{ name: "BETTER_AUTH_SECRET", required: true }],
  backupRequired: true,
  rollbackSupported: true,
  notes: ["Pinned release fixture."],
};

test("parseUpgradeReleaseManifest accepts pinned release manifests", () => {
  const manifest = parseUpgradeReleaseManifest(VALID_MANIFEST);

  assert.equal(manifest.version, "1.2.0");
  assert.equal(hasPinnedImageDigests(manifest), true);
  assert.equal(canRollbackRelease(manifest), true);
});

test("safeParseUpgradeReleaseManifest rejects unpinned images", () => {
  const result = safeParseUpgradeReleaseManifest({
    ...VALID_MANIFEST,
    images: [{ service: "api", image: "ghcr.io/acme/api:latest" }],
  });

  assert.equal(result.success, false);
  if (!result.success) {
    assert.match(result.error.message, /digest/);
  }
});

test("missingRequiredEnv reports only required absent variables", () => {
  const manifest = parseUpgradeReleaseManifest({
    ...VALID_MANIFEST,
    requiredEnv: [
      { name: "BETTER_AUTH_SECRET", required: true },
      { name: "OPTIONAL_PROVIDER", required: false },
    ],
  });

  assert.deepEqual(missingRequiredEnv(manifest, {}), ["BETTER_AUTH_SECRET"]);
  assert.deepEqual(
    missingRequiredEnv(manifest, { BETTER_AUTH_SECRET: "configured" }),
    [],
  );
});
