import { createMiddleware } from "hono/factory";
import { db, sessions, users } from "@planisfy/database";
import { eq, and, gt } from "drizzle-orm";
import { getCookie } from "hono/cookie";

export type AuthEnv = {
  Variables: {
    userId: string;
    ownerId: string;
    session: {
      id: string;
      userId: string;
      token: string;
      activeOrganizationId: string | null;
    };
  };
};

/**
 * Validates the better-auth session cookie by looking up the token directly
 * in the sessions table. This avoids better-auth's origin/baseURL checks
 * that fail when the API is on a different port than the console.
 *
 * ownerId = activeOrganizationId ?? userId
 */
export const authMiddleware = createMiddleware<AuthEnv>(async (c, next) => {
  const token =
    getCookie(c, "better-auth.session_token") ||
    c.req.header("authorization")?.replace("Bearer ", "");

  if (!token) {
    return c.json({ error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  const [session] = await db
    .select({
      id: sessions.id,
      userId: sessions.userId,
      token: sessions.token,
      expiresAt: sessions.expiresAt,
      activeOrganizationId: sessions.activeOrganizationId,
    })
    .from(sessions)
    .where(and(eq(sessions.token, token), gt(sessions.expiresAt, new Date())))
    .limit(1);

  if (!session) {
    return c.json({ error: { code: "UNAUTHORIZED", message: "Invalid or expired session" } }, 401);
  }

  c.set("userId", session.userId);
  c.set("session", session);
  c.set("ownerId", session.activeOrganizationId ?? session.userId);

  await next();
});
