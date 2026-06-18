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
  operations: {
    alerts: Array<{
      id: string;
      severity: "info" | "warning" | "critical";
      title: string;
      message: string;
      actionLabel?: string;
      actionHref?: string;
    }>;
    unhealthyServices: number;
    jobSignals: {
      staleRunningJobs: number;
      failedJobs: number;
      recentFailures: Array<{
        id: string;
        type: string;
        errorCode: string | null;
        errorMessage: string | null;
        updatedAt: string;
        tilesetId: string | null;
      }>;
    };
  };
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
