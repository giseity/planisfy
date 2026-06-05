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
    : (process.env.API_URL || "http://localhost:4000") + "/console";
const API_ROOT = BASE.replace(/\/console\/?$/, "");

interface ApiError {
  error: { code: string; message: string; details?: unknown };
}

export interface ApiEnvelope<T> {
  data: T;
}

export interface ConsoleSource {
  id: string;
  name: string;
  handle: string;
  type: "VECTOR" | "RASTER" | "GEOJSON" | "IMAGE" | "VIDEO" | string;
  url: string;
  status: string;
  minZoom: number | null;
  maxZoom: number | null;
  bounds: unknown;
  createdAt: string;
  updatedAt: string;
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
  format: string;
  schema: {
    vector_layers?: ConsoleVectorLayer[];
  } | null;
  bounds: unknown;
  minZoom: number | null;
  maxZoom: number | null;
  createdAt: string;
  publishedAt: string | null;
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
  versions: ConsoleTilesetVersion[];
  latestVersion: ConsoleTilesetVersion | null;
  currentVersion: ConsoleTilesetVersion | null;
  isPublished: boolean;
  tilejsonUrl: string | null;
  versionedTilejsonUrl: string | null;
  createdAt: string;
  updatedAt: string;
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

export interface SourceUploadResult {
  ok: boolean;
  sourceId: string;
  status: string;
  message: string;
  processingJobId?: string;
  uploadId?: string;
}

export interface ProcessingJobLog {
  id: string;
  level: "info" | "warning" | "error" | string;
  message: string;
  metadata?: unknown;
  createdAt: string;
}

export interface SourceProcessingStatus {
  id: string;
  sourceId: string;
  uploadId?: string | null;
  status: string;
  progress: number;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
  logs: ProcessingJobLog[];
}

export interface StylePublishResponse {
  id: string;
  handle: string;
  name: string;
  isPublic: boolean;
  version: number;
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

  listSources() {
    return this.get<ConsoleSource[]>("/sources");
  }

  async listTilesets() {
    const envelope = await this.get<ApiEnvelope<ConsoleTileset[]>>("/tilesets");
    return {
      ...envelope,
      data: envelope.data.map(normalizeTilesetUrls),
    };
  }

  uploadSource(sourceId: string, formData: FormData) {
    return this.upload<SourceUploadResult>(
      `/sources/${sourceId}/upload`,
      formData,
    );
  }

  getSourceProcessing(sourceId: string) {
    return this.get<ApiEnvelope<SourceProcessingStatus | null>>(
      `/sources/${sourceId}/processing`,
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

function normalizeApiUrl(url: string | null) {
  if (!url || /^https?:\/\//.test(url)) return url;
  return `${API_ROOT}${url.startsWith("/") ? url : `/${url}`}`;
}
