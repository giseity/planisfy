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
      martinRegistration: { provider: "local" },
    }),
    {
      version: 2,
      previousVersion: 3,
      publishAction: "rollback",
      martinRegistration: { provider: "local" },
    },
  );
});
