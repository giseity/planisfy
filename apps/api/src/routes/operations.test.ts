import assert from "node:assert/strict";
import test from "node:test";
import {
  deliverNotification,
  formatSseEvent,
  operationsOverviewSignature,
  prepareWorkflowTemplateApplication,
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

test("applying schedule template prepares a schedule payload", () => {
  const prepared = prepareWorkflowTemplateApplication(
    {
      id: "template-1",
      name: "Nightly import",
      category: "schedule",
      template: {
        kind: "source_import",
        cron: "0 2 * * *",
        payload: { provider: "OVERTURE" },
      },
    },
    {},
  );

  assert.equal(prepared.success, true);
  if (prepared.success) {
    assert.equal(prepared.data.category, "schedule");
    assert.equal(prepared.data.values.name, "Nightly import");
    assert.equal(prepared.data.values.kind, "source_import");
    assert.deepEqual(prepared.data.values.payload, { provider: "OVERTURE" });
  }
});

test("applying invalid template returns validation error", () => {
  const prepared = prepareWorkflowTemplateApplication(
    {
      id: "template-1",
      name: "Broken rebuild",
      category: "schedule",
      template: {
        kind: "tileset_rebuild",
        cron: "0 2 * * *",
        payload: {},
      },
    },
    {},
  );

  assert.equal(prepared.success, false);
  if (!prepared.success) {
    assert.match(
      JSON.stringify(prepared.error.flatten()),
      /tilesetId payload value/,
    );
  }
});

test("Slack and Discord notification payloads post to target", async () => {
  const calls: Array<{ url: string; body: unknown }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url, init) => {
    calls.push({
      url: String(url),
      body: JSON.parse(String(init?.body)),
    });
    return new Response("", { status: 200 });
  }) as typeof fetch;

  try {
    await deliverNotification(
      { provider: "slack", target: "https://hooks.example.com/slack" },
      {
        event: "notification.test",
        message: "Planisfy test notification",
        timestamp: "2026-06-15T00:00:00.000Z",
      },
    );
    await deliverNotification(
      { provider: "discord", target: "https://hooks.example.com/discord" },
      {
        event: "notification.test",
        message: "Planisfy test notification",
        timestamp: "2026-06-15T00:00:00.000Z",
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(calls, [
    {
      url: "https://hooks.example.com/slack",
      body: { text: "Planisfy test notification\nnotification.test" },
    },
    {
      url: "https://hooks.example.com/discord",
      body: { content: "Planisfy test notification\nnotification.test" },
    },
  ]);
});

test("email notification adapter reports unavailable when email config is missing", async () => {
  const result = await deliverNotification(
    { provider: "email", target: "ops@example.com" },
    {
      event: "notification.test",
      message: "Planisfy test notification",
      timestamp: "2026-06-15T00:00:00.000Z",
    },
  );

  assert.equal(result.delivered, false);
  assert.equal(result.status, 503);
  assert.equal(result.code, "EMAIL_UNAVAILABLE");
});
