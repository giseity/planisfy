import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Hono } from "hono";
import { setupRoute } from "./route";

const app = new Hono();
app.route("/", setupRoute);
const consoleApp = new Hono();
consoleApp.route("/console", setupRoute);

test("production setup preflight requires internal authorization outside console", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousInternalSecret = process.env.INTERNAL_API_SECRET;
  process.env.NODE_ENV = "production";
  process.env.INTERNAL_API_SECRET = "setup-secret";

  try {
    const response = await app.request("/setup/preflight");
    const body = (await response.json()) as {
      error?: { code?: string; message?: string };
    };

    assert.equal(response.status, 401);
    assert.equal(body.error?.code, "UNAUTHORIZED");
    assert.match(body.error?.message ?? "", /Setup preflight/);
  } finally {
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
    if (previousInternalSecret === undefined) {
      delete process.env.INTERNAL_API_SECRET;
    } else {
      process.env.INTERNAL_API_SECRET = previousInternalSecret;
    }
  }
});

test("production setup preflight remains available from the console route", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousInternalSecret = process.env.INTERNAL_API_SECRET;
  process.env.NODE_ENV = "production";
  delete process.env.INTERNAL_API_SECRET;

  try {
    const response = await withMockValhalla(async () =>
      consoleApp.request("/console/setup/preflight"),
    );

    assert.equal(response.status, 200);
  } finally {
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
    if (previousInternalSecret === undefined) {
      delete process.env.INTERNAL_API_SECRET;
    } else {
      process.env.INTERNAL_API_SECRET = previousInternalSecret;
    }
  }
});

test("setup preflight reports self-host product loop fixture readiness", async () => {
  const root = await mkdtemp(join(tmpdir(), "planisfy-setup-preflight-"));
  const storage = join(root, "storage");
  const pmtiles = join(root, "stuttgart.pmtiles");
  const manifest = join(root, "release-manifest.json");

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
  await writeFile(
    manifest,
    JSON.stringify({
      version: "1.2.0",
      createdAt: "2026-06-07T00:00:00.000Z",
      images: [
        {
          service: "api",
          image: "ghcr.io/acme/planisfy/api",
          digest:
            "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
      ],
      requiredEnv: [{ name: "BETTER_AUTH_SECRET", required: true }],
      backupRequired: true,
      rollbackSupported: true,
    }),
  );

  const previousStorage = process.env.LOCAL_STORAGE_PATH;
  const previousPmtiles = process.env.DEMO_PMTILES_PATH;
  const previousManifest = process.env.PLANISFY_RELEASE_MANIFEST;
  const previousSecret = process.env.BETTER_AUTH_SECRET;
  const previousMode = process.env.DEPLOYMENT_MODE;
  const previousProvider = process.env.STORAGE_PROVIDER;
  process.env.DEPLOYMENT_MODE = "self_host";
  process.env.STORAGE_PROVIDER = "local";
  process.env.LOCAL_STORAGE_PATH = storage;
  process.env.DEMO_PMTILES_PATH = pmtiles;
  process.env.PLANISFY_RELEASE_MANIFEST = manifest;
  process.env.BETTER_AUTH_SECRET = "test-secret";

  try {
    const response = await withMockValhalla(async () =>
      app.request("/setup/preflight"),
    );
    const body = (await response.json()) as {
      data?: {
        checks?: Array<{ id: string; status: string; group: string }>;
        deploymentMode?: string;
        capabilities?: Array<{
          id: string;
          status: string;
          required: boolean;
          visible: boolean;
        }>;
        groups?: Array<{ name: string; pass: number; fail: number }>;
      };
    };

    assert.equal(response.status, 200);
    assert.equal(body.data?.deploymentMode, "self_host");
    const checks = new Map(
      body.data?.checks?.map((check) => [check.id, check]),
    );
    const capabilities = new Map(
      body.data?.capabilities?.map((capability) => [
        capability.id,
        capability,
      ]),
    );
    assert.equal(capabilities.get("customExecutionTargets")?.visible, true);
    assert.equal(capabilities.get("localStorage")?.visible, true);
    assert.equal(checks.get("upload-storage")?.status, "pass");
    assert.equal(checks.get("demo-style-fixtures")?.status, "pass");
    assert.equal(checks.get("martin-source-aliases")?.status, "pass");
    assert.equal(checks.get("demo-pmtiles")?.status, "pass");
    assert.equal(checks.get("demo-pmtiles")?.group, "Self-host product loop");
    assert.equal(checks.get("upgrade-release-manifest")?.status, "pass");
    assert.equal(checks.get("upgrade-required-env")?.status, "pass");
    assert.equal(
      checks.get("upgrade-release-manifest")?.group,
      "Upgrade readiness",
    );
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
    if (previousManifest === undefined) {
      delete process.env.PLANISFY_RELEASE_MANIFEST;
    } else {
      process.env.PLANISFY_RELEASE_MANIFEST = previousManifest;
    }
    if (previousSecret === undefined) {
      delete process.env.BETTER_AUTH_SECRET;
    } else {
      process.env.BETTER_AUTH_SECRET = previousSecret;
    }
    if (previousMode === undefined) {
      delete process.env.DEPLOYMENT_MODE;
    } else {
      process.env.DEPLOYMENT_MODE = previousMode;
    }
    if (previousProvider === undefined) {
      delete process.env.STORAGE_PROVIDER;
    } else {
      process.env.STORAGE_PROVIDER = previousProvider;
    }
  }
});

test("setup preflight surfaces actionable self-host storage failures", async () => {
  const root = await mkdtemp(join(tmpdir(), "planisfy-setup-preflight-"));
  const storage = join(root, "storage");
  await mkdir(storage, { recursive: true });

  const previousStorage = process.env.LOCAL_STORAGE_PATH;
  const previousPmtiles = process.env.DEMO_PMTILES_PATH;
  const previousMode = process.env.DEPLOYMENT_MODE;
  const previousProvider = process.env.STORAGE_PROVIDER;
  process.env.DEPLOYMENT_MODE = "self_host";
  process.env.STORAGE_PROVIDER = "local";
  process.env.LOCAL_STORAGE_PATH = storage;
  process.env.DEMO_PMTILES_PATH = "";

  try {
    const response = await withMockValhalla(async () =>
      app.request("/setup/preflight"),
    );
    const body = (await response.json()) as {
      data?: {
        checks?: Array<{
          id: string;
          status: string;
          message: string;
          value?: string | number | boolean | null;
        }>;
        capabilities?: Array<{
          id: string;
          status: string;
          message: string;
          value?: string | number | boolean | null;
        }>;
      };
    };

    assert.equal(response.status, 200);
    const checks = new Map(
      body.data?.checks?.map((check) => [check.id, check]),
    );
    const capabilities = new Map(
      body.data?.capabilities?.map((capability) => [
        capability.id,
        capability,
      ]),
    );

    assert.equal(checks.get("storage")?.status, "pass");
    assert.equal(checks.get("upload-storage")?.status, "fail");
    assert.equal(
      checks.get("demo-pmtiles")?.message,
      "Default PMTiles fixture path is not configured.",
    );
    assert.equal(checks.get("demo-pmtiles")?.value, null);

    assert.equal(capabilities.get("localStorage")?.status, "unavailable");
    assert.match(
      capabilities.get("localStorage")?.message ?? "",
      /^Upload artifact storage is missing\./,
    );
    assert.equal(
      capabilities.get("localStorage")?.value,
      join(storage, "uploads"),
    );
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
    if (previousMode === undefined) {
      delete process.env.DEPLOYMENT_MODE;
    } else {
      process.env.DEPLOYMENT_MODE = previousMode;
    }
    if (previousProvider === undefined) {
      delete process.env.STORAGE_PROVIDER;
    } else {
      process.env.STORAGE_PROVIDER = previousProvider;
    }
  }
});

test("setup preflight reports blocking managed readiness without R2, Dodo, or Resend", async () => {
  const previousMode = process.env.DEPLOYMENT_MODE;
  const previousProvider = process.env.STORAGE_PROVIDER;
  process.env.DEPLOYMENT_MODE = "managed";
  process.env.STORAGE_PROVIDER = "local";

  try {
    const response = await withMockValhalla(async () =>
      app.request("/setup/preflight"),
    );
    const body = (await response.json()) as {
      data?: {
        deploymentMode?: string;
        summary?: { blocking: number };
        checks?: Array<{ id: string; status: string; severity: string }>;
        capabilities?: Array<{
          id: string;
          status: string;
          required: boolean;
          visible: boolean;
        }>;
      };
    };

    assert.equal(response.status, 200);
    assert.equal(body.data?.deploymentMode, "managed");
    assert.ok((body.data?.summary?.blocking ?? 0) >= 3);

    const checks = new Map(
      body.data?.checks?.map((check) => [check.id, check]),
    );
    assert.equal(checks.get("storage")?.status, "fail");
    assert.equal(checks.get("email")?.severity, "required");
    assert.equal(checks.get("billing")?.severity, "required");

    const capabilities = new Map(
      body.data?.capabilities?.map((capability) => [
        capability.id,
        capability,
      ]),
    );
    assert.equal(capabilities.get("managedStorage")?.required, true);
    assert.equal(capabilities.get("managedStorage")?.status, "unavailable");
    assert.equal(capabilities.get("billing")?.status, "unavailable");
    assert.equal(capabilities.get("transactionalEmail")?.status, "unavailable");
    assert.equal(capabilities.get("customExecutionTargets")?.visible, false);
    assert.equal(capabilities.get("selfHostSupervisor")?.visible, false);
  } finally {
    if (previousMode === undefined) {
      delete process.env.DEPLOYMENT_MODE;
    } else {
      process.env.DEPLOYMENT_MODE = previousMode;
    }
    if (previousProvider === undefined) {
      delete process.env.STORAGE_PROVIDER;
    } else {
      process.env.STORAGE_PROVIDER = previousProvider;
    }
  }
});

test("setup preflight warns when Valhalla cannot answer the route probe", async () => {
  const response = await withMockValhalla(
    async () => app.request("/setup/preflight"),
    { routeOk: false },
  );
  const body = (await response.json()) as {
    data?: {
      checks?: Array<{
        id: string;
        status: string;
        severity: string;
        message: string;
      }>;
    };
  };
  const checks = new Map(body.data?.checks?.map((check) => [check.id, check]));

  assert.equal(response.status, 200);
  assert.equal(checks.get("valhalla")?.status, "warn");
  assert.equal(checks.get("valhalla")?.severity, "recommended");
  assert.match(checks.get("valhalla")?.message ?? "", /No suitable edges/);
});

async function withMockValhalla<T>(
  fn: () => Promise<T>,
  options: { routeOk?: boolean } = {},
) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    if (url.endsWith("/status")) {
      return new Response("{}", { status: 200 });
    }
    if (url.endsWith("/route")) {
      return options.routeOk === false
        ? Response.json(
            { error: "No suitable edges near location" },
            { status: 400 },
          )
        : new Response("{}", { status: 200 });
    }
    return originalFetch(input, init);
  }) as typeof fetch;
  try {
    return await fn();
  } finally {
    globalThis.fetch = originalFetch;
  }
}
