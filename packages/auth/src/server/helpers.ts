import { and, eq } from "drizzle-orm";
import { db, members, sessions } from "@planisfy/database";
import { hasMinOrgRole, type OrgRole } from "@planisfy/utils";

// ============================================================================
// getActiveOwnerId — resolves the "who owns this resource?" question
//
// If the user has an active org selected in their session, resources are
// owned by that org. Otherwise, resources are owned by the user personally.
//
// Usage in server actions:
//   const ownerId = await getActiveOwnerId(sessionToken);
//   await db.insert(styles).values({ ownerId, ... });
// ============================================================================

export async function getActiveOwnerId(sessionToken: string): Promise<string> {
  const [session] = await db
    .select({
      userId: sessions.userId,
      activeOrganizationId: sessions.activeOrganizationId,
    })
    .from(sessions)
    .where(eq(sessions.token, sessionToken))
    .limit(1);

  if (!session) {
    throw new Error("Invalid session");
  }

  return session.activeOrganizationId ?? session.userId;
}

// ============================================================================
// requireOrgRole — enforce that a user has at least `minRole` in an org
//
// Throws if the user is not a member or their role is below minRole.
// Returns the actual role on success (useful for conditional UI logic).
//
// Usage in server actions:
//   await requireOrgRole(userId, orgId, "admin");
// ============================================================================

export async function requireOrgRole(
  userId: string,
  orgId: string,
  minRole: OrgRole,
): Promise<string> {
  const [membership] = await db
    .select({ role: members.role })
    .from(members)
    .where(and(eq(members.userId, userId), eq(members.organizationId, orgId)))
    .limit(1);

  if (!membership) {
    throw new Error("Not a member of this organization");
  }

  if (!hasMinOrgRole(membership.role, minRole)) {
    throw new Error(
      `Insufficient permissions: requires ${minRole}, have ${membership.role}`,
    );
  }

  return membership.role;
}
