import test from "node:test";
import assert from "node:assert/strict";
import { createRuntimeSupervisorApp, type CommandExecutor } from "./supervisor";

const token = "test-runtime-supervisor-token";

test("keeps liveness public and protects runtime routes", async () => {
  const app = createRuntimeSupervisorApp({
    token,
    appVersion: "test",
    driver: "compose",
    composeFile: "/tmp/docker-compose.yml",
    composeCwd: "/tmp",
    services: testServices(),
    execute: async () => ({ stdout: "", stderr: "" }),
  });

  assert.equal((await app.request("/health")).status, 200);
  assert.equal((await app.request("/services")).status, 401);
  assert.equal(
    (await app.request("/services", { headers: authHeaders() })).status,
    200,
  );
});

test("restarts allowlisted compose services only", async () => {
  const calls: Array<{ command: string; args: string[] }> = [];
  const execute: CommandExecutor = async (command, args) => {
    calls.push({ command, args });
    return { stdout: "", stderr: "" };
  };
  const app = createRuntimeSupervisorApp({
    token,
    appVersion: "test",
    driver: "compose",
    composeFile: "/tmp/docker-compose.yml",
    composeCwd: "/tmp",
    services: testServices(),
    execute,
  });

  assert.equal(
    (
      await app.request("/services/martin/restart", {
        method: "POST",
        headers: authHeaders(),
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await app.request("/services/postgres/restart", {
        method: "POST",
        headers: authHeaders(),
      })
    ).status,
    404,
  );
  assert.deepEqual(calls[0], {
    command: "docker",
    args: ["compose", "-f", "/tmp/docker-compose.yml", "restart", "martin"],
  });
});

function authHeaders() {
  return { authorization: `Bearer ${token}` };
}

function testServices() {
  return {
    martin: {
      composeService: "martin",
      systemdUnit: "planisfy-martin.service",
    },
    valhalla: {
      composeService: "valhalla",
      systemdUnit: "planisfy-valhalla.service",
    },
    elevation: {
      composeService: "elevation",
      systemdUnit: "planisfy-elevation.service",
    },
  };
}
