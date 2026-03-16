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
    // API key context (set by apiKeyMiddleware, may be null)
    apiKeyId: string | null;
    apiKeyOwnerId: string | null;
    apiKeyScopes: string[] | null;
    // Request ID for correlation
    requestId: string;
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
  const rawToken =
    getCookie(c, "better-auth.session_token") ||
    c.req.header("authorization")?.replace("Bearer ", "");

  if (!rawToken) {
    return c.json({ error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, 401);
  }

  // better-auth stores the cookie as "{token}.{signature}" but
  // the sessions table only stores the token portion.
  const token = rawToken.split(".")[0]!;

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

/**
 * Dual auth middleware: accepts either API key (X-API-Key) or session cookie.
 * API key takes priority. If neither is present, returns 401.
 *
 * For public API endpoints (/tiles, /styles, /geocoding, etc.)
 */
export const dualAuthMiddleware = createMiddleware<AuthEnv>(async (c, next) => {
  // Check if API key was validated by apiKeyMiddleware
  const apiKeyOwnerId = c.get("apiKeyOwnerId");
  if (apiKeyOwnerId) {
    // API key auth: use the key owner as the identity
    c.set("userId", apiKeyOwnerId);
    c.set("ownerId", apiKeyOwnerId);
    c.set("session", {
      id: "api-key",
      userId: apiKeyOwnerId,
      token: "",
      activeOrganizationId: null,
    });
    await next();
    return;
  }

  // Fall back to session cookie
  const rawToken =
    getCookie(c, "better-auth.session_token") ||
    c.req.header("authorization")?.replace("Bearer ", "");

  if (!rawToken) {
    return c.json(
      { error: { code: "UNAUTHORIZED", message: "API key or session required" } },
      401
    );
  }

  const token = rawToken.split(".")[0]!;

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
    return c.json(
      { error: { code: "UNAUTHORIZED", message: "Invalid or expired session" } },
      401
    );
  }

  c.set("userId", session.userId);
  c.set("session", session);
  c.set("ownerId", session.activeOrganizationId ?? session.userId);

  await next();
});
