import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDashboardPayload,
  makeHealthEntry,
  normalizeHealthStatus,
  type DashboardRecentJob,
  type DashboardRecentStyle,
  type DashboardRecentTileset,
} from "./dashboard";

const account = {
  id: "00000000-0000-0000-0000-000000000001",
  handle: "acme",
  displayName: "Acme Maps",
  avatarUrl: null,
  type: "USER",
};

const user = {
  id: account.id,
  email: "ops@example.com",
  emailVerified: true,
};

test("dashboard payload shapes an empty account with setup gaps", () => {
  const dashboard = buildDashboardPayload({
    generatedAt: "2026-06-05T12:00:00.000Z",
    account,
    user,
    plan: "free",
    monthlyQuotaUsed: 0,
    monthlyQuotaLimit: 100_000,
    totalRequests: 0,
    errorCount: 0,
    counts: {
      activeApiKeys: 0,
      totalStyles: 0,
      publishedStyles: 0,
      totalTilesets: 0,
      publishedTilesets: 0,
      runningJobs: 0,
      failedJobs: 0,
    },
    timeseries: [],
    endpointBreakdown: [],
    topApiKeys: [],
    recentStyles: [],
    recentTilesets: [],
    recentJobs: [],
    recentAudit: [],
    health: baseHealth(),
    apiBaseUrl: "https://api.planisfy.localhost",
  });

  assert.equal(dashboard.summary.totalRequests, 0);
  assert.equal(dashboard.billing.quota.remaining, 100_000);
  assert.deepEqual(dashboard.resources.recentStyles, []);
  assert.equal(
    dashboard.readiness.find((item) => item.id === "api-key")?.status,
    "missing",
  );
  assert.equal(
    dashboard.readiness.find((item) => item.id === "published-style")?.status,
    "missing",
  );
  assert.deepEqual(dashboard.integration.missing, [
    "Publish a style",
    "Publish a tileset",
    "Create an API key",
  ]);
  assert.equal(dashboard.operations.alerts[0]?.id, "all-clear");
});

test("dashboard payload sorts recent account sections", () => {
  const oldStyle = recentStyle("old", "2026-06-01T12:00:00.000Z");
  const newStyle = recentStyle("new", "2026-06-04T12:00:00.000Z");
  const oldTileset = recentTileset("old-tiles", "2026-06-02T12:00:00.000Z");
  const newTileset = recentTileset("new-tiles", "2026-06-05T12:00:00.000Z");
  const oldJob = recentJob("old-job", "2026-06-01T12:00:00.000Z");
  const newJob = recentJob("new-job", "2026-06-05T12:00:00.000Z");

  const dashboard = buildDashboardPayload({
    generatedAt: "2026-06-05T12:00:00.000Z",
    account,
    user,
    plan: "pro",
    monthlyQuotaUsed: 50,
    monthlyQuotaLimit: 1_000_000,
    totalRequests: 20,
    errorCount: 1,
    counts: {
      activeApiKeys: 2,
      totalStyles: 2,
      publishedStyles: 1,
      totalTilesets: 2,
      publishedTilesets: 1,
      runningJobs: 1,
      failedJobs: 1,
    },
    timeseries: [],
    endpointBreakdown: [{ category: "tiles", requests: 20, units: 50, errorCount: 1 }],
    topApiKeys: [
      {
        apiKeyId: "pk_old",
        name: "Old",
        requests: 5,
        units: 5,
        errorCount: 0,
        lastUsedAt: "2026-06-01T12:00:00.000Z",
      },
      {
        apiKeyId: "pk_new",
        name: "New",
        requests: 15,
        units: 45,
        errorCount: 1,
        lastUsedAt: "2026-06-05T12:00:00.000Z",
      },
    ],
    recentStyles: [oldStyle, newStyle],
    recentTilesets: [oldTileset, newTileset],
    recentJobs: [oldJob, newJob],
    recentAudit: [
      {
        id: "audit-old",
        action: "style.updated",
        resourceType: "style",
        resourceId: oldStyle.id,
        timestamp: "2026-06-01T12:00:00.000Z",
      },
      {
        id: "audit-new",
        action: "tileset.published",
        resourceType: "tileset",
        resourceId: newTileset.id,
        timestamp: "2026-06-05T12:00:00.000Z",
      },
    ],
    health: baseHealth(),
    apiBaseUrl: "https://api.planisfy.localhost",
  });

  assert.equal(dashboard.resources.recentStyles[0]?.id, "new");
  assert.equal(dashboard.resources.recentTilesets[0]?.id, "new-tiles");
  assert.equal(dashboard.resources.recentJobs[0]?.id, "new-job");
  assert.equal(dashboard.resources.recentAudit[0]?.id, "audit-new");
  assert.equal(dashboard.usage.topApiKeys[0]?.apiKeyId, "pk_new");
  assert.equal(dashboard.summary.errorRate, 5);
  assert.equal(dashboard.operations.jobSignals.failedJobs, 1);
  assert.equal(dashboard.operations.alerts.some((alert) => alert.id === "failed-jobs"), true);
});

test("dashboard payload reports operational alerts", () => {
  const staleJob: DashboardRecentJob = {
    ...recentJob("stale-job", "2026-06-05T11:00:00.000Z"),
    status: "PROCESSING",
    progress: 20,
  };
  const failedJob: DashboardRecentJob = {
    ...recentJob("failed-job", "2026-06-05T11:55:00.000Z"),
    status: "FAILED",
    errorCode: "TIPPECANOE_ERROR",
    errorMessage: "Tippecanoe exited with code 1",
  };

  const dashboard = buildDashboardPayload({
    generatedAt: "2026-06-05T12:00:00.000Z",
    account,
    user,
    plan: "free",
    monthlyQuotaUsed: 95,
    monthlyQuotaLimit: 100,
    totalRequests: 10,
    errorCount: 0,
    counts: {
      activeApiKeys: 1,
      totalStyles: 1,
      publishedStyles: 1,
      totalTilesets: 1,
      publishedTilesets: 1,
      runningJobs: 1,
      failedJobs: 1,
    },
    timeseries: [],
    endpointBreakdown: [],
    topApiKeys: [],
    recentStyles: [],
    recentTilesets: [],
    recentJobs: [staleJob, failedJob],
    recentAudit: [],
    health: [
      ...baseHealth(),
      makeHealthEntry({
        id: "redis",
        label: "Redis",
        status: "offline",
        message: "connection refused",
        checkedAt: "2026-06-05T12:00:00.000Z",
      }),
    ],
    apiBaseUrl: "https://api.planisfy.localhost",
  });

  assert.equal(dashboard.operations.unhealthyServices, 1);
  assert.equal(dashboard.operations.jobSignals.staleRunningJobs, 1);
  assert.equal(dashboard.operations.jobSignals.failedJobs, 1);
  assert.equal(
    dashboard.operations.jobSignals.recentFailures[0]?.errorCode,
    "TIPPECANOE_ERROR",
  );
  assert.equal(
    dashboard.operations.alerts.some((alert) => alert.id === "quota-critical"),
    true,
  );
  assert.equal(
    dashboard.operations.alerts.some((alert) => alert.id === "service-health"),
    true,
  );
});

test("optional services can be unavailable without failing readiness", () => {
  assert.equal(normalizeHealthStatus("healthy", false), "not_configured");

  const dashboard = buildDashboardPayload({
    generatedAt: "2026-06-05T12:00:00.000Z",
    account,
    user,
    plan: "free",
    monthlyQuotaUsed: 0,
    monthlyQuotaLimit: null,
    totalRequests: 0,
    errorCount: 0,
    counts: {
      activeApiKeys: 1,
      totalStyles: 1,
      publishedStyles: 1,
      totalTilesets: 1,
      publishedTilesets: 1,
      runningJobs: 0,
      failedJobs: 0,
    },
    timeseries: [],
    endpointBreakdown: [],
    topApiKeys: [],
    recentStyles: [],
    recentTilesets: [],
    recentJobs: [],
    recentAudit: [],
    health: [
      ...baseHealth(),
      makeHealthEntry({
        id: "email",
        label: "Email",
        status: "not_configured",
        checkedAt: "2026-06-05T12:00:00.000Z",
      }),
    ],
    apiBaseUrl: "https://api.planisfy.localhost",
  });

  assert.equal(
    dashboard.readiness.find((item) => item.id === "email")?.status,
    "complete",
  );
  assert.equal(
    dashboard.health.find((entry) => entry.id === "email")?.status,
    "not_configured",
  );
});

function baseHealth() {
  return [
    "api",
    "postgres",
    "redis",
    "worker-geodata",
    "martin",
    "valhalla",
    "storage",
  ].map((id) =>
    makeHealthEntry({
      id,
      label: id,
      status: "healthy",
      checkedAt: "2026-06-05T12:00:00.000Z",
    }),
  );
}

function recentStyle(id: string, updatedAt: string): DashboardRecentStyle {
  return {
    id,
    handle: id,
    name: id,
    description: null,
    isPublic: id === "new",
    thumbnailUrl: null,
    version: 1,
    createdAt: "2026-06-01T12:00:00.000Z",
    updatedAt,
    publicUrl: id === "new" ? `/styles/v1/acme/${id}` : null,
  };
}

function recentTileset(id: string, updatedAt: string): DashboardRecentTileset {
  return {
    id,
    handle: id,
    name: id,
    description: null,
    status: "READY",
    type: "VECTOR",
    isPublished: id === "new-tiles",
    ownerHandle: "acme",
    createdAt: "2026-06-01T12:00:00.000Z",
    updatedAt,
    currentVersion: null,
    latestVersion: null,
    tilejsonUrl: id === "new-tiles" ? `/tiles/v1/acme/${id}.json` : null,
    versionedTilejsonUrl: null,
  };
}

function recentJob(id: string, updatedAt: string): DashboardRecentJob {
  return {
    id,
    type: "tileset.process_upload",
    status: id === "new-job" ? "PROCESSING" : "FAILED",
    progress: id === "new-job" ? 50 : 100,
    errorCode: null,
    errorMessage: null,
    tilesetId: null,
    createdAt: "2026-06-01T12:00:00.000Z",
    updatedAt,
    startedAt: null,
    completedAt: null,
  };
}
