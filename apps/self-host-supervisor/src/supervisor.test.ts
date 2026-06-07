import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createSupervisorApp,
  type CommandExecutor,
  type SupervisorConfig,
} from "./supervisor";

const token = "test-supervisor-token";

describe("self-host supervisor", () => {
  it("keeps health public and protects supervisor endpoints", async () => {
    const { app } = await testApp();

    const health = await app.request("/health");
    assert.equal(health.status, 200);

    const version = await app.request("/version");
    assert.equal(version.status, 401);
  });

  it("runs and records backups", async () => {
    const commands: string[] = [];
    const { app } = await testApp({
      execute: async (command, args) => {
        commands.push(`${command} ${args.join(" ")}`);
        return { stdout: "backup ok", stderr: "" };
      },
    });

    const backup = await authed(app, "/backup", { method: "POST" });
    assert.equal(backup.status, 200);
    const body = (await backup.json()) as { data: { id: string; status: string } };
    assert.equal(body.data.status, "SUCCEEDED");
    assert.match(commands[0] ?? "", /self-host-backup\.sh/);

    const operation = await authed(app, `/operations/${body.data.id}`);
    assert.equal(operation.status, 200);
  });

  it("refuses upgrade apply without a successful backup", async () => {
    const { app, manifestPath } = await testApp();

    const response = await authed(app, "/upgrade/apply", {
      body: JSON.stringify({
        manifestPath,
        backupOperationId: "missing",
      }),
      method: "POST",
    });

    assert.equal(response.status, 400);
    const body = (await response.json()) as { error: { code: string } };
    assert.equal(body.error.code, "BACKUP_REQUIRED");
  });

  it("applies only pinned releases after backup", async () => {
    const commands: string[] = [];
    const { app, manifestPath } = await testApp({
      execute: async (command, args) => {
        commands.push(`${command} ${args.join(" ")}`);
        return { stdout: "ok", stderr: "" };
      },
    });
    const backup = await authed(app, "/backup", { method: "POST" });
    const backupBody = (await backup.json()) as { data: { id: string } };

    const response = await authed(app, "/upgrade/apply", {
      body: JSON.stringify({
        manifestPath,
        backupOperationId: backupBody.data.id,
      }),
      method: "POST",
    });

    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      data: { status: string; targetVersion: string; logs: string[] };
    };
    assert.equal(body.data.status, "SUCCEEDED");
    assert.equal(body.data.targetVersion, "1.2.3");
    assert.match(body.data.logs.join("\n"), /sha256:/);
    assert.ok(commands.some((command) => command.includes("docker compose")));
  });

  it("rejects latest upgrade targets", async () => {
    const { app, manifestPath } = await testApp({
      manifest: releaseManifest({ image: "ghcr.io/planisfy/api:latest" }),
    });
    const backup = await authed(app, "/backup", { method: "POST" });
    const backupBody = (await backup.json()) as { data: { id: string } };

    const response = await authed(app, "/upgrade/apply", {
      body: JSON.stringify({
        manifestPath,
        backupOperationId: backupBody.data.id,
      }),
      method: "POST",
    });

    assert.equal(response.status, 400);
    const body = (await response.json()) as { error: { code: string } };
    assert.equal(body.error.code, "UNPINNED_RELEASE");
  });
});

async function testApp(options: {
  execute?: CommandExecutor;
  manifest?: Record<string, unknown>;
} = {}) {
  const rootDir = await mkdtemp(join(tmpdir(), "planisfy-supervisor-root-"));
  const stateDir = join(rootDir, "state");
  await mkdir(stateDir, { recursive: true });
  const manifestPath = join(rootDir, "release.json");
  await writeFile(
    manifestPath,
    JSON.stringify(options.manifest ?? releaseManifest(), null, 2),
  );
  const config: SupervisorConfig = {
    appVersion: "1.2.2",
    composeFile: join(rootDir, "compose.yml"),
    envFile: join(rootDir, ".env"),
    execute:
      options.execute ??
      (async () => {
        return { stdout: "ok", stderr: "" };
      }),
    rootDir,
    stateDir,
    token,
  };
  return { app: createSupervisorApp(config), manifestPath, rootDir };
}

function authed(
  app: ReturnType<typeof createSupervisorApp>,
  path: string,
  init: RequestInit = {},
) {
  const headers = new Headers(init.headers);
  headers.set("x-supervisor-token", token);
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  return app.request(path, { ...init, headers });
}

function releaseManifest(overrides: Record<string, unknown> = {}) {
  return {
    backupRequired: true,
    createdAt: "2026-06-07T00:00:00.000Z",
    images: [
      {
        digest:
          overrides.digest ??
          "sha256:1111111111111111111111111111111111111111111111111111111111111111",
        image: overrides.image ?? "ghcr.io/planisfy/api",
        service: "api",
      },
    ],
    migrations: {
      database: ["20260607000000_release"],
      storage: [],
    },
    minimumVersion: "1.2.0",
    notes: ["Fixture release manifest"],
    requiredEnv: [{ description: "Auth secret", name: "BETTER_AUTH_SECRET" }],
    rollbackSupported: overrides.rollbackSupported ?? true,
    storageLayout: {
      changes: [],
      version: "1",
    },
    version: "1.2.3",
    workerCompatibility: {
      minimumWorkerVersion: "1.2.0",
      notes: [],
    },
    ...overrides,
  };
}
