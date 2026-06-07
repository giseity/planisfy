import { mkdir, mkdtemp } from "node:fs/promises";
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

});

async function testApp(options: {
  execute?: CommandExecutor;
} = {}) {
  const rootDir = await mkdtemp(join(tmpdir(), "planisfy-supervisor-root-"));
  const stateDir = join(rootDir, "state");
  await mkdir(stateDir, { recursive: true });
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
  return { app: createSupervisorApp(config), rootDir };
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
