"use server";

import { revalidatePath } from "next/cache";

import { requirePlatformRole } from "@/lib/admin-auth";
import {
  runSupervisorApply,
  runSupervisorBackup,
  runSupervisorPreflight,
  runSupervisorRollback,
} from "@/lib/supervisor";

export async function supervisorPreflightAction() {
  await requirePlatformRole("OWNER");
  await runSupervisorPreflight();
  revalidatePath("/upgrade");
}

export async function supervisorBackupAction() {
  await requirePlatformRole("OWNER");
  await runSupervisorBackup();
  revalidatePath("/upgrade");
}

export async function supervisorApplyAction(formData: FormData) {
  await requirePlatformRole("OWNER");
  await runSupervisorApply({
    backupOperationId: requireString(formData, "backupOperationId"),
    manifestPath: requireString(formData, "manifestPath"),
  });
  revalidatePath("/upgrade");
}

export async function supervisorRollbackAction(formData: FormData) {
  await requirePlatformRole("OWNER");
  await runSupervisorRollback({
    backupDir: requireString(formData, "backupDir"),
    manifestPath: requireString(formData, "manifestPath"),
  });
  revalidatePath("/upgrade");
}

function requireString(formData: FormData, key: string) {
  const value = formData.get(key);
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing ${key}`);
  }
  return value.trim();
}
