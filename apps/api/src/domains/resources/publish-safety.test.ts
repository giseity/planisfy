import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTilesetPublishAuditMetadata,
  classifyVersionPublish,
} from "./publish-safety";

test("classifyVersionPublish distinguishes publish, promote, rollback, and republish", () => {
  assert.equal(
    classifyVersionPublish({ targetVersionNumber: 1, isCurrentVersion: false }),
    "publish",
  );
  assert.equal(
    classifyVersionPublish({
      currentVersionNumber: 1,
      targetVersionNumber: 2,
      isCurrentVersion: false,
    }),
    "promote",
  );
  assert.equal(
    classifyVersionPublish({
      currentVersionNumber: 3,
      targetVersionNumber: 2,
      isCurrentVersion: false,
    }),
    "rollback",
  );
  assert.equal(
    classifyVersionPublish({
      currentVersionNumber: 2,
      targetVersionNumber: 2,
      isCurrentVersion: true,
    }),
    "republish",
  );
});

test("buildTilesetPublishAuditMetadata records rollback-safe context", () => {
  assert.deepEqual(
    buildTilesetPublishAuditMetadata({
      targetVersion: 2,
      previousVersion: 3,
      action: "rollback",
      tileAliasRegistration: { provider: "local", delivery: "martin" },
    }),
    {
      version: 2,
      previousVersion: 3,
      publishAction: "rollback",
      tileAliasRegistration: { provider: "local", delivery: "martin" },
    },
  );
});

test("buildTilesetPublishAuditMetadata preserves alias registration evidence", () => {
  const tileAliasRegistration = {
    provider: "r2",
    delivery: "object-storage",
    stableStorageKey: "martin-sources/acme.roads.pmtiles",
    versionedStorageKey: "martin-sources/acme.roads.v4.pmtiles",
  };

  assert.deepEqual(
    buildTilesetPublishAuditMetadata({
      targetVersion: 4,
      previousVersion: 3,
      action: "promote",
      tileAliasRegistration,
    }),
    {
      version: 4,
      previousVersion: 3,
      publishAction: "promote",
      tileAliasRegistration,
    },
  );
});
