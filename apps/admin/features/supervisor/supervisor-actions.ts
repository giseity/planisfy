"use server";

import { revalidatePath } from "next/cache";

import { requirePlatformRole } from "@/features/auth/admin-auth";
import {
  activeDeploymentMode,
  runSupervisorApply,
  runSupervisorBackup,
  runSupervisorPreflight,
  runSupervisorRollback,
} from "@/features/supervisor/supervisor";

export async function supervisorPreflightAction() {
  await requirePlatformRole("OWNER");
  assertSelfHostSupervisorMode();
  await runSupervisorPreflight();
  revalidatePath("/upgrade");
}

export async function supervisorBackupAction() {
  await requirePlatformRole("OWNER");
  assertSelfHostSupervisorMode();
  await runSupervisorBackup();
  revalidatePath("/upgrade");
}

export async function supervisorApplyAction(formData: FormData) {
  await requirePlatformRole("OWNER");
  assertSelfHostSupervisorMode();
  await runSupervisorApply({
    backupOperationId: requireString(formData, "backupOperationId"),
    manifestPath: requireString(formData, "manifestPath"),
  });
  revalidatePath("/upgrade");
}

export async function supervisorRollbackAction(formData: FormData) {
  await requirePlatformRole("OWNER");
  assertSelfHostSupervisorMode();
  await runSupervisorRollback({
    backupDir: requireString(formData, "backupDir"),
    manifestPath: requireString(formData, "manifestPath"),
  });
  revalidatePath("/upgrade");
}

function assertSelfHostSupervisorMode() {
  if (activeDeploymentMode() !== "self_host") {
    throw new Error("Self-host supervisor actions are unavailable in managed mode.");
  }
}

function requireString(formData: FormData, key: string) {
  const value = formData.get(key);
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing ${key}`);
  }
  return value.trim();
}
