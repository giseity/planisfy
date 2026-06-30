/**
 * Thin API client for the Hono backend.
 *
 * In development, requests go through the Next.js rewrite proxy (/api/v1/*)
 * so cookies are same-origin. In production, point directly at the API.
 */

import type {
  ApiEnvelope,
  ConsoleArtifactBackup,
  ConsoleAreaOfInterest,
  ConsoleBasemapBuild,
  ConsoleBasemapBuildDetail,
  ConsoleBasemapRelease,
  ConsoleCustomDomain,
  ConsoleDashboard,
  ConsoleJobTimeline,
  ConsoleNotificationChannel,
  ConsoleOperationsOverview,
  ConsolePreviewLink,
  ConsoleProcessingJob,
  ConsoleProfile,
  ConsoleRootAgentRegistrationToken,
  ConsoleRoutingGraphBuild,
  ConsoleRoutingGraphBuildDetail,
  ConsoleSavedRegion,
  ConsoleScheduledOperation,
  ConsoleSourceImport,
  ConsoleSpriteAsset,
  ConsoleStaleJobReconciliationRun,
  ConsoleTileset,
  ConsoleWorkflowTemplate,
  ConsoleWorkerNode,
  CreateTilesetOptions,
  DatasetTilesetOptions,
  DatasetTilesetResult,
  OvertureCatalogTheme,
  OvertureImportOptions,
  OvertureImportResult,
  PlatformPreflight,
  SavedRegionOptions,
  StylePublishResponse,
  TilesetUploadOptions,
  TilesetUploadResult,
} from "@planisfy/api-contracts";
import { CONSOLE_API_BASE } from "./config";
import { ApiRequestError, type ApiError } from "./errors";
import {
  normalizeDashboardUrls,
  normalizeProfileAvatarUrl,
  normalizeSpriteAssetPreviewUrl,
  normalizeTilesetUrls,
} from "./normalizers";

export type {
  ApiEnvelope,
  ConsoleArtifactBackup,
  ConsoleAreaOfInterest,
  ConsoleBasemapArtifact,
  ConsoleBasemapBuild,
  ConsoleBasemapBuildDetail,
  ConsoleBasemapBuildLog,
  ConsoleBasemapRelease,
  ConsoleCustomDomain,
  ConsoleDashboard,
  ConsoleJobTimeline,
  ConsoleNotificationChannel,
  ConsoleOperationsOverview,
  ConsolePreviewLink,
  ConsoleProcessingJob,
  ConsoleProfile,
  ConsoleRootAgentRegistrationToken,
  ConsoleRoutingGraphArtifact,
  ConsoleRoutingGraphBuild,
  ConsoleRoutingGraphBuildDetail,
  ConsoleRoutingGraphBuildLog,
  ConsoleRoutingGraphRelease,
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
  CreateTilesetOptions,
  DashboardHealthStatus,
  DatasetTilesetOptions,
  DatasetTilesetResult,
  OvertureCatalogTheme,
  OvertureCatalogType,
  OvertureImportOptions,
  OvertureImportResult,
  PlatformCapability,
  PlatformPreflight,
  PlatformPreflightCheck,
  PlatformPreflightStatus,
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
    return this.get<ApiEnvelope<ConsoleProfile>>("/profile").then((res) => ({
      data: normalizeProfileAvatarUrl(res.data),
    }));
  }

  updateProfile(options: {
    displayName?: string;
    handle?: string;
    bio?: string;
  }) {
    return this.put<ApiEnvelope<ConsoleProfile>>("/profile", options).then(
      (res) => ({
        data: normalizeProfileAvatarUrl(res.data),
      }),
    );
  }

  uploadProfileAvatar(file: File) {
    const body = new FormData();
    body.set("file", file);
    return this.formRequest<ApiEnvelope<ConsoleProfile>>(
      "/profile/avatar",
      body,
    ).then((res) => ({
      data: normalizeProfileAvatarUrl(res.data),
    }));
  }

  deleteProfileAvatar() {
    return this.delete<ApiEnvelope<ConsoleProfile>>("/profile/avatar").then(
      (res) => ({
        data: normalizeProfileAvatarUrl(res.data),
      }),
    );
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

  createRootAgentRegistrationToken(options: {
    name: string;
    kind?: ConsoleWorkerNode["kind"];
    metadata?: Record<string, unknown>;
    expiresInHours?: number;
  }) {
    return this.post<ApiEnvelope<ConsoleRootAgentRegistrationToken>>(
      "/operations/root-agent-registration-tokens",
      options,
    );
  }

  listRoutingGraphBuilds() {
    return this.get<ApiEnvelope<ConsoleRoutingGraphBuild[]>>(
      "/operations/routing-graphs",
    );
  }

  createRoutingGraphBuild(options: {
    name: string;
    sourceUrl: string;
    sourcePreset?: string;
    workerNodeId: string;
    activationWorkerNodeId?: string;
    valhallaImage?: string;
    includeAdmins?: boolean;
    includeTimezones?: boolean;
    elevationMode?: "none" | "dem_companion";
    areaOfInterest?: ConsoleAreaOfInterest;
    config?: Record<string, unknown>;
  }) {
    return this.post<ApiEnvelope<ConsoleRoutingGraphBuild>>(
      "/operations/routing-graphs",
      options,
    );
  }

  getRoutingGraphBuild(id: string) {
    return this.get<ApiEnvelope<ConsoleRoutingGraphBuildDetail>>(
      `/operations/routing-graphs/${id}`,
    );
  }

  cancelRoutingGraphBuild(id: string) {
    return this.post<ApiEnvelope<ConsoleRoutingGraphBuild>>(
      `/operations/routing-graphs/${id}/cancel`,
    );
  }

  activateRoutingGraphBuild(id: string, activationWorkerNodeId?: string) {
    return this.post<ApiEnvelope<ConsoleRoutingGraphBuild>>(
      `/operations/routing-graphs/${id}/activate`,
      { activationWorkerNodeId },
    );
  }

  listBasemapBuilds() {
    return this.get<ApiEnvelope<ConsoleBasemapBuild[]>>(
      "/operations/basemap-builds",
    );
  }

  createBasemapBuild(options: {
    name: string;
    sourceUrl: string;
    sourcePreset?: string;
    workerNodeId: string;
    activationWorkerNodeId?: string;
    engine?: "planetiler_osm" | "planetiler_overture";
    sourceKind?: "osm_pbf" | "overture_geoparquet";
    planetilerImage?: string;
    profile?: string;
    outputFormat?: "pmtiles" | "mbtiles";
    areaOfInterest?: ConsoleAreaOfInterest;
    config?: Record<string, unknown>;
  }) {
    return this.post<ApiEnvelope<ConsoleBasemapBuild>>(
      "/operations/basemap-builds",
      options,
    );
  }

  getBasemapBuild(id: string) {
    return this.get<ApiEnvelope<ConsoleBasemapBuildDetail>>(
      `/operations/basemap-builds/${id}`,
    );
  }

  cancelBasemapBuild(id: string) {
    return this.post<ApiEnvelope<ConsoleBasemapBuild>>(
      `/operations/basemap-builds/${id}/cancel`,
    );
  }

  activateBasemapBuild(id: string, activationWorkerNodeId?: string) {
    return this.post<ApiEnvelope<ConsoleBasemapBuild>>(
      `/operations/basemap-builds/${id}/activate`,
      { activationWorkerNodeId },
    );
  }

  promoteBasemapRelease(id: string) {
    return this.post<ApiEnvelope<ConsoleBasemapRelease>>(
      `/operations/basemap-releases/${id}/promote-primary`,
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

  deleteTileset(tilesetId: string) {
    return this.delete<ApiEnvelope<{ id: string; deleted: boolean }>>(
      `/tilesets/${tilesetId}`,
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
