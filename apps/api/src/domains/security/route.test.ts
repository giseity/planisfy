import assert from "node:assert/strict";
import test from "node:test";
import { serializeSecurityActivity } from "./route";

test("serializeSecurityActivity returns persisted audit activity", () => {
  const timestamp = new Date("2026-06-15T12:00:00.000Z");

  const serialized = serializeSecurityActivity({
    id: "audit-1",
    accountId: "account-1",
    actorUserId: "actor-1",
    requestId: "request-1",
    outcome: "SUCCESS",
    action: "password.changed",
    resourceType: "security",
    resourceId: null,
    metadata: { method: "password" },
    ipAddress: null,
    timestamp,
  });

  assert.deepEqual(serialized, {
    id: "audit-1",
    action: "password.changed",
    resourceType: "security",
    resourceId: null,
    metadata: { method: "password" },
    ipAddress: null,
    actorUserId: "actor-1",
    requestId: "request-1",
    outcome: "SUCCESS",
    timestamp: timestamp.toISOString(),
  });
});
