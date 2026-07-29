import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { checkStorageHealth, probeRedisHealth } from "./route";

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

test("Redis health probes disconnect after success", async () => {
  const calls: string[] = [];
  const result = await probeRedisHealth(0, async () => ({
    async connect() { calls.push("connect"); },
    async ping() { calls.push("ping"); },
    async get() { calls.push("get"); return "heartbeat"; },
    async quit() { calls.push("quit"); },
    disconnect() { calls.push("disconnect"); },
  }));

  assert.equal(result.check.status, "ok");
  assert.equal(result.heartbeat, "heartbeat");
  assert.deepEqual(calls, ["connect", "ping", "get", "quit", "disconnect"]);
});

test("Redis health probes disconnect when commands and graceful cleanup fail", async () => {
  const calls: string[] = [];
  const result = await probeRedisHealth(0, async () => ({
    async connect() { calls.push("connect"); },
    async ping() { calls.push("ping"); throw new Error("ping failed"); },
    async get() { calls.push("get"); return null; },
    async quit() { calls.push("quit"); throw new Error("quit failed"); },
    disconnect() { calls.push("disconnect"); },
  }));

  assert.equal(result.check.status, "error");
  assert.match(result.check.error ?? "", /ping failed/);
  assert.deepEqual(calls, ["connect", "ping", "quit", "disconnect"]);
});

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
