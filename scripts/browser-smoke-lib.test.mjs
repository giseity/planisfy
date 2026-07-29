import assert from "node:assert/strict";
import { createServer } from "node:http";
import { afterEach, test } from "node:test";
import {
  browserFetch,
  consoleApi,
  poll,
  waitForHttp,
  waitForJson,
} from "./browser-smoke-lib.mjs";

const servers = new Set();

afterEach(async () => {
  await Promise.all(
    [...servers].map(
      (server) =>
        new Promise((resolveClose) => {
          server.closeAllConnections();
          server.close(resolveClose);
        }),
    ),
  );
  servers.clear();
});

test("waitForHttp bounds a server that never sends headers", async () => {
  const url = await hangingServer("headers");

  await assertRejectsWithin(
    () => waitForHttp(url, "hanging headers", undefined, { timeoutMs: 150 }),
    1_000,
  );
});

test("waitForJson bounds response-body consumption", async () => {
  const url = await hangingServer("body");

  await assertRejectsWithin(
    () => waitForJson(url, "hanging JSON body", { timeoutMs: 150 }),
    1_000,
  );
});

test("browserFetch aborts a browser-evaluated hanging request", async () => {
  const url = await hangingServer("headers");

  const result = await assertResolvesWithin(
    () =>
      browserFetch(
        localPage(),
        { url, readBody: true },
        { label: "browser hanging headers", timeoutMs: 150 },
      ),
    1_000,
  );

  assert.equal(result.ok, false);
  assert.match(result.text, /browser deadline/);
});

test("consoleApi bounds browser-evaluated JSON body reads", async () => {
  const url = await hangingServer("body");
  const previousPath = process.env.PLANISFY_E2E_CONSOLE_API_PATH;
  process.env.PLANISFY_E2E_CONSOLE_API_PATH = url;

  try {
    await assertRejectsWithin(
      () => consoleApi(localPage(), "", { timeoutMs: 150 }),
      1_000,
    );
  } finally {
    if (previousPath === undefined) {
      delete process.env.PLANISFY_E2E_CONSOLE_API_PATH;
    } else {
      process.env.PLANISFY_E2E_CONSOLE_API_PATH = previousPath;
    }
  }
});

test("poll bounds a callback that never settles", async () => {
  await assertRejectsWithin(
    () =>
      poll("hanging callback", () => new Promise(() => {}), {
        timeoutMs: 150,
        intervalMs: 10,
      }),
    1_000,
  );
});

function localPage() {
  return {
    evaluate(callback, value) {
      return callback(value);
    },
  };
}

async function hangingServer(mode) {
  const server = createServer((_request, response) => {
    if (mode === "body") {
      response.writeHead(200, { "content-type": "application/json" });
      response.write('{"pending":');
    }
  });
  servers.add(server);

  await new Promise((resolveListen) => {
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return `http://127.0.0.1:${address.port}`;
}

async function assertRejectsWithin(operation, maximumMs) {
  const started = Date.now();
  await assert.rejects(operation);
  assert.ok(
    Date.now() - started < maximumMs,
    `operation exceeded ${maximumMs}ms`,
  );
}

async function assertResolvesWithin(operation, maximumMs) {
  const started = Date.now();
  const result = await operation();
  assert.ok(
    Date.now() - started < maximumMs,
    `operation exceeded ${maximumMs}ms`,
  );
  return result;
}
