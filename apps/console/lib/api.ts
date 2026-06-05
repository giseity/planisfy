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

  listSources() {
    return this.get<ConsoleSource[]>("/sources");
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
