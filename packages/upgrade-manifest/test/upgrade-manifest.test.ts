import { describe, expect, it } from "vitest";
import {
  canRollbackRelease,
  hasPinnedImageDigests,
  manifestServiceCoverage,
  missingRequiredEnv,
  parseUpgradeReleaseManifest,
  safeParseUpgradeReleaseManifest,
} from "../src";

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

describe("upgrade manifest", () => {
  it("accepts pinned release manifests", () => {
    const manifest = parseUpgradeReleaseManifest(VALID_MANIFEST);

    expect(manifest.version).toBe("1.2.0");
    expect(hasPinnedImageDigests(manifest)).toBe(true);
    expect(canRollbackRelease(manifest)).toBe(true);
  });

  it("rejects unpinned images", () => {
    const result = safeParseUpgradeReleaseManifest({
      ...VALID_MANIFEST,
      images: [{ service: "api", image: "ghcr.io/acme/api:latest" }],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toMatch(/digest/);
    }
  });

  it("rejects tagged repositories and duplicate Compose services", () => {
    expect(
      safeParseUpgradeReleaseManifest({
        ...VALID_MANIFEST,
        images: [
          {
            ...VALID_MANIFEST.images[0],
            image: "ghcr.io/acme/planisfy/api:latest",
          },
        ],
      }).success,
    ).toBe(false);

    const duplicate = safeParseUpgradeReleaseManifest({
      ...VALID_MANIFEST,
      images: [VALID_MANIFEST.images[0], VALID_MANIFEST.images[0]],
    });
    expect(duplicate.success).toBe(false);
    if (!duplicate.success) {
      expect(duplicate.error.message).toMatch(/Duplicate Compose service/);
    }
  });

  it("reports exact Compose service coverage", () => {
    const manifest = parseUpgradeReleaseManifest(VALID_MANIFEST);
    expect(manifestServiceCoverage(manifest, ["api", "console"])).toEqual({
      missing: ["console"],
      unexpected: [],
    });
    expect(manifestServiceCoverage(manifest, ["console"])).toEqual({
      missing: ["console"],
      unexpected: ["api"],
    });
  });

  it("reports only required absent variables", () => {
    const manifest = parseUpgradeReleaseManifest({
      ...VALID_MANIFEST,
      requiredEnv: [
        { name: "BETTER_AUTH_SECRET", required: true },
        { name: "OPTIONAL_PROVIDER", required: false },
      ],
    });

    expect(missingRequiredEnv(manifest, {})).toEqual(["BETTER_AUTH_SECRET"]);
    expect(
      missingRequiredEnv(manifest, { BETTER_AUTH_SECRET: "configured" }),
    ).toEqual([]);
  });
});
