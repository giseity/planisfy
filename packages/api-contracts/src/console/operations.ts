import type { ConsoleProcessingJob } from "./resources";

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
  recentJobs: ConsoleProcessingJob[];
  notificationChannels: ConsoleNotificationChannel[];
  scheduledOperations: ConsoleScheduledOperation[];
  artifactBackups: ConsoleArtifactBackup[];
  workerNodes: ConsoleWorkerNode[];
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

export interface ProcessingEstimate {
  minSeconds: number;
  maxSeconds: number;
  confidence: "low" | "medium" | "high";
  basis: string[];
}
