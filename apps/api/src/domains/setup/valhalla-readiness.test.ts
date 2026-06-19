import assert from "node:assert/strict";
import test from "node:test";
import { probeValhallaReadiness } from "./valhalla-readiness";

test("probeValhallaReadiness requires a successful route probe", async () => {
  const calls: string[] = [];
  const result = await probeValhallaReadiness("http://valhalla:8002", {
    fetchImpl: async (url) => {
      calls.push(String(url));
      return new Response("{}", { status: 200 });
    },
  });

  assert.equal(result.status, "ok");
  assert.deepEqual(calls, [
    "http://valhalla:8002/status",
    "http://valhalla:8002/route",
  ]);
});

test("probeValhallaReadiness reports graph-like route failures as degraded", async () => {
  const result = await probeValhallaReadiness("http://valhalla:8002", {
    fetchImpl: async (url) => {
      if (String(url).endsWith("/status")) {
        return new Response("{}", { status: 200 });
      }
      return Response.json(
        { error: "No suitable edges near location" },
        { status: 400 },
      );
    },
  });

  assert.equal(result.status, "degraded");
  assert.equal(result.statusCode, 400);
  assert.match(result.message, /No suitable edges/);
});

test("probeValhallaReadiness reports unreachable Valhalla as unavailable", async () => {
  const result = await probeValhallaReadiness("http://valhalla:8002", {
    fetchImpl: async () => {
      throw new Error("connection refused");
    },
  });

  assert.equal(result.status, "unavailable");
  assert.match(result.message, /connection refused/);
});
