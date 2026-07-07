import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@planisfy/auth/server";
import { db, users } from "@planisfy/database";
import {
  canPlatform,
  hasMinPlatformRole,
  minPlatformRoleFor,
  type PlatformPermission,
  type PlatformRole,
} from "@planisfy/utils";
import { eq } from "drizzle-orm";

/**
 * Verify the current session belongs to an admin or super user.
 * Redirects to sign-in if not authenticated, throws if not admin.
 */
export async function requireAdmin() {
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });

  if (!session?.user) {
    redirect("/sign-in");
  }

  // Check role in the users table
  const [user] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  if (!user || !hasMinPlatformRole(user.role, "ADMIN")) {
    throw new Error("Forbidden: admin access required");
  }

  return {
    userId: session.user.id,
    name: session.user.name,
    email: session.user.email,
    role: user.role,
  };
}

export async function requirePlatformPermission(
  permission: PlatformPermission,
) {
  const admin = await requireAdmin();
  if (!canPlatform(admin.role, permission)) {
    throw new Error(
      `Forbidden: ${permission} requires ${minPlatformRoleFor(permission)} access`,
    );
  }
  return admin;
}

export async function requirePlatformRole(minRole: PlatformRole) {
  const admin = await requireAdmin();
  if (!hasMinPlatformRole(admin.role, minRole)) {
    throw new Error(`Forbidden: ${minRole} access required`);
  }
  return admin;
}
