import { db, auditEvents } from "@planisfy/database";

interface AuditParams {
  profileId: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}

/**
 * Fire-and-forget audit event logging.
 * Errors are logged but never propagated to the caller.
 */
export function logAudit(params: AuditParams): void {
  db.insert(auditEvents)
    .values({
      profileId: params.profileId,
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId ?? null,
      metadata: params.metadata ?? null,
      ipAddress: params.ipAddress ?? null,
    })
    .catch((err: unknown) => {
      console.error("[audit] Failed to log event:", err);
    });
}
