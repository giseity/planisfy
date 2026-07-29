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
const apiDigest =
  "sha256:1111111111111111111111111111111111111111111111111111111111111111";
const apiImage = `ghcr.io/planisfy/api@${apiDigest}`;

function successfulCommandResult(args: string[]) {
  if (args.includes("--images")) return { stdout: `${apiImage}\n`, stderr: "" };
  if (args.includes("--services")) return { stdout: "api\n", stderr: "" };
  return { stdout: "ok", stderr: "" };
}

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

    const operations = await authed(app, "/operations");
    const listBody = (await operations.json()) as { data: Array<{ id: string }> };
    assert.equal(listBody.data[0]?.id, body.data.id);
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
        return successfulCommandResult(args);
      },
      composeProfiles: ["production"],
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
    assert.ok(commands.some((command) => command.includes("--profile production")));
    assert.ok(
      commands.some((command) =>
        command.includes("docker compose --env-file") &&
        command.includes(".release.yml pull"),
      ),
    );
    assert.ok(
      commands.some((command) =>
        command.includes("docker compose --env-file") &&
        command.includes(".release.yml up -d"),
      ),
    );
  });

  it("redacts supervisor command output and keeps compose preflight quiet", async () => {
    const { app } = await testApp({
      execute: async (_command, args) => {
        if (args.includes("config")) {
          assert.ok(args.includes("--quiet"));
        }
        return {
          stdout:
            "BETTER_AUTH_SECRET=super-secret DATABASE_URL=postgresql://user:pass@postgres:5432/db",
          stderr: "INTERNAL_API_SECRET=internal-secret",
        };
      },
    });

    const response = await authed(app, "/preflight", { method: "POST" });
    assert.equal(response.status, 200);
    const body = (await response.json()) as { data: { logs: string[] } };
    const logs = body.data.logs.join("\n");
    assert.doesNotMatch(logs, /super-secret|internal-secret|user:pass/);
    assert.match(logs, /BETTER_AUTH_SECRET=\[REDACTED\]/);
    assert.match(logs, /DATABASE_URL=\[REDACTED\]/);
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
    assert.equal(body.error.code, "INVALID_MANIFEST");
  });

  it("rejects partial and unexpected release manifests before apply mutation", async () => {
    const commands: string[] = [];
    const { app, manifestPath } = await testApp({
      execute: async (command, args) => {
        commands.push(`${command} ${args.join(" ")}`);
        if (args.includes("config") && args.includes("--services")) {
          return { stdout: "api\nconsole\n", stderr: "" };
        }
        if (args.includes("ps") && args.includes("--services")) {
          return { stdout: "api\n", stderr: "" };
        }
        return successfulCommandResult(args);
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

    assert.equal(response.status, 400);
    const body = (await response.json()) as {
      error: { code: string; details: { missingServices: string[] } };
    };
    assert.equal(body.error.code, "INCOMPLETE_RELEASE_MANIFEST");
    assert.deepEqual(body.error.details.missingServices, ["console"]);
    assert.equal(commands.some((command) => /\.release\.yml (?:pull|up)/.test(command)), false);
    assert.equal(commands.some((command) => command.includes("db:migrate")), false);

    const unexpectedManifest = releaseManifest({
      images: [
        releaseManifest().images[0],
        {
          service: "console",
          image: "ghcr.io/planisfy/console",
          digest:
            "sha256:2222222222222222222222222222222222222222222222222222222222222222",
        },
      ],
    });
    const unexpected = await testApp({ manifest: unexpectedManifest });
    const unexpectedBackup = await authed(unexpected.app, "/backup", { method: "POST" });
    const unexpectedBackupBody = (await unexpectedBackup.json()) as {
      data: { id: string };
    };
    const unexpectedResponse = await authed(unexpected.app, "/upgrade/apply", {
      body: JSON.stringify({
        manifestPath: unexpected.manifestPath,
        backupOperationId: unexpectedBackupBody.data.id,
      }),
      method: "POST",
    });
    assert.equal(unexpectedResponse.status, 400);
    const unexpectedBody = (await unexpectedResponse.json()) as {
      error: { details: { unexpectedServices: string[] } };
    };
    assert.deepEqual(unexpectedBody.error.details.unexpectedServices, ["console"]);
  });

  it("rejects duplicate services and running services outside selected profiles", async () => {
    const duplicate = releaseManifest({
      images: [releaseManifest().images[0], releaseManifest().images[0]],
    });
    const duplicateApp = await testApp({ manifest: duplicate });
    const duplicateBackup = await authed(duplicateApp.app, "/backup", { method: "POST" });
    const duplicateBackupBody = (await duplicateBackup.json()) as { data: { id: string } };
    const duplicateResponse = await authed(duplicateApp.app, "/upgrade/apply", {
      body: JSON.stringify({
        manifestPath: duplicateApp.manifestPath,
        backupOperationId: duplicateBackupBody.data.id,
      }),
      method: "POST",
    });
    assert.equal(duplicateResponse.status, 400);
    const duplicateBody = (await duplicateResponse.json()) as { error: { code: string } };
    assert.equal(duplicateBody.error.code, "INVALID_MANIFEST");

    const runningApp = await testApp({
      execute: async (_command, args) => {
        if (args.includes("config") && args.includes("--services")) {
          return { stdout: "api\n", stderr: "" };
        }
        if (args.includes("ps") && args.includes("--services")) {
          return { stdout: "api\nconsole\n", stderr: "" };
        }
        return successfulCommandResult(args);
      },
    });
    const runningBackup = await authed(runningApp.app, "/backup", { method: "POST" });
    const runningBackupBody = (await runningBackup.json()) as { data: { id: string } };
    const runningResponse = await authed(runningApp.app, "/upgrade/apply", {
      body: JSON.stringify({
        manifestPath: runningApp.manifestPath,
        backupOperationId: runningBackupBody.data.id,
      }),
      method: "POST",
    });
    assert.equal(runningResponse.status, 400);
    const runningBody = (await runningResponse.json()) as {
      error: { details: { runningOutsideTarget: string[] } };
    };
    assert.deepEqual(runningBody.error.details.runningOutsideTarget, ["console"]);
  });

  it("fails closed when merged Compose images differ from reviewed digests", async () => {
    const commands: string[] = [];
    const { app, manifestPath } = await testApp({
      execute: async (command, args) => {
        commands.push(`${command} ${args.join(" ")}`);
        if (args.includes("--images")) {
          return { stdout: "ghcr.io/planisfy/api:latest\n", stderr: "" };
        }
        return successfulCommandResult(args);
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

    assert.equal(response.status, 500);
    const body = (await response.json()) as { data: { status: string } };
    assert.equal(body.data.status, "FAILED");
    assert.equal(commands.some((command) => command.endsWith(" pull")), false);
    assert.equal(commands.some((command) => command.includes("db:migrate")), false);
    assert.equal(commands.some((command) => command.endsWith(" up -d")), false);
  });

  it("guards rollback eligibility", async () => {
    const { app, manifestPath } = await testApp({
      manifest: releaseManifest({ rollbackSupported: false }),
    });

    const response = await authed(app, "/upgrade/rollback", {
      body: JSON.stringify({
        manifestPath,
        backupDir: "/backups/example",
      }),
      method: "POST",
    });

    assert.equal(response.status, 400);
    const body = (await response.json()) as { error: { code: string } };
    assert.equal(body.error.code, "ROLLBACK_UNSUPPORTED");
  });

  it("rejects incomplete rollback manifests before restore", async () => {
    const commands: string[] = [];
    const { app, manifestPath } = await testApp({
      execute: async (command, args) => {
        commands.push(`${command} ${args.join(" ")}`);
        if (args.includes("config") && args.includes("--services")) {
          return { stdout: "api\nconsole\n", stderr: "" };
        }
        return successfulCommandResult(args);
      },
    });
    const response = await authed(app, "/upgrade/rollback", {
      body: JSON.stringify({ manifestPath, backupDir: "/backups/example" }),
      method: "POST",
    });
    assert.equal(response.status, 400);
    assert.equal(commands.some((command) => command.includes("self-host-restore.sh")), false);
  });

  it("runs guarded rollback operations", async () => {
    const commands: string[] = [];
    const { app, manifestPath } = await testApp({
      execute: async (command, args) => {
        commands.push(`${command} ${args.join(" ")}`);
        return successfulCommandResult(args);
      },
    });

    const response = await authed(app, "/upgrade/rollback", {
      body: JSON.stringify({
        manifestPath,
        backupDir: "/backups/example",
      }),
      method: "POST",
    });

    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      data: { backupDir: string; status: string; targetVersion: string };
    };
    assert.equal(body.data.status, "SUCCEEDED");
    assert.equal(body.data.backupDir, "/backups/example");
    assert.equal(body.data.targetVersion, "1.2.3");
    assert.ok(
      commands.some((command) => command.includes("self-host-restore.sh")),
    );
    const pull = commands.findIndex(
      (command) => command.includes(".release.yml pull"),
    );
    const restore = commands.findIndex((command) =>
      command.includes("self-host-restore.sh"),
    );
    const up = commands.findIndex(
      (command) => command.includes(".release.yml up -d"),
    );
    assert.ok(pull >= 0 && pull < restore && restore < up);
    assert.ok(commands.some((command) => command.includes("/health/detailed")));
  });
});

async function testApp(options: {
  composeProfiles?: string[];
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
    composeProfiles: options.composeProfiles,
    execute:
      options.execute ??
      (async (_command, args) => successfulCommandResult(args)),
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
          apiDigest,
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
