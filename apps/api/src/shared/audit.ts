import { db, auditEvents } from '@planisfy/database'

interface AuditParams {
  accountId: string
  actorUserId?: string
  requestId?: string
  outcome?: 'SUCCESS' | 'FAILURE'
  action: string
  resourceType: string
  resourceId?: string
  metadata?: Record<string, unknown>
  ipAddress?: string
}

/**
 * Persist an audit event. Callers must await this before reporting success.
 */
export async function logAudit(params: AuditParams): Promise<void> {
  await db.insert(auditEvents).values({
    accountId: params.accountId,
    actorUserId: params.actorUserId ?? null,
    requestId: params.requestId ?? null,
    outcome: params.outcome ?? 'SUCCESS',
    action: params.action,
    resourceType: params.resourceType,
    resourceId: params.resourceId ?? null,
    metadata: params.metadata ?? null,
    ipAddress: params.ipAddress ?? null,
  })
}
