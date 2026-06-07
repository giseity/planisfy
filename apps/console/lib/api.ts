/**
 * Thin API client for the Hono backend.
 *
 * In development, requests go through the Next.js rewrite proxy (/api/v1/*)
 * so cookies are same-origin. In production, point directly at the API.
 */

import { clientEnv } from "@/env.client";

const BASE =
  typeof window !== "undefined"
    ? clientEnv.NEXT_PUBLIC_CONSOLE_API_PATH
    : (process.env.API_URL || "https://api.planisfy.localhost") + "/console";
const API_ROOT = BASE.replace(/\/console\/?$/, "");

interface ApiError {
  error: { code: string; message: string; details?: unknown };
}

export interface ApiEnvelope<T> {
  data: T;
}

export interface ConsoleProfile {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  email: string;
  emailVerified: boolean;
  createdAt: string;
}

export interface ConsoleVectorLayer {
  id: string;
  fields?: Record<string, string>;
  description?: string;
  minzoom?: number;
  maxzoom?: number;
}

export interface ConsoleTilesetVersion {
  id: string;
  tilesetId: string;
  version: number;
  buildJobId: string | null;
  format: string;
  schema: {
    vector_layers?: ConsoleVectorLayer[];
  } | null;
  bounds: unknown;
  minZoom: number | null;
  maxZoom: number | null;
  createdAt: string;
  publishedAt: string | null;
  artifact: ConsoleStorageArtifact | null;
}

export interface ConsoleUploadValidation {
  format?: string;
  featureCount?: number;
  bounds?: [number, number, number, number] | null;
  schema?: {
    fields?: Record<string, string>;
    columns?: string[];
  };
  csv?: {
    latitude?: string;
    longitude?: string;
  };
  byteLength?: number;
}

export interface ConsoleUpload {
  id: string;
  accountId: string;
  originalFileName: string;
  contentType: string | null;
  size: number | null;
  storageObjectId: string | null;
  status: string;
  validationResult: ConsoleUploadValidation | null;
  linkedTilesetId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConsoleStorageArtifact {
  id: string;
  provider: string;
  bucket: string | null;
  storageKey: string;
  fileName: string | null;
  contentType: string | null;
  size: number | null;
  url: string;
}

export interface ConsoleTileset {
  id: string;
  accountId: string;
  ownerHandle: string | null;
  name: string;
  handle: string;
  description: string | null;
  type: "VECTOR" | "RASTER" | string;
  status: string;
  currentVersionId: string | null;
  bounds: unknown;
  minZoom: number | null;
  maxZoom: number | null;
  layerMetadata: {
    vector_layers?: ConsoleVectorLayer[];
  } | null;
  uploads: ConsoleUpload[];
  latestUpload: ConsoleUpload | null;
  versions: ConsoleTilesetVersion[];
  latestVersion: ConsoleTilesetVersion | null;
  currentVersion: ConsoleTilesetVersion | null;
  isPublished: boolean;
  tilejsonUrl: string | null;
  versionedTilejsonUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConsoleProcessingJob {
  id: string;
  accountId: string;
  type: string;
  status: string;
  progress: number;
  retryCount: number;
  cancelRequestedAt: string | null;
  input: {
    tilesetId?: string;
    uploadId?: string;
    datasetId?: string;
    datasetVersionId?: string;
    format?: string;
  } | null;
  output: {
    stage?: string;
    storageKey?: string;
    fallback?: string;
  } | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  executionTargetId?: string | null;
  workerProfileId?: string | null;
}

export interface TilesetUploadOptions {
  name: string;
  handle: string;
  description?: string;
  minZoom?: number;
  maxZoom?: number;
  csvLatitude?: string;
  csvLongitude?: string;
  executionTargetId?: string;
  workerProfileId?: string;
}

export interface TilesetUploadResult {
  upload: unknown;
  tileset: unknown;
  processingJob: unknown;
}

export interface DatasetTilesetOptions {
  handle: string;
  name: string;
  description?: string;
  datasetVersionId?: string;
  minZoom?: number;
  maxZoom?: number;
  executionTargetId?: string;
  workerProfileId?: string;
}

export type ExecutionTargetProvider = "local" | "aws_batch" | "gcp_batch";
export type ExecutionTargetAuthMode = "federated" | "static" | "external";

export interface ConsoleExecutionTarget {
  id: string;
  accountId: string;
  name: string;
  provider: ExecutionTargetProvider;
  authMode: ExecutionTargetAuthMode;
  region: string | null;
  config: Record<string, unknown>;
  hasCredentials: boolean;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConsoleExecutionTargetEnvVar {
  id: string;
  accountId: string;
  executionTargetId: string;
  name: string;
  value: string;
  isSecret: boolean;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConsoleWorkerProfile {
  id: string;
  accountId: string;
  name: string;
  image: string | null;
  command: string[];
  args: string[];
  cpu: number | null;
  memoryMb: number | null;
  timeoutSeconds: number | null;
  concurrency: number | null;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ConsoleNotificationChannel {
  id: string;
  accountId: string;
  name: string;
  provider: "webhook" | "email" | "slack" | "discord";
  target: string;
  events: string[];
  enabled: boolean;
  hasConfig: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ConsoleScheduledOperation {
  id: string;
  accountId: string;
  name: string;
  kind: "tileset_rebuild" | "source_import" | "custom_command";
  status: "active" | "paused";
  cron: string;
  timezone: string;
  payload: Record<string, unknown>;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConsoleArtifactBackup {
  id: string;
  accountId: string;
  storageObjectId: string | null;
  provider: string;
  bucket: string | null;
  sourceStorageKey: string;
  backupStorageKey: string;
  size: number | null;
  status: "pending" | "completed" | "failed" | "restored";
  errorMessage: string | null;
  completedAt: string | null;
  restoredAt: string | null;
  createdAt: string;
}

export interface ConsoleWorkerNode {
  id: string;
  accountId: string;
  name: string;
  kind: "local" | "remote" | "cloud";
  status: "pending" | "healthy" | "degraded" | "offline";
  endpoint: string | null;
  validation: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConsolePreviewLink {
  id: string;
  accountId: string;
  resourceType: string;
  resourceId: string;
  slug: string;
  targetUrl: string;
  expiresAt: string | null;
  createdAt: string;
}

export interface ConsoleCustomDomain {
  id: string;
  accountId: string;
  resourceType: string;
  resourceId: string | null;
  host: string;
  path: string;
  status: "pending" | "verified" | "active" | "failed";
  verificationToken: string;
  tlsEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ConsoleWorkflowTemplate {
  id: string;
  accountId: string | null;
  name: string;
  category: string;
  description: string | null;
  template: Record<string, unknown>;
  builtIn: boolean;
  createdAt: string;
}

export type PlatformPreflightStatus = "pass" | "warn" | "fail";
export type PlatformPreflightSeverity =
  | "required"
  | "recommended"
  | "optional";

export interface PlatformPreflightCheck {
  id: string;
  label: string;
  group: string;
  status: PlatformPreflightStatus;
  severity: PlatformPreflightSeverity;
  message: string;
  action?: string;
  value?: string | number | boolean | null;
}

export interface PlatformPreflightGroup {
  name: string;
  pass: number;
  warn: number;
  fail: number;
  checks: PlatformPreflightCheck[];
}

export interface PlatformPreflight {
  generatedAt: string;
  environment: string;
  appVersion: string;
  summary: {
    pass: number;
    warn: number;
    fail: number;
    blocking: number;
  };
  groups: PlatformPreflightGroup[];
  checks: PlatformPreflightCheck[];
}

export interface ConsoleWorkerHealth {
  status: "healthy" | "degraded" | "offline" | string;
  message: string;
  latencyMs: number | null;
  toolchain?: unknown;
}

export interface ConsoleOperationsOverview {
  recentJobs: ConsoleProcessingJob[];
  notificationChannels: ConsoleNotificationChannel[];
  scheduledOperations: ConsoleScheduledOperation[];
  artifactBackups: ConsoleArtifactBackup[];
  workerNodes: ConsoleWorkerNode[];
  previewLinks: ConsolePreviewLink[];
  customDomains: ConsoleCustomDomain[];
  workflowTemplates: ConsoleWorkflowTemplate[];
  workerHealth: ConsoleWorkerHealth;
}

export interface ConsoleJobTimelineEvent {
  id: string;
  message: string;
  timestamp: string | null;
  level: string;
  metadata: unknown;
}

export interface ConsoleJobTimeline {
  job: ConsoleProcessingJob;
  timeline: ConsoleJobTimelineEvent[];
}

export interface ProcessingEstimate {
  minSeconds: number;
  maxSeconds: number;
  confidence: "low" | "medium" | "high";
  basis: string[];
}

export interface DatasetTilesetResult {
  dataset: unknown;
  datasetVersion: unknown;
  tileset: ConsoleTileset;
  processingJob: ConsoleProcessingJob;
}

export interface ConsoleSavedRegion {
  id: string;
  accountId: string;
  handle: string;
  name: string;
  description: string | null;
  bbox: [number, number, number, number];
  geometry: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface SavedRegionOptions {
  handle: string;
  name: string;
  description?: string;
  bbox: [number, number, number, number];
  geometry?: unknown;
}

export interface ConsoleSourceImport {
  id: string;
  accountId: string;
  sourceConnectionId: string | null;
  regionId: string | null;
  datasetId: string | null;
  processingJobId: string | null;
  provider: "OVERTURE" | "NATURAL_EARTH" | "CUSTOM" | string;
  sourceName: string;
  status: string;
  input: {
    theme?: string;
    type?: string;
    catalog?: {
      label?: string;
      geometry?: string[];
      defaultLayerId?: string;
    };
  } | null;
  output: {
    stage?: string;
    datasetVersionId?: string;
    featureCount?: number;
    bounds?: [number, number, number, number] | null;
    schema?: Record<string, unknown>;
    warnings?: string[];
  } | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OvertureCatalogType {
  theme: string;
  type: string;
  label: string;
  description: string;
  geometry: string[];
  defaultLayerId: string;
}

export interface OvertureCatalogTheme {
  theme: string;
  label: string;
  description: string;
  types: OvertureCatalogType[];
}

export interface OvertureImportOptions {
  handle: string;
  name: string;
  description?: string;
  regionId: string;
  sourceConnectionId?: string;
  theme: string;
  type?: string;
}

export interface OvertureImportResult {
  dataset: unknown;
  sourceImport: ConsoleSourceImport;
  processingJob: ConsoleProcessingJob;
}

export interface StylePublishResponse {
  id: string;
  handle: string;
  name: string;
  isPublic: boolean;
  version: number;
}

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
    plan: string;
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
    timeseries: Array<{
      date: string;
      tiles: number;
      styles: number;
      geocoding: number;
      directions: number;
      elevation: number;
      static: number;
      other: number;
      total: number;
    }>;
    endpointBreakdown: Array<{
      category: DashboardEndpointCategory;
      requests: number;
      units: number;
      errorCount: number;
    }>;
    topApiKeys: Array<{
      apiKeyId: string | null;
      name: string;
      requests: number;
      units: number;
      errorCount: number;
      lastUsedAt: string | null;
    }>;
  };
  resources: {
    recentStyles: Array<{
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
    }>;
    recentTilesets: Array<{
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
      currentVersion: {
        id: string;
        version: number;
        format: string;
        createdAt: string;
        publishedAt: string | null;
      } | null;
      latestVersion: {
        id: string;
        version: number;
        format: string;
        createdAt: string;
        publishedAt: string | null;
      } | null;
      tilejsonUrl: string | null;
      versionedTilejsonUrl: string | null;
    }>;
    recentJobs: Array<{
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
    }>;
    recentAudit: Array<{
      id: string;
      action: string;
      resourceType: string;
      resourceId: string | null;
      timestamp: string;
    }>;
  };
  health: Array<{
    id: string;
    label: string;
    status: DashboardHealthStatus;
    message?: string | null;
    latencyMs?: number | null;
    checkedAt: string;
  }>;
  readiness: Array<{
    id: string;
    label: string;
    description: string;
    complete: boolean;
    required: boolean;
    status: "complete" | "missing" | "attention" | "optional";
    actionLabel?: string;
    actionHref?: string;
  }>;
  integration: {
    apiBaseUrl: string;
    publicStyleUrl: string | null;
    tilejsonUrl: string | null;
    mapLibreSnippet: string | null;
    curlSnippet: string | null;
    missing: string[];
  };
}

export interface PaginatedApiEnvelope<T> extends ApiEnvelope<T> {
  pagination: {
    total: number;
    page?: number;
    limit?: number;
  };
}

class ApiClient {
  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${BASE}${path}`;
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: "include",
    });

    const json = await res.json();

    if (!res.ok) {
      const err = json as ApiError;
      throw new ApiRequestError(
        err.error?.message || res.statusText,
        res.status,
        err.error?.code || "UNKNOWN",
        err.error?.details,
      );
    }

    return json as T;
  }

  get<T>(path: string) {
    return this.request<T>("GET", path);
  }

  post<T>(path: string, body?: unknown) {
    return this.request<T>("POST", path, body);
  }

  put<T>(path: string, body?: unknown) {
    return this.request<T>("PUT", path, body);
  }

  patch<T>(path: string, body?: unknown) {
    return this.request<T>("PATCH", path, body);
  }

  delete<T>(path: string, body?: unknown) {
    return this.request<T>("DELETE", path, body);
  }

  getProfile() {
    return this.get<ApiEnvelope<ConsoleProfile>>("/profile");
  }

  async getDashboard() {
    const envelope = await this.get<ApiEnvelope<ConsoleDashboard>>("/dashboard");
    return {
      ...envelope,
      data: normalizeDashboardUrls(envelope.data),
    };
  }

  async listTilesets() {
    const envelope = await this.get<ApiEnvelope<ConsoleTileset[]>>("/tilesets");
    return {
      ...envelope,
      data: envelope.data.map(normalizeTilesetUrls),
    };
  }

  listJobs() {
    return this.get<ApiEnvelope<ConsoleProcessingJob[]>>("/jobs");
  }

  listSourceImports() {
    return this.get<ApiEnvelope<ConsoleSourceImport[]>>("/source-imports");
  }

  listRegions() {
    return this.get<ApiEnvelope<ConsoleSavedRegion[]>>("/regions");
  }

  listExecutionTargets() {
    return this.get<ApiEnvelope<ConsoleExecutionTarget[]>>(
      "/execution-targets",
    );
  }

  createExecutionTarget(options: {
    name: string;
    provider: ExecutionTargetProvider;
    authMode: ExecutionTargetAuthMode;
    region?: string;
    config?: Record<string, unknown>;
    credentials?: Record<string, unknown>;
  }) {
    return this.post<ApiEnvelope<ConsoleExecutionTarget>>(
      "/execution-targets",
      options,
    );
  }

  updateExecutionTarget(
    id: string,
    options: Partial<{
      name: string;
      provider: ExecutionTargetProvider;
      authMode: ExecutionTargetAuthMode;
      region: string;
      config: Record<string, unknown>;
      credentials: Record<string, unknown>;
    }>,
  ) {
    return this.patch<ApiEnvelope<ConsoleExecutionTarget>>(
      `/execution-targets/${id}`,
      options,
    );
  }

  deleteExecutionTarget(id: string) {
    return this.delete<ApiEnvelope<{ id: string; deleted: boolean }>>(
      `/execution-targets/${id}`,
    );
  }

  listExecutionTargetEnv(targetId: string) {
    return this.get<ApiEnvelope<ConsoleExecutionTargetEnvVar[]>>(
      `/execution-targets/${targetId}/env`,
    );
  }

  createExecutionTargetEnv(
    targetId: string,
    options: {
      name: string;
      value: string;
      isSecret?: boolean;
      description?: string;
    },
  ) {
    return this.post<ApiEnvelope<ConsoleExecutionTargetEnvVar>>(
      `/execution-targets/${targetId}/env`,
      options,
    );
  }

  updateExecutionTargetEnv(
    targetId: string,
    name: string,
    options: Partial<{
      value: string;
      isSecret: boolean;
      description: string | null;
    }>,
  ) {
    return this.patch<ApiEnvelope<ConsoleExecutionTargetEnvVar>>(
      `/execution-targets/${targetId}/env/${encodeURIComponent(name)}`,
      options,
    );
  }

  deleteExecutionTargetEnv(targetId: string, name: string) {
    return this.delete<ApiEnvelope<{ name: string; deleted: boolean }>>(
      `/execution-targets/${targetId}/env/${encodeURIComponent(name)}`,
    );
  }

  listWorkerProfiles() {
    return this.get<ApiEnvelope<ConsoleWorkerProfile[]>>("/worker-profiles");
  }

  createWorkerProfile(options: {
    name: string;
    image?: string;
    command?: string[];
    args?: string[];
    cpu?: number;
    memoryMb?: number;
    timeoutSeconds?: number;
    concurrency?: number;
    config?: Record<string, unknown>;
  }) {
    return this.post<ApiEnvelope<ConsoleWorkerProfile>>(
      "/worker-profiles",
      options,
    );
  }

  updateWorkerProfile(
    id: string,
    options: Partial<{
      name: string;
      image: string;
      command: string[];
      args: string[];
      cpu: number;
      memoryMb: number;
      timeoutSeconds: number;
      concurrency: number;
      config: Record<string, unknown>;
    }>,
  ) {
    return this.patch<ApiEnvelope<ConsoleWorkerProfile>>(
      `/worker-profiles/${id}`,
      options,
    );
  }

  deleteWorkerProfile(id: string) {
    return this.delete<ApiEnvelope<{ id: string; deleted: boolean }>>(
      `/worker-profiles/${id}`,
    );
  }

  estimateProcessingJob(options: {
    executionTargetId?: string;
    workerProfileId?: string;
    sourceSizeBytes?: number;
    featureCount?: number;
    minZoom?: number;
    maxZoom?: number;
  }) {
    return this.post<ApiEnvelope<ProcessingEstimate>>(
      "/processing-jobs/estimate",
      options,
    );
  }

  getOperations() {
    return this.get<ApiEnvelope<ConsoleOperationsOverview>>("/operations");
  }

  getPlatformPreflight() {
    return this.get<ApiEnvelope<PlatformPreflight>>("/setup/preflight");
  }

  getJobTimeline(jobId: string) {
    return this.get<ApiEnvelope<ConsoleJobTimeline>>(
      `/operations/jobs/${jobId}/timeline`,
    );
  }

  createNotificationChannel(options: {
    name: string;
    provider: ConsoleNotificationChannel["provider"];
    target: string;
    events?: string[];
    enabled?: boolean;
  }) {
    return this.post<ApiEnvelope<ConsoleNotificationChannel>>(
      "/operations/notification-channels",
      options,
    );
  }

  deleteNotificationChannel(id: string) {
    return this.delete<ApiEnvelope<{ id: string; deleted: boolean }>>(
      `/operations/notification-channels/${id}`,
    );
  }

  testNotificationChannel(id: string) {
    return this.post<ApiEnvelope<{ delivered: boolean; message: string }>>(
      `/operations/notification-channels/${id}/test`,
    );
  }

  createScheduledOperation(options: {
    name: string;
    kind: ConsoleScheduledOperation["kind"];
    status?: ConsoleScheduledOperation["status"];
    cron: string;
    timezone?: string;
    payload?: Record<string, unknown>;
  }) {
    return this.post<ApiEnvelope<ConsoleScheduledOperation>>(
      "/operations/schedules",
      options,
    );
  }

  runScheduledOperation(id: string) {
    return this.post<ApiEnvelope<{ schedule: ConsoleScheduledOperation; queued: boolean }>>(
      `/operations/schedules/${id}/run`,
    );
  }

  deleteScheduledOperation(id: string) {
    return this.delete<ApiEnvelope<{ id: string; deleted: boolean }>>(
      `/operations/schedules/${id}`,
    );
  }

  createArtifactBackup(storageObjectId: string) {
    return this.post<ApiEnvelope<ConsoleArtifactBackup>>(
      "/operations/artifact-backups",
      { storageObjectId },
    );
  }

  restoreArtifactBackup(id: string) {
    return this.post<ApiEnvelope<ConsoleArtifactBackup>>(
      `/operations/artifact-backups/${id}/restore`,
    );
  }

  createWorkerNode(options: {
    name: string;
    kind?: ConsoleWorkerNode["kind"];
    endpoint?: string;
    metadata?: Record<string, unknown>;
  }) {
    return this.post<ApiEnvelope<ConsoleWorkerNode>>(
      "/operations/worker-nodes",
      options,
    );
  }

  validateWorkerNode(id: string) {
    return this.post<ApiEnvelope<ConsoleWorkerNode>>(
      `/operations/worker-nodes/${id}/validate`,
    );
  }

  deleteWorkerNode(id: string) {
    return this.delete<ApiEnvelope<{ id: string; deleted: boolean }>>(
      `/operations/worker-nodes/${id}`,
    );
  }

  createPreviewLink(options: {
    resourceType: string;
    resourceId: string;
    targetUrl: string;
    slug?: string;
    expiresAt?: string;
    metadata?: Record<string, unknown>;
  }) {
    return this.post<ApiEnvelope<ConsolePreviewLink>>(
      "/operations/preview-links",
      options,
    );
  }

  deletePreviewLink(id: string) {
    return this.delete<ApiEnvelope<{ id: string; deleted: boolean }>>(
      `/operations/preview-links/${id}`,
    );
  }

  createCustomDomain(options: {
    resourceType: string;
    resourceId?: string;
    host: string;
    path?: string;
    tlsEnabled?: boolean;
    metadata?: Record<string, unknown>;
  }) {
    return this.post<ApiEnvelope<ConsoleCustomDomain>>(
      "/operations/custom-domains",
      options,
    );
  }

  verifyCustomDomain(id: string) {
    return this.post<ApiEnvelope<ConsoleCustomDomain>>(
      `/operations/custom-domains/${id}/verify`,
    );
  }

  deleteCustomDomain(id: string) {
    return this.delete<ApiEnvelope<{ id: string; deleted: boolean }>>(
      `/operations/custom-domains/${id}`,
    );
  }

  createWorkflowTemplate(options: {
    name: string;
    category: string;
    description?: string;
    template?: Record<string, unknown>;
  }) {
    return this.post<ApiEnvelope<ConsoleWorkflowTemplate>>(
      "/operations/workflow-templates",
      options,
    );
  }

  deleteWorkflowTemplate(id: string) {
    return this.delete<ApiEnvelope<{ id: string; deleted: boolean }>>(
      `/operations/workflow-templates/${id}`,
    );
  }

  createRegion(options: SavedRegionOptions) {
    return this.post<ApiEnvelope<ConsoleSavedRegion>>("/regions", options);
  }

  getOvertureCatalog() {
    return this.get<ApiEnvelope<{ themes: OvertureCatalogTheme[] }>>(
      "/source-imports/overture/catalog",
    );
  }

  createOvertureImport(options: OvertureImportOptions) {
    return this.post<ApiEnvelope<OvertureImportResult>>(
      "/source-imports/overture",
      options,
    );
  }

  publishStyle(styleId: string) {
    return this.post<ApiEnvelope<StylePublishResponse>>(
      `/styles/${styleId}/publish`,
    );
  }

  publishStyleVersion(styleId: string, version: number) {
    return this.post<ApiEnvelope<StylePublishResponse>>(
      `/styles/${styleId}/versions/${version}/publish`,
    );
  }

  publishTilesetVersion(tilesetId: string, version: number) {
    return this.post<ApiEnvelope<ConsoleTileset>>(
      `/tilesets/${tilesetId}/versions/${version}/publish`,
    );
  }

  retryJob(jobId: string) {
    return this.post<ApiEnvelope<ConsoleProcessingJob>>(
      `/jobs/${jobId}/retry`,
    );
  }

  cancelJob(jobId: string) {
    return this.post<ApiEnvelope<ConsoleProcessingJob>>(
      `/jobs/${jobId}/cancel`,
    );
  }

  rebuildTileset(tilesetId: string) {
    return this.post<ApiEnvelope<ConsoleProcessingJob>>(
      `/tilesets/${tilesetId}/rebuild`,
    );
  }

  createTilesetFromDataset(datasetId: string, options: DatasetTilesetOptions) {
    return this.post<ApiEnvelope<DatasetTilesetResult>>(
      `/datasets/${datasetId}/tilesets`,
      options,
    );
  }

  uploadTileset(file: File, options: TilesetUploadOptions) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("options", JSON.stringify(options));
    return this.upload<ApiEnvelope<TilesetUploadResult>>("/uploads", formData);
  }

  async upload<T>(path: string, formData: FormData): Promise<T> {
    const url = `${BASE}${path}`;
    const res = await fetch(url, {
      method: "POST",
      body: formData,
      credentials: "include",
    });

    const json = await res.json();

    if (!res.ok) {
      const err = json as ApiError;
      throw new ApiRequestError(
        err.error?.message || res.statusText,
        res.status,
        err.error?.code || "UNKNOWN",
        err.error?.details,
      );
    }

    return json as T;
  }
}

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export const api = new ApiClient();

function normalizeTilesetUrls(tileset: ConsoleTileset): ConsoleTileset {
  return {
    ...tileset,
    tilejsonUrl: normalizeApiUrl(tileset.tilejsonUrl),
    versionedTilejsonUrl: normalizeApiUrl(tileset.versionedTilejsonUrl),
  };
}

function normalizeDashboardUrls(
  dashboard: ConsoleDashboard,
): ConsoleDashboard {
  return {
    ...dashboard,
    resources: {
      ...dashboard.resources,
      recentStyles: dashboard.resources.recentStyles.map((style) => ({
        ...style,
        publicUrl: normalizeApiUrl(style.publicUrl),
      })),
      recentTilesets: dashboard.resources.recentTilesets.map((tileset) => ({
        ...tileset,
        tilejsonUrl: normalizeApiUrl(tileset.tilejsonUrl),
        versionedTilejsonUrl: normalizeApiUrl(tileset.versionedTilejsonUrl),
      })),
    },
    integration: {
      ...dashboard.integration,
      publicStyleUrl: normalizeApiUrl(dashboard.integration.publicStyleUrl),
      tilejsonUrl: normalizeApiUrl(dashboard.integration.tilejsonUrl),
      mapLibreSnippet:
        dashboard.integration.publicStyleUrl && dashboard.integration.tilejsonUrl
          ? `new maplibregl.Map({\n  container: "map",\n  style: "${normalizeApiUrl(dashboard.integration.publicStyleUrl)}"\n});`
          : dashboard.integration.mapLibreSnippet,
      curlSnippet: dashboard.integration.tilejsonUrl
        ? `curl "${normalizeApiUrl(dashboard.integration.tilejsonUrl)}"`
        : dashboard.integration.curlSnippet,
    },
  };
}

export function normalizeApiUrl(url: string | null) {
  if (!url || /^https?:\/\//.test(url)) return url;
  return `${API_ROOT}${url.startsWith("/") ? url : `/${url}`}`;
}
