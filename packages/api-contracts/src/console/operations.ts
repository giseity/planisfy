import type { ConsoleProcessingJob } from "./resources";
import type { ConsoleAreaOfInterest } from "./aoi";
import type { DeploymentMode } from "@planisfy/platform-policy";

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

export type RoutingGraphBuildStatus =
  | "queued"
  | "assigned"
  | "preparing"
  | "downloading_source"
  | "building_admins"
  | "building_tiles"
  | "packaging"
  | "uploading"
  | "succeeded"
  | "failed"
  | "canceling"
  | "canceled";

export type RoutingGraphActivationStatus =
  | "inactive"
  | "activation_requested"
  | "activating"
  | "active"
  | "failed";

export type RoutingGraphArtifactStatus =
  | "pending"
  | "uploading"
  | "available"
  | "failed"
  | "activated";

export type RoutingGraphReleaseStatus = "draft" | "published" | "deprecated";

export interface ConsoleRoutingGraphBuild {
  id: string;
  accountId: string;
  name: string;
  status: RoutingGraphBuildStatus;
  activationStatus: RoutingGraphActivationStatus;
  progress: number;
  workerNodeId: string | null;
  activationWorkerNodeId: string | null;
  sourceUrl: string;
  sourcePreset: string | null;
  valhallaImage: string;
  includeAdmins: boolean;
  includeTimezones: boolean;
  elevationMode: "none" | "dem_companion" | string;
  areaOfInterest?: ConsoleAreaOfInterest;
  config: Record<string, unknown>;
  output: Record<string, unknown>;
  errorCode: string | null;
  errorMessage: string | null;
  cancelRequestedAt: string | null;
  assignedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  activatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConsoleRoutingGraphArtifact {
  id: string;
  accountId: string;
  buildId: string;
  storageObjectId: string | null;
  kind: string;
  status: RoutingGraphArtifactStatus;
  fileName: string;
  size: number | null;
  checksumSha256: string | null;
  manifest: Record<string, unknown>;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConsoleRoutingGraphBuildLog {
  id: string;
  buildId: string;
  level: string;
  message: string;
  metadata: unknown;
  createdAt: string;
}

export interface ConsoleRoutingGraphBuildDetail {
  build: ConsoleRoutingGraphBuild;
  artifacts: ConsoleRoutingGraphArtifact[];
  releases: ConsoleRoutingGraphRelease[];
  logs: ConsoleRoutingGraphBuildLog[];
}

export interface ConsoleRoutingGraphRelease {
  id: string;
  accountId: string;
  buildId: string;
  artifactId: string | null;
  name: string;
  version: string;
  status: RoutingGraphReleaseStatus;
  activationStatus: RoutingGraphActivationStatus;
  sourceDataVersions: Record<string, unknown>;
  manifest: Record<string, unknown>;
  activatedAt: string | null;
  publishedAt: string | null;
  deprecatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type BasemapBuildStatus =
  | "queued"
  | "assigned"
  | "preparing"
  | "downloading_source"
  | "building_tiles"
  | "packaging"
  | "uploading"
  | "succeeded"
  | "failed"
  | "canceling"
  | "canceled";

export type BasemapActivationStatus =
  | "inactive"
  | "activation_requested"
  | "activating"
  | "active"
  | "failed";

export type BasemapArtifactStatus =
  | "pending"
  | "uploading"
  | "available"
  | "failed"
  | "activated";

export type BasemapReleaseStatus = "draft" | "published" | "deprecated";

export interface ConsoleBasemapBuild {
  id: string;
  accountId: string;
  name: string;
  status: BasemapBuildStatus;
  activationStatus: BasemapActivationStatus;
  progress: number;
  workerNodeId: string | null;
  activationWorkerNodeId: string | null;
  engine: "planetiler_osm" | "planetiler_overture" | string;
  sourceKind: "osm_pbf" | "overture_geoparquet" | string;
  sourceUrl: string;
  sourcePreset: string | null;
  planetilerImage: string;
  profile: string;
  outputFormat: "pmtiles" | "mbtiles" | string;
  areaOfInterest: ConsoleAreaOfInterest | null;
  config: Record<string, unknown>;
  output: Record<string, unknown>;
  errorCode: string | null;
  errorMessage: string | null;
  cancelRequestedAt: string | null;
  assignedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  activatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConsoleBasemapArtifact {
  id: string;
  accountId: string;
  buildId: string;
  storageObjectId: string | null;
  kind: string;
  status: BasemapArtifactStatus;
  fileName: string;
  size: number | null;
  checksumSha256: string | null;
  manifest: Record<string, unknown>;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConsoleBasemapRelease {
  id: string;
  accountId: string;
  name: string;
  version: string;
  status: BasemapReleaseStatus;
  activationStatus: BasemapActivationStatus;
  isPrimary: boolean;
  buildId: string | null;
  artifactId: string | null;
  sourceDataVersions: Record<string, unknown>;
  schemaVersion: string | null;
  artifactStorageObjectId: string | null;
  manifestStorageObjectId: string | null;
  bounds: unknown;
  minZoom: number | null;
  maxZoom: number | null;
  attribution: string | null;
  tilejson: Record<string, unknown>;
  styleCompatibility: Record<string, unknown>;
  martinSource: string | null;
  martinSourceVersioned: string | null;
  activationMetadata: Record<string, unknown>;
  buildJobId: string | null;
  activatedAt: string | null;
  publishedAt: string | null;
  deprecatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConsoleBasemapBuildLog {
  id: string;
  buildId: string;
  level: string;
  message: string;
  metadata: unknown;
  createdAt: string;
}

export interface ConsoleBasemapBuildDetail {
  build: ConsoleBasemapBuild;
  artifacts: ConsoleBasemapArtifact[];
  releases: ConsoleBasemapRelease[];
  logs: ConsoleBasemapBuildLog[];
}

export interface ConsoleRuntimeInstallation {
  id: string;
  accountId: string;
  workerNodeId: string | null;
  resourceType: "routing_graph" | "basemap" | string;
  buildId: string | null;
  artifactId: string | null;
  releaseId: string | null;
  status: "installing" | "active" | "failed" | string;
  runtimePath: string | null;
  versionedPath: string | null;
  metadata: Record<string, unknown>;
  errorMessage: string | null;
  installedAt: string | null;
  activatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConsoleRootAgentRegistrationToken {
  token: string;
  expiresAt: string;
  nodeName: string;
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

export interface ConsoleWorkerHealth {
  status: "healthy" | "degraded" | "offline" | string;
  message: string;
  latencyMs: number | null;
  toolchain?: unknown;
}

export interface ConsoleStaleJobReconciliation {
  reconciled: number;
  latest: Array<{
    id: string;
    type: string;
    status: string;
    errorMessage: string | null;
    updatedAt: string;
  }>;
}

export interface ConsoleStaleJobReconciliationRun {
  scanned: number;
  reconciled: number;
  skippedActive: number;
  latest: Array<{
    id: string;
    accountId: string;
    type: string;
    previousStatus: string;
    updatedAt: string;
    queueState: string | null;
    reason: string;
  }>;
}

export interface ConsoleOperationsOverview {
  deploymentMode: DeploymentMode;
  recentJobs: ConsoleProcessingJob[];
  notificationChannels: ConsoleNotificationChannel[];
  scheduledOperations: ConsoleScheduledOperation[];
  artifactBackups: ConsoleArtifactBackup[];
  workerNodes: ConsoleWorkerNode[];
  routingGraphBuilds: ConsoleRoutingGraphBuild[];
  basemapBuilds: ConsoleBasemapBuild[];
  basemapReleases: ConsoleBasemapRelease[];
  runtimeInstallations: ConsoleRuntimeInstallation[];
  previewLinks: ConsolePreviewLink[];
  customDomains: ConsoleCustomDomain[];
  workflowTemplates: ConsoleWorkflowTemplate[];
  workerHealth: ConsoleWorkerHealth;
  staleJobReconciliation: ConsoleStaleJobReconciliation;
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
