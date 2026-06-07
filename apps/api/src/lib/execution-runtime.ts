import { and, eq, isNull } from "drizzle-orm";
import {
  db,
  executionTargets,
  workerProfiles,
} from "@planisfy/database";
import { env } from "../env";
import { customerComputeMutationGate } from "./platform-gates";

export class ExecutionRuntimeSelectionError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 404,
  ) {
    super(message);
    this.name = "ExecutionRuntimeSelectionError";
  }
}

export async function resolveExecutionRuntimeSelection(
  accountId: string,
  selection: {
    executionTargetId?: string | null;
    workerProfileId?: string | null;
  },
) {
  const executionTargetId = selection.executionTargetId ?? null;
  const workerProfileId = selection.workerProfileId ?? null;

  const managedSelectionDenial =
    executionTargetId || workerProfileId
      ? customerComputeMutationGate(env.DEPLOYMENT_MODE)
      : null;
  if (managedSelectionDenial) {
    throw new ExecutionRuntimeSelectionError(
      managedSelectionDenial.code,
      managedSelectionDenial.message,
      managedSelectionDenial.status,
    );
  }

  if (executionTargetId) {
    const [target] = await db
      .select({ id: executionTargets.id })
      .from(executionTargets)
      .where(
        and(
          eq(executionTargets.id, executionTargetId),
          eq(executionTargets.accountId, accountId),
          isNull(executionTargets.deletedAt),
        ),
      )
      .limit(1);

    if (!target) {
      throw new ExecutionRuntimeSelectionError(
        "EXECUTION_TARGET_NOT_FOUND",
        "Execution target not found",
      );
    }
  }

  if (workerProfileId) {
    const [profile] = await db
      .select({ id: workerProfiles.id })
      .from(workerProfiles)
      .where(
        and(
          eq(workerProfiles.id, workerProfileId),
          eq(workerProfiles.accountId, accountId),
          isNull(workerProfiles.deletedAt),
        ),
      )
      .limit(1);

    if (!profile) {
      throw new ExecutionRuntimeSelectionError(
        "WORKER_PROFILE_NOT_FOUND",
        "Worker profile not found",
      );
    }
  }

  return { executionTargetId, workerProfileId };
}
