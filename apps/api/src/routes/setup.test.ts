import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Hono } from "hono";
import { setupRoute } from "./setup";

const app = new Hono();
app.route("/", setupRoute);

test("setup preflight reports self-host product loop fixture readiness", async () => {
  const root = await mkdtemp(join(tmpdir(), "planisfy-setup-preflight-"));
  const storage = join(root, "storage");
  const pmtiles = join(root, "stuttgart.pmtiles");

  await mkdir(join(storage, "uploads"), { recursive: true });
  await mkdir(join(storage, "styles"), { recursive: true });
  await mkdir(join(storage, "martin-sources"), { recursive: true });
  await writeFile(join(storage, "styles", "planisfy-streets-v1.json"), "{}");
  await writeFile(
    join(storage, "styles", "planisfy-streets-light-v1.json"),
    "{}",
  );
  await writeFile(
    join(storage, "styles", "planisfy-streets-dark-v1.json"),
    "{}",
  );
  await writeFile(pmtiles, "PMTiles fixture");

  const previousStorage = process.env.LOCAL_STORAGE_PATH;
  const previousPmtiles = process.env.DEMO_PMTILES_PATH;
  process.env.LOCAL_STORAGE_PATH = storage;
  process.env.DEMO_PMTILES_PATH = pmtiles;

  try {
    const response = await app.request("/setup/preflight");
    const body = (await response.json()) as {
      data?: {
        checks?: Array<{ id: string; status: string; group: string }>;
        groups?: Array<{ name: string; pass: number; fail: number }>;
      };
    };

    assert.equal(response.status, 200);
    const checks = new Map(
      body.data?.checks?.map((check) => [check.id, check]),
    );
    assert.equal(checks.get("upload-storage")?.status, "pass");
    assert.equal(checks.get("demo-style-fixtures")?.status, "pass");
    assert.equal(checks.get("martin-source-aliases")?.status, "pass");
    assert.equal(checks.get("demo-pmtiles")?.status, "pass");
    assert.equal(checks.get("demo-pmtiles")?.group, "Self-host product loop");
  } finally {
    if (previousStorage === undefined) {
      delete process.env.LOCAL_STORAGE_PATH;
    } else {
      process.env.LOCAL_STORAGE_PATH = previousStorage;
    }
    if (previousPmtiles === undefined) {
      delete process.env.DEMO_PMTILES_PATH;
    } else {
      process.env.DEMO_PMTILES_PATH = previousPmtiles;
    }
  }
});
