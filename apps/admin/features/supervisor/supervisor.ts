import { unstable_noStore as noStore } from "next/cache";
import type { AdminDeploymentMode } from "@/features/navigation/admin-navigation";

export type SupervisorOperation = {
  id: string;
  type: "preflight" | "backup" | "upgrade.apply" | "upgrade.rollback";
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED";
  startedAt: string;
  completedAt?: string;
  logs: string[];
  error?: string;
  backupDir?: string;
  targetVersion?: string;
};

export type SupervisorVersion = {
  version: string;
  rootDir: string;
  composeFile: string;
};

export type UpgradeCenterData = {
  deploymentMode: AdminDeploymentMode;
  configured: boolean;
  error: string | null;
  version: SupervisorVersion | null;
  operations: SupervisorOperation[];
  latestBackup: SupervisorOperation | null;
  activeOperation: SupervisorOperation | null;
};

type SupervisorEnvelope<T> = { data: T };

export async function getUpgradeCenterData(): Promise<UpgradeCenterData> {
  noStore();
  const deploymentMode = activeDeploymentMode();
  if (deploymentMode !== "self_host") {
    return {
      activeOperation: null,
      configured: false,
      deploymentMode,
      error: "Self-host supervisor upgrades are not available in managed mode.",
      latestBackup: null,
      operations: [],
      version: null,
    };
  }

  if (!isSupervisorConfigured()) {
    return {
      activeOperation: null,
      configured: false,
      deploymentMode,
      error: "SUPERVISOR_URL and SUPERVISOR_TOKEN are not configured.",
      latestBackup: null,
      operations: [],
      version: null,
    };
  }

  try {
    const [version, operations] = await Promise.all([
      supervisorRequest<SupervisorVersion>("/version"),
      supervisorRequest<SupervisorOperation[]>("/operations"),
    ]);
    const latestBackup =
      operations.find(
        (operation) =>
          operation.type === "backup" && operation.status === "SUCCEEDED",
      ) ?? null;
    const activeOperation =
      operations.find(
        (operation) =>
          operation.status === "RUNNING" || operation.status === "PENDING",
      ) ?? operations[0] ?? null;

    return {
      activeOperation,
      configured: true,
      deploymentMode,
      error: null,
      latestBackup,
      operations,
      version,
    };
  } catch (error) {
    return {
      activeOperation: null,
      configured: true,
      deploymentMode,
      error: error instanceof Error ? error.message : "Supervisor unavailable.",
      latestBackup: null,
      operations: [],
      version: null,
    };
  }
}

export function activeDeploymentMode(): AdminDeploymentMode {
  return process.env.DEPLOYMENT_MODE === "managed" ? "managed" : "self_host";
}

export async function runSupervisorPreflight() {
  return supervisorRequest<SupervisorOperation>("/preflight", {
    method: "POST",
  });
}

export async function runSupervisorBackup() {
  return supervisorRequest<SupervisorOperation>("/backup", {
    method: "POST",
  });
}

export async function runSupervisorApply(options: {
  manifestPath: string;
  backupOperationId: string;
}) {
  return supervisorRequest<SupervisorOperation>("/upgrade/apply", {
    body: JSON.stringify(options),
    method: "POST",
  });
}

export async function runSupervisorRollback(options: {
  manifestPath: string;
  backupDir: string;
}) {
  return supervisorRequest<SupervisorOperation>("/upgrade/rollback", {
    body: JSON.stringify(options),
    method: "POST",
  });
}

function isSupervisorConfigured() {
  return Boolean(process.env.SUPERVISOR_URL && process.env.SUPERVISOR_TOKEN);
}

async function supervisorRequest<T>(path: string, init: RequestInit = {}) {
  const baseUrl = process.env.SUPERVISOR_URL;
  const token = process.env.SUPERVISOR_TOKEN;
  if (!baseUrl || !token) {
    throw new Error("Supervisor is not configured.");
  }

  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${token}`);
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    cache: "no-store",
    headers,
  });
  const json = (await response.json()) as
    | SupervisorEnvelope<T>
    | { error?: { message?: string } };

  if (!response.ok || !("data" in json)) {
    throw new Error(
      "error" in json && json.error?.message
        ? json.error.message
        : `Supervisor request failed with ${response.status}`,
    );
  }

  return json.data;
}
