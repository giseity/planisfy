import { Hono } from "hono";
import { z } from "zod";
import { eq, and, desc, gte, lte, sql } from "drizzle-orm";
import { db, auditEvents, accounts } from "@planisfy/database";
import type { AuthEnv } from "../middleware/auth";

export const auditRoute = new Hono<AuthEnv>();

const querySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  action: z.string().optional(),
  resourceType: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

// ── GET /console/audit — Audit events for current owner ─────────────────────

auditRoute.get("/audit", async (c) => {
  const ownerId = c.get("ownerId");
  const query = querySchema.safeParse(c.req.query());

  if (!query.success) {
    return c.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid query", details: query.error.flatten() } },
      400
    );
  }

  const { page, limit, action, resourceType, from, to } = query.data;
  const offset = (page - 1) * limit;

  const conditions = [eq(auditEvents.profileId, ownerId)];
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
        timestamp: auditEvents.timestamp,
        actorName: accounts.displayName,
      })
      .from(auditEvents)
      .leftJoin(accounts, eq(auditEvents.profileId, accounts.id))
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
});
