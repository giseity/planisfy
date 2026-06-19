import { Hono } from "hono";
import { and, desc, eq, inArray, or, like } from "drizzle-orm";
import { auditEvents, db } from "@planisfy/database";
import type { AuthEnv } from "../../middleware/auth";
import { requireOrgPermission } from "../../middleware/auth";

export const securityRoute = new Hono<AuthEnv>();

securityRoute.use("/security/activity", requireOrgPermission("members.manage"));

const securityResourceTypes = [
  "account",
  "api_key",
  "auth",
  "profile",
  "security",
  "session",
];

type SecurityActivityRow = typeof auditEvents.$inferSelect;

export function serializeSecurityActivity(row: SecurityActivityRow) {
  return {
    id: row.id,
    action: row.action,
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    metadata: row.metadata,
    ipAddress: row.ipAddress,
    timestamp: row.timestamp.toISOString(),
  };
}

securityRoute.get("/security/activity", async (c) => {
  const ownerId = c.get("ownerId");

  const rows = await db
    .select()
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.profileId, ownerId),
        or(
          inArray(auditEvents.resourceType, securityResourceTypes),
          like(auditEvents.action, "auth.%"),
          like(auditEvents.action, "login.%"),
          like(auditEvents.action, "password.%"),
          like(auditEvents.action, "security.%"),
          like(auditEvents.action, "session.%"),
        ),
      ),
    )
    .orderBy(desc(auditEvents.timestamp))
    .limit(25);

  return c.json({ data: rows.map(serializeSecurityActivity) });
});
