/**
 * Thin API client for the Hono backend.
 *
 * In development, requests go through the Next.js rewrite proxy (/api/v1/*)
 * so cookies are same-origin. In production, point directly at the API.
 */

import type {
  ApiEnvelope,
  ConsoleArtifactBackup,
  ConsoleCustomDomain,
  ConsoleDashboard,
  ConsoleExecutionTarget,
  ConsoleExecutionTargetEnvVar,
  ConsoleJobTimeline,
  ConsoleNotificationChannel,
  ConsoleOperationsOverview,
  ConsolePreviewLink,
  ConsoleProcessingJob,
  ConsoleProfile,
  ConsoleSavedRegion,
  ConsoleScheduledOperation,
  ConsoleSourceImport,
  ConsoleSpriteAsset,
  ConsoleStaleJobReconciliationRun,
  ConsoleTileset,
  ConsoleWorkflowTemplate,
  ConsoleWorkerNode,
  ConsoleWorkerProfile,
  CreateTilesetOptions,
  DatasetTilesetOptions,
  DatasetTilesetResult,
  ExecutionTargetAuthMode,
  ExecutionTargetProvider,
  OvertureCatalogTheme,
  OvertureImportOptions,
  OvertureImportResult,
  PlatformPreflight,
  ProcessingEstimate,
  SavedRegionOptions,
  StylePublishResponse,
  TilesetUploadOptions,
  TilesetUploadResult,
} from "@planisfy/api-contracts";
import { CONSOLE_API_BASE } from "./config";
import { ApiRequestError, type ApiError } from "./errors";
import {
  normalizeDashboardUrls,
  normalizeSpriteAssetPreviewUrl,
  normalizeTilesetUrls,
} from "./normalizers";

export type {
  ApiEnvelope,
  ConsoleArtifactBackup,
  ConsoleCustomDomain,
  ConsoleDashboard,
  ConsoleExecutionTarget,
  ConsoleExecutionTargetEnvVar,
  ConsoleJobTimeline,
  ConsoleNotificationChannel,
  ConsoleOperationsOverview,
  ConsolePreviewLink,
  ConsoleProcessingJob,
  ConsoleProfile,
  ConsoleSavedRegion,
  ConsoleScheduledOperation,
  ConsoleSourceImport,
  ConsoleSpriteAsset,
  ConsoleStaleJobReconciliationRun,
  ConsoleTileset,
  ConsoleTilesetVersion,
  ConsoleUploadValidation,
  ConsoleWorkflowTemplate,
  ConsoleWorkerNode,
  ConsoleWorkerProfile,
  CreateTilesetOptions,
  DashboardHealthStatus,
  DatasetTilesetOptions,
  DatasetTilesetResult,
  ExecutionTargetAuthMode,
  ExecutionTargetProvider,
  OvertureCatalogTheme,
  OvertureCatalogType,
  OvertureImportOptions,
  OvertureImportResult,
  PlatformCapability,
  PlatformPreflight,
  PlatformPreflightCheck,
  PlatformPreflightStatus,
  ProcessingEstimate,
  SavedRegionOptions,
  StylePublishResponse,
  TilesetUploadOptions,
  TilesetUploadResult,
} from "@planisfy/api-contracts";

class ApiClient {
  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${CONSOLE_API_BASE}${path}`;
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

  private async formRequest<T>(path: string, body: FormData): Promise<T> {
    const res = await fetch(`${CONSOLE_API_BASE}${path}`, {
      method: "POST",
      body,
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

  getSpriteAssets() {
    return this.get<ApiEnvelope<ConsoleSpriteAsset[]>>("/sprite-assets").then(
      (res) => ({
        data: res.data.map(normalizeSpriteAssetPreviewUrl),
      }),
    );
  }

  uploadSpriteAsset(options: {
    name: string;
    file: File;
    folder?: string;
    description?: string | null;
    tags?: string[];
  }) {
    const body = new FormData();
    body.set("name", options.name);
    if (options.folder) body.set("folder", options.folder);
    if (options.description) body.set("description", options.description);
    if (options.tags?.length) body.set("tags", JSON.stringify(options.tags));
    body.set("file", options.file);
    return this.formRequest<ApiEnvelope<ConsoleSpriteAsset>>(
      "/sprite-assets",
      body,
    ).then((res) => ({
      data: normalizeSpriteAssetPreviewUrl(res.data),
    }));
  }

  updateSpriteAsset(
    id: string,
    options: {
      name?: string;
      folder?: string;
      description?: string | null;
      tags?: string[];
    },
  ) {
    return this.patch<ApiEnvelope<ConsoleSpriteAsset>>(
      `/sprite-assets/${id}`,
      options,
    ).then((res) => ({
      data: normalizeSpriteAssetPreviewUrl(res.data),
    }));
  }

  renameSpriteAsset(id: string, name: string) {
    return this.updateSpriteAsset(id, { name });
  }

  deleteSpriteAsset(id: string) {
    return this.delete<ApiEnvelope<{ id: string; deleted: boolean }>>(
      `/sprite-assets/${id}`,
    );
  }

  getProfile() {
    return this.get<ApiEnvelope<ConsoleProfile>>("/profile");
  }

  async getDashboard() {
    const envelope =
      await this.get<ApiEnvelope<ConsoleDashboard>>("/dashboard");
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

  reconcileStaleJobs() {
    return this.post<ApiEnvelope<ConsoleStaleJobReconciliationRun>>(
      "/operations/jobs/reconcile-stale",
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
    return this.post<
      ApiEnvelope<{
        delivered: boolean;
        message: string;
        status?: number;
        code?: string;
      }>
    >(`/operations/notification-channels/${id}/test`);
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
    return this.post<
      ApiEnvelope<{ schedule: ConsoleScheduledOperation; queued: boolean }>
    >(`/operations/schedules/${id}/run`);
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

  applyWorkflowTemplate(id: string, values?: Record<string, unknown>) {
    return this.post<
      ApiEnvelope<{
        applied: boolean;
        category: string;
        status?: string;
        message?: string;
      }>
    >(`/operations/workflow-templates/${id}/apply`, { values: values ?? {} });
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
    return this.post<ApiEnvelope<ConsoleProcessingJob>>(`/jobs/${jobId}/retry`);
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

  createTileset(options: CreateTilesetOptions) {
    return this.post<ApiEnvelope<ConsoleTileset>>("/tilesets", options).then(
      (res) => ({
        data: normalizeTilesetUrls(res.data),
      }),
    );
  }

  buildTilesetFromDataset(tilesetId: string, options: DatasetTilesetOptions) {
    return this.post<ApiEnvelope<DatasetTilesetResult>>(
      `/tilesets/${tilesetId}/dataset-builds`,
      options,
    );
  }

  uploadTileset(tilesetId: string, file: File, options: TilesetUploadOptions) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("options", JSON.stringify(options));
    return this.upload<ApiEnvelope<TilesetUploadResult>>(
      `/tilesets/${tilesetId}/uploads`,
      formData,
    );
  }

  async upload<T>(path: string, formData: FormData): Promise<T> {
    const url = `${CONSOLE_API_BASE}${path}`;
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

export const api = new ApiClient();
export { ApiRequestError } from "./errors";
export { normalizeApiUrl } from "./normalizers";
