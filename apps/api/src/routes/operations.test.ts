import assert from "node:assert/strict";
import test from "node:test";
import {
  formatSseEvent,
  operationsOverviewSignature,
  validateScheduleInput,
} from "./operations";

test("formatSseEvent emits EventSource-compatible frames", () => {
  assert.equal(
    formatSseEvent("operations", { status: "ok", progress: 50 }),
    'event: operations\ndata: {"status":"ok","progress":50}\n\n',
  );
});

test("operationsOverviewSignature ignores volatile display-only fields", () => {
  const overview = {
    recentJobs: [
      {
        id: "job-1",
        status: "PROCESSING",
        progress: 20,
        updatedAt: new Date("2026-06-12T12:00:00Z"),
      },
    ],
    notificationChannels: [],
    scheduledOperations: [],
    artifactBackups: [],
    workerNodes: [],
    previewLinks: [],
    customDomains: [],
    workflowTemplates: [
      {
        id: "builtin",
        builtIn: true,
        createdAt: new Date("2026-06-12T12:00:00Z"),
      },
    ],
    workerHealth: {
      status: "healthy",
      message: "Heartbeat 1s ago",
      latencyMs: 1,
    },
  };
  const changedOnlyVolatileFields = {
    ...overview,
    workflowTemplates: [
      {
        id: "builtin",
        builtIn: true,
        createdAt: new Date("2026-06-12T12:00:02Z"),
      },
    ],
    workerHealth: {
      status: "healthy",
      message: "Heartbeat 3s ago",
      latencyMs: 3,
    },
  };

  assert.equal(
    operationsOverviewSignature(overview as never),
    operationsOverviewSignature(changedOnlyVolatileFields as never),
  );
});

test("validateScheduleInput requires tilesetId for rebuild schedules", () => {
  const baseSchedule = {
    name: "Nightly rebuild",
    kind: "tileset_rebuild",
    cron: "0 2 * * *",
    timezone: "UTC",
  };

  assert.equal(
    validateScheduleInput({ ...baseSchedule, payload: {} }).success,
    false,
  );
  assert.equal(
    validateScheduleInput({
      ...baseSchedule,
      payload: { tilesetId: "tileset-1" },
    }).success,
    true,
  );
});
