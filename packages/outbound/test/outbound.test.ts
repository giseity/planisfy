import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import {
  OutboundRequestError,
  readResponseBody,
  resolveOutboundTarget,
  withOutboundResponse,
} from "../src/index";

const privateLookup = async () => [{ address: "127.0.0.1", family: 4 }] as const;

test("rejects literal and DNS-resolved private and reserved addresses", async () => {
  for (const url of [
    "http://127.1/",
    "http://10.0.0.1/",
    "http://169.254.169.254/latest",
    "http://[::1]/",
    "http://[fe9f::1]/",
    "http://[::ffff:127.0.0.1]/",
  ]) {
    await assert.rejects(resolveOutboundTarget(url), OutboundRequestError);
  }
  await assert.rejects(
    resolveOutboundTarget("https://public.example/", {
      lookup: privateLookup,
    }),
    (error: unknown) =>
      error instanceof OutboundRequestError &&
      error.code === "PRIVATE_ADDRESS",
  );
});

test("permits only explicitly allowlisted private hosts and CIDRs", async () => {
  assert.equal(
    (
      await resolveOutboundTarget("https://worker.internal/health", {
        lookup: privateLookup,
        privateAllowlist: "worker.internal",
      })
    ).addresses[0]?.address,
    "127.0.0.1",
  );
  await resolveOutboundTarget("http://10.2.3.4/", {
    privateAllowlist: "10.0.0.0/8",
  });
  await assert.rejects(
    resolveOutboundTarget("http://192.168.1.2/", {
      privateAllowlist: "10.0.0.0/8",
    }),
  );
});

test("pins validated DNS answers and revalidates redirects", async () => {
  const server = createServer((request, response) => {
    if (request.url === "/redirect") {
      response.writeHead(302, { location: "http://private.invalid/secret" });
      response.end();
      return;
    }
    response.end("ok");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    const lookup = async (hostname: string) =>
      hostname === "safe.test"
        ? ([{ address: "127.0.0.1", family: 4 }] as const)
        : ([{ address: "10.0.0.1", family: 4 }] as const);
    const body = await withOutboundResponse(
      `http://safe.test:${address.port}/`,
      {
        lookup,
        privateAllowlist: "safe.test",
      },
      (response) => readResponseBody(response, 16),
    );
    assert.equal(body.toString(), "ok");

    await assert.rejects(
      withOutboundResponse(
        `http://safe.test:${address.port}/redirect`,
        {
          lookup,
          privateAllowlist: "safe.test",
          maxRedirects: 2,
        },
        (response) => readResponseBody(response, 16),
      ),
      (error: unknown) =>
        error instanceof OutboundRequestError &&
        error.code === "PRIVATE_ADDRESS",
    );
  } finally {
    server.close();
  }
});

test("enforces response byte limits", async () => {
  const server = createServer((_request, response) => response.end("too large"));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    await assert.rejects(
      withOutboundResponse(
        `http://127.0.0.1:${address.port}/`,
        { privateAllowlist: "127.0.0.1" },
        (response) => readResponseBody(response, 3),
      ),
      (error: unknown) =>
        error instanceof OutboundRequestError &&
        error.code === "RESPONSE_TOO_LARGE",
    );
  } finally {
    server.close();
  }
});
