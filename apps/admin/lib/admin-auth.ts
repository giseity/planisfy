import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@planisfy/auth/auth"
import { db, users } from "@planisfy/database"
import { eq } from "drizzle-orm"

/**
 * Verify the current session belongs to an admin or super user.
 * Redirects to sign-in if not authenticated, throws if not admin.
 */
export async function requireAdmin() {
  const h = await headers()
  const session = await auth.api.getSession({ headers: h })

  if (!session?.user) {
    redirect("/sign-in")
  }

  // Check role in the users table
  const [user] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1)

  if (!user || (user.role !== "ADMIN" && user.role !== "SUPER")) {
    throw new Error("Forbidden: admin access required")
  }

  return {
    userId: session.user.id,
    name: session.user.name,
    email: session.user.email,
    role: user.role,
  }
}
