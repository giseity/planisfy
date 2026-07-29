import { Hono } from "hono";
import { eq, and, desc, gte, lte, sql } from "drizzle-orm";
import { db, auditEvents, users } from "@planisfy/database";
import { auditQuerySchema } from "@planisfy/api-contracts";
import { queryValidator } from "../../shared/validation/validation";
import type { AuthEnv } from "../../middleware/auth";
import { requireOrgPermission } from "../../middleware/auth";
import { requireManagedPlanFeature } from "../../shared/policy/plan-gates";

const auditBaseRoute = new Hono<AuthEnv>();

auditBaseRoute.use("/audit", requireOrgPermission("members.manage"));
auditBaseRoute.use("/audit", requireManagedPlanFeature("audit"));

// ── GET /console/audit - Audit events for current owner ─────────────────────

export const auditRoute = auditBaseRoute.get(
  "/audit",
  queryValidator(auditQuerySchema),
  async (c) => {
  const ownerId = c.get("ownerId");
  const { page, limit, action, resourceType, from, to } =
    c.req.valid("query");
  const offset = (page - 1) * limit;

  const conditions = [eq(auditEvents.accountId, ownerId)];
  if (action) conditions.push(eq(auditEvents.action, action));
  if (resourceType) conditions.push(eq(auditEvents.resourceType, resourceType));
  if (from) conditions.push(gte(auditEvents.timestamp, new Date(from)));
  if (to) conditions.push(lte(auditEvents.timestamp, new Date(to)));

  const where = and(...conditions);

  const [results, countResult] = await Promise.all([
    db
      .select({
        id: auditEvents.id,
        action: auditEvents.action,
        resourceType: auditEvents.resourceType,
        resourceId: auditEvents.resourceId,
        metadata: auditEvents.metadata,
        ipAddress: auditEvents.ipAddress,
        requestId: auditEvents.requestId,
        outcome: auditEvents.outcome,
        timestamp: auditEvents.timestamp,
        actorUserId: auditEvents.actorUserId,
        actorName: users.name,
      })
      .from(auditEvents)
      .leftJoin(users, eq(auditEvents.actorUserId, users.id))
      .where(where)
      .orderBy(desc(auditEvents.timestamp))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(auditEvents)
      .where(where),
  ]);

  const total = Number(countResult[0]?.count ?? 0);

  return c.json({
    data: results,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
  },
);
