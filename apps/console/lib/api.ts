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
}

export interface TilesetUploadOptions {
  name: string;
  handle: string;
  description?: string;
  minZoom?: number;
  maxZoom?: number;
  csvLatitude?: string;
  csvLongitude?: string;
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
}

export interface DatasetTilesetResult {
  dataset: unknown;
  datasetVersion: unknown;
  tileset: ConsoleTileset;
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
