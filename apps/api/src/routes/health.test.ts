import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { checkStorageHealth } from "./health";

test("storage health reports reachable local storage", async () => {
  const previousProvider = process.env.STORAGE_PROVIDER;
  const previousPath = process.env.LOCAL_STORAGE_PATH;
  const previousBucket = process.env.LOCAL_STORAGE_BUCKET;
  const root = await mkdtemp(join(tmpdir(), "planisfy-storage-health-"));

  try {
    process.env.STORAGE_PROVIDER = "local";
    process.env.LOCAL_STORAGE_PATH = root;
    process.env.LOCAL_STORAGE_BUCKET = "local-fixture";

    const health = await checkStorageHealth();

    assert.equal(health.status, "ok");
    assert.equal(health.provider, "local");
    assert.equal(health.bucket, "local-fixture");
    assert.equal(health.path, root);
  } finally {
    restoreEnv("STORAGE_PROVIDER", previousProvider);
    restoreEnv("LOCAL_STORAGE_PATH", previousPath);
    restoreEnv("LOCAL_STORAGE_BUCKET", previousBucket);
    await rm(root, { recursive: true, force: true });
  }
});

test("storage health reports degraded remote storage without network calls", async () => {
  const previousProvider = process.env.STORAGE_PROVIDER;
  const previousBucket = process.env.R2_BUCKET;
  const previousEndpoint = process.env.R2_ENDPOINT;
  const previousAccount = process.env.R2_ACCOUNT_ID;
  const previousAccessKey = process.env.R2_ACCESS_KEY_ID;
  const previousSecret = process.env.R2_SECRET_ACCESS_KEY;

  try {
    process.env.STORAGE_PROVIDER = "r2";
    delete process.env.R2_BUCKET;
    delete process.env.R2_ENDPOINT;
    delete process.env.R2_ACCOUNT_ID;
    delete process.env.R2_ACCESS_KEY_ID;
    delete process.env.R2_SECRET_ACCESS_KEY;

    const health = await checkStorageHealth();

    assert.equal(health.status, "degraded");
    assert.equal(health.provider, "r2");
    assert.match(health.error ?? "", /not fully configured/);
  } finally {
    restoreEnv("STORAGE_PROVIDER", previousProvider);
    restoreEnv("R2_BUCKET", previousBucket);
    restoreEnv("R2_ENDPOINT", previousEndpoint);
    restoreEnv("R2_ACCOUNT_ID", previousAccount);
    restoreEnv("R2_ACCESS_KEY_ID", previousAccessKey);
    restoreEnv("R2_SECRET_ACCESS_KEY", previousSecret);
  }
});

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
