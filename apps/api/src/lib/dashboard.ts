import { PLANS, type PlanSlug } from "@planisfy/types";

export type DashboardHealthStatus =
  | "healthy"
  | "degraded"
  | "not_configured"
  | "offline";

export type DashboardEndpointCategory =
  | "tiles"
  | "styles"
  | "geocoding"
  | "directions"
  | "elevation"
  | "static"
  | "other";

export interface DashboardHealthEntry {
  id: string;
  label: string;
  status: DashboardHealthStatus;
  message?: string | null;
  latencyMs?: number | null;
  checkedAt: string;
}

export interface DashboardReadinessItem {
  id: string;
  label: string;
  description: string;
  complete: boolean;
  required: boolean;
  status: "complete" | "missing" | "attention" | "optional";
  actionLabel?: string;
  actionHref?: string;
}

export interface DashboardTimeseriesPoint {
  date: string;
  tiles: number;
  styles: number;
  geocoding: number;
  directions: number;
  elevation: number;
  static: number;
  other: number;
  total: number;
}

export interface DashboardEndpointBreakdown {
  category: DashboardEndpointCategory;
  requests: number;
  units: number;
  errorCount: number;
}

export interface DashboardTopApiKey {
  apiKeyId: string | null;
  name: string;
  requests: number;
  units: number;
  errorCount: number;
  lastUsedAt: string | null;
}

export interface DashboardRecentStyle {
  id: string;
  handle: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  thumbnailUrl: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  publicUrl: string | null;
}

export interface DashboardRecentTilesetVersion {
  id: string;
  version: number;
  format: string;
  createdAt: string;
  publishedAt: string | null;
}

export interface DashboardRecentTileset {
  id: string;
  handle: string;
  name: string;
  description: string | null;
  status: string;
  type: string;
  isPublished: boolean;
  ownerHandle: string | null;
  createdAt: string;
  updatedAt: string;
  currentVersion: DashboardRecentTilesetVersion | null;
  latestVersion: DashboardRecentTilesetVersion | null;
  tilejsonUrl: string | null;
  versionedTilejsonUrl: string | null;
}

export interface DashboardRecentJob {
  id: string;
  type: string;
  status: string;
  progress: number;
  errorCode: string | null;
  errorMessage: string | null;
  tilesetId: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface DashboardRecentAuditEvent {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  timestamp: string;
}

export interface ConsoleDashboard {
  generatedAt: string;
  account: {
    id: string;
    handle: string;
    displayName: string;
    avatarUrl: string | null;
    type: string;
  };
  user: {
    id: string;
    email: string | null;
    emailVerified: boolean;
  };
  billing: {
    plan: PlanSlug;
    planName: string;
    quota: {
      monthlyUnits: number | null;
      used: number;
      remaining: number | null;
      percent: number;
    };
  };
  summary: {
    totalRequests: number;
    totalUnits: number;
    errorRate: number;
    activeApiKeys: number;
    publishedStyles: number;
    totalStyles: number;
    publishedTilesets: number;
    totalTilesets: number;
    runningJobs: number;
    failedJobs: number;
  };
  usage: {
    timeseries: DashboardTimeseriesPoint[];
    endpointBreakdown: DashboardEndpointBreakdown[];
    topApiKeys: DashboardTopApiKey[];
  };
  resources: {
    recentStyles: DashboardRecentStyle[];
    recentTilesets: DashboardRecentTileset[];
    recentJobs: DashboardRecentJob[];
    recentAudit: DashboardRecentAuditEvent[];
  };
  health: DashboardHealthEntry[];
  readiness: DashboardReadinessItem[];
  integration: {
    apiBaseUrl: string;
    publicStyleUrl: string | null;
    tilejsonUrl: string | null;
    mapLibreSnippet: string | null;
    curlSnippet: string | null;
    missing: string[];
  };
}

type DateLike = Date | string | null | undefined;

export interface BuildDashboardPayloadInput {
  generatedAt?: DateLike;
  account: ConsoleDashboard["account"];
  user: ConsoleDashboard["user"];
  plan: PlanSlug;
  monthlyQuotaUsed: number;
  monthlyQuotaLimit: number | null;
  totalRequests: number;
  errorCount: number;
  counts: {
    activeApiKeys: number;
    totalStyles: number;
    publishedStyles: number;
    totalTilesets: number;
    publishedTilesets: number;
    runningJobs: number;
    failedJobs: number;
  };
  timeseries: DashboardTimeseriesPoint[];
  endpointBreakdown: DashboardEndpointBreakdown[];
  topApiKeys: DashboardTopApiKey[];
  recentStyles: DashboardRecentStyle[];
  recentTilesets: DashboardRecentTileset[];
  recentJobs: DashboardRecentJob[];
  recentAudit: DashboardRecentAuditEvent[];
  health: DashboardHealthEntry[];
  apiBaseUrl: string;
}

const CATEGORIES: DashboardEndpointCategory[] = [
  "tiles",
  "styles",
  "geocoding",
  "directions",
  "elevation",
  "static",
  "other",
];

export function normalizeHealthStatus(
  status: string | null | undefined,
  configured = true,
): DashboardHealthStatus {
  if (!configured) return "not_configured";
  const normalized = (status ?? "").toLowerCase();
  if (normalized === "healthy" || normalized === "ok" || normalized === "up") {
    return "healthy";
  }
  if (normalized === "degraded" || normalized === "warning") {
    return "degraded";
  }
  if (normalized === "not_configured" || normalized === "unavailable") {
    return "not_configured";
  }
  return "offline";
}

export function categorizeDashboardEndpoint(
  endpoint: string | null | undefined,
): DashboardEndpointCategory {
  const value = endpoint ?? "";
  if (value.includes("tiles")) return "tiles";
  if (value.includes("styles") || value.includes("fonts")) return "styles";
  if (value.includes("geocoding")) return "geocoding";
  if (
    value.includes("directions") ||
    value.includes("isochrone") ||
    value.includes("matrix") ||
    value.includes("matching") ||
    value.includes("optimized-trips")
  ) {
    return "directions";
  }
  if (value.includes("elevation")) return "elevation";
  if (value.includes("static")) return "static";
  return "other";
}

export function makeHealthEntry(params: {
  id: string;
  label: string;
  status: DashboardHealthStatus;
  message?: string | null;
  latencyMs?: number | null;
  checkedAt?: DateLike;
}): DashboardHealthEntry {
  return {
    id: params.id,
    label: params.label,
    status: params.status,
    message: params.message ?? null,
    latencyMs: params.latencyMs ?? null,
    checkedAt: toIso(params.checkedAt) ?? new Date().toISOString(),
  };
}

export function buildDashboardPayload(
  input: BuildDashboardPayloadInput,
): ConsoleDashboard {
  const used = Math.max(0, input.monthlyQuotaUsed);
  const quotaLimit = input.monthlyQuotaLimit;
  const quotaRemaining =
    quotaLimit === null ? null : Math.max(0, quotaLimit - used);
  const quotaPercent =
    quotaLimit === null || quotaLimit === 0
      ? 0
      : Math.min(100, Math.round((used / quotaLimit) * 100));
  const integration = buildIntegration(input);

  return {
    generatedAt: toIso(input.generatedAt) ?? new Date().toISOString(),
    account: input.account,
    user: input.user,
    billing: {
      plan: input.plan,
      planName: PLANS[input.plan]?.name ?? input.plan,
      quota: {
        monthlyUnits: quotaLimit,
        used,
        remaining: quotaRemaining,
        percent: quotaPercent,
      },
    },
    summary: {
      totalRequests: input.totalRequests,
      totalUnits: used,
      errorRate:
        input.totalRequests === 0
          ? 0
          : Number(((input.errorCount / input.totalRequests) * 100).toFixed(2)),
      activeApiKeys: input.counts.activeApiKeys,
      publishedStyles: input.counts.publishedStyles,
      totalStyles: input.counts.totalStyles,
      publishedTilesets: input.counts.publishedTilesets,
      totalTilesets: input.counts.totalTilesets,
      runningJobs: input.counts.runningJobs,
      failedJobs: input.counts.failedJobs,
    },
    usage: {
      timeseries: input.timeseries,
      endpointBreakdown: normalizeEndpointBreakdown(input.endpointBreakdown),
      topApiKeys: sortRecent(input.topApiKeys, (key) => key.lastUsedAt).slice(0, 5),
    },
    resources: {
      recentStyles: sortRecent(input.recentStyles, (style) => style.updatedAt).slice(0, 5),
      recentTilesets: sortRecent(input.recentTilesets, (tileset) => tileset.updatedAt).slice(0, 5),
      recentJobs: sortRecent(input.recentJobs, (job) => job.updatedAt).slice(0, 8),
      recentAudit: sortRecent(input.recentAudit, (event) => event.timestamp).slice(0, 10),
    },
    health: input.health,
    readiness: buildReadiness({
      activeApiKeys: input.counts.activeApiKeys,
      publishedStyles: input.counts.publishedStyles,
      publishedTilesets: input.counts.publishedTilesets,
      health: input.health,
    }),
    integration,
  };
}

export function buildReadiness(params: {
  activeApiKeys: number;
  publishedStyles: number;
  publishedTilesets: number;
  health: DashboardHealthEntry[];
}): DashboardReadinessItem[] {
  const healthById = new Map(params.health.map((entry) => [entry.id, entry]));
  const isHealthy = (id: string) => healthById.get(id)?.status === "healthy";
  const isConfigured = (id: string) =>
    healthById.get(id)?.status !== "not_configured";
  const optional = (id: string) => !isConfigured(id);

  return [
    readinessItem({
      id: "api-key",
      label: "API key created",
      description: "Create at least one key for production requests.",
      complete: params.activeApiKeys > 0,
      required: true,
      actionLabel: "Create key",
      actionHref: "/studio/keys",
    }),
    readinessItem({
      id: "published-style",
      label: "Published style",
      description: "Publish a style for MapLibre and public style URLs.",
      complete: params.publishedStyles > 0,
      required: true,
      actionLabel: "Create style",
      actionHref: "/studio/styles",
    }),
    readinessItem({
      id: "published-tileset",
      label: "Published tileset",
      description: "Publish source data so maps can render account tiles.",
      complete: params.publishedTilesets > 0,
      required: true,
      actionLabel: "Upload tileset",
      actionHref: "/studio/sources",
    }),
    readinessItem({
      id: "martin",
      label: "Martin reachable",
      description: "Vector tile serving is responding.",
      complete: isHealthy("martin"),
      required: true,
      actionHref: "/studio/sources",
    }),
    readinessItem({
      id: "valhalla",
      label: "Valhalla reachable",
      description: "Routing services are responding.",
      complete: isHealthy("valhalla"),
      required: true,
      actionHref: "/studio/usage",
    }),
    readinessItem({
      id: "storage",
      label: "Storage configured",
      description: "Uploads and generated artifacts have a backing store.",
      complete: isHealthy("storage"),
      required: true,
      actionHref: "/studio/sources",
    }),
    readinessItem({
      id: "geocoding",
      label: "Geocoding provider",
      description: "Search endpoints are configured or intentionally unavailable.",
      complete: isHealthy("geocoding") || optional("geocoding"),
      required: false,
    }),
    readinessItem({
      id: "static-maps",
      label: "Static maps",
      description: "Static image rendering is configured or intentionally unavailable.",
      complete: isHealthy("static-maps") || optional("static-maps"),
      required: false,
    }),
    readinessItem({
      id: "email",
      label: "Email",
      description: "Transactional email is configured or intentionally unavailable.",
      complete: isHealthy("email") || optional("email"),
      required: false,
      actionHref: "/studio/settings",
    }),
    readinessItem({
      id: "billing",
      label: "Billing",
      description: "Billing checkout is configured or intentionally unavailable.",
      complete: isHealthy("billing") || optional("billing"),
      required: false,
      actionHref: "/studio/settings",
    }),
  ];
}

export function emptyTimeseries(days: number, now = new Date()) {
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    return {
      date: date.toISOString().slice(0, 10),
      tiles: 0,
      styles: 0,
      geocoding: 0,
      directions: 0,
      elevation: 0,
      static: 0,
      other: 0,
      total: 0,
    };
  });
}

function readinessItem(params: {
  id: string;
  label: string;
  description: string;
  complete: boolean;
  required: boolean;
  actionLabel?: string;
  actionHref?: string;
}): DashboardReadinessItem {
  return {
    ...params,
    status: params.complete
      ? "complete"
      : params.required
        ? "missing"
        : "optional",
  };
}

function buildIntegration(input: BuildDashboardPayloadInput) {
  const publicStyle = input.recentStyles.find((style) => style.publicUrl);
  const publishedTileset = input.recentTilesets.find(
    (tileset) => tileset.tilejsonUrl,
  );
  const publicStyleUrl = publicStyle?.publicUrl ?? null;
  const tilejsonUrl = publishedTileset?.tilejsonUrl ?? null;
  const missing = [
    ...(publicStyleUrl ? [] : ["Publish a style"]),
    ...(tilejsonUrl ? [] : ["Publish a tileset"]),
    ...(input.counts.activeApiKeys > 0 ? [] : ["Create an API key"]),
  ];

  return {
    apiBaseUrl: input.apiBaseUrl,
    publicStyleUrl,
    tilejsonUrl,
    mapLibreSnippet:
      publicStyleUrl && tilejsonUrl
        ? `new maplibregl.Map({\n  container: "map",\n  style: "${publicStyleUrl}"\n});`
        : null,
    curlSnippet: tilejsonUrl ? `curl "${tilejsonUrl}"` : null,
    missing,
  };
}

function normalizeEndpointBreakdown(
  rows: DashboardEndpointBreakdown[],
): DashboardEndpointBreakdown[] {
  const byCategory = new Map<DashboardEndpointCategory, DashboardEndpointBreakdown>();
  for (const category of CATEGORIES) {
    byCategory.set(category, {
      category,
      requests: 0,
      units: 0,
      errorCount: 0,
    });
  }
  for (const row of rows) {
    const current = byCategory.get(row.category);
    if (!current) continue;
    current.requests += row.requests;
    current.units += row.units;
    current.errorCount += row.errorCount;
  }
  return [...byCategory.values()];
}

function sortRecent<T>(
  rows: T[],
  getDate: (row: T) => DateLike,
): T[] {
  return [...rows].sort((a, b) => {
    const left = Date.parse(String(getDate(a) ?? ""));
    const right = Date.parse(String(getDate(b) ?? ""));
    return (Number.isFinite(right) ? right : 0) - (Number.isFinite(left) ? left : 0);
  });
}

function toIso(value: DateLike): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
