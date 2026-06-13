import { createMiddleware } from "hono/factory";
import type { Context } from "hono";
import { db, members, sessions } from "@planisfy/database";
import { eq, and, gt } from "drizzle-orm";
import { getCookie } from "hono/cookie";

const ORG_ROLE_RANK: Record<string, number> = {
  viewer: 0,
  member: 1,
  admin: 2,
  owner: 3,
};

export type OrgRole = keyof typeof ORG_ROLE_RANK;

type SessionContext = {
  id: string;
  userId: string;
  token: string;
  activeOrganizationId: string | null;
};

export type AuthEnv = {
  Variables: {
    userId: string;
    ownerId: string;
    orgRole: string | null;
    session: SessionContext;
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
    getBetterAuthSessionCookie(c) ||
    c.req.header("authorization")?.replace("Bearer ", "");

  if (!rawToken) {
    return c.json(
      { error: { code: "UNAUTHORIZED", message: "Not authenticated" } },
      401,
    );
  }

  const session = await findValidSession(rawToken);
  if (!session) {
    return c.json(
      {
        error: { code: "UNAUTHORIZED", message: "Invalid or expired session" },
      },
      401,
    );
  }

  const ownerContext = await resolveSessionOwnerContext(session);
  if (!ownerContext.ok) {
    return c.json(
      {
        error: {
          code: "FORBIDDEN",
          message: ownerContext.message,
        },
      },
      403,
    );
  }

  setSessionContext(c, session, ownerContext);

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
    c.set("orgRole", null);
    await next();
    return;
  }

  // Fall back to session cookie
  const rawToken =
    getBetterAuthSessionCookie(c) ||
    c.req.header("authorization")?.replace("Bearer ", "");

  if (!rawToken) {
    return c.json(
      {
        error: { code: "UNAUTHORIZED", message: "API key or session required" },
      },
      401,
    );
  }

  const session = await findValidSession(rawToken);
  if (!session) {
    return c.json(
      {
        error: { code: "UNAUTHORIZED", message: "Invalid or expired session" },
      },
      401,
    );
  }

  const ownerContext = await resolveSessionOwnerContext(session);
  if (!ownerContext.ok) {
    return c.json(
      {
        error: {
          code: "FORBIDDEN",
          message: ownerContext.message,
        },
      },
      403,
    );
  }

  setSessionContext(c, session, ownerContext);

  await next();
});

/**
 * Optional auth middleware for published map assets.
 * Valid API keys or sessions attach owner context for metering/private reads,
 * but missing or stale cookies do not block anonymous public resources.
 */
export const optionalAuthMiddleware = createMiddleware<AuthEnv>(async (c, next) => {
  const apiKeyOwnerId = c.get("apiKeyOwnerId");
  if (apiKeyOwnerId) {
    c.set("userId", apiKeyOwnerId);
    c.set("ownerId", apiKeyOwnerId);
    c.set("session", {
      id: "api-key",
      userId: apiKeyOwnerId,
      token: "",
      activeOrganizationId: null,
    });
    c.set("orgRole", null);
    await next();
    return;
  }

  const rawToken =
    getBetterAuthSessionCookie(c) ||
    c.req.header("authorization")?.replace("Bearer ", "");
  if (rawToken) {
    const session = await findValidSession(rawToken);
    if (session) {
      const ownerContext = await resolveSessionOwnerContext(session);
      if (ownerContext.ok) {
        setSessionContext(c, session, ownerContext);
      } else {
        setSessionContext(c, { ...session, activeOrganizationId: null }, {
          ownerId: session.userId,
          orgRole: null,
        });
      }
    }
  }

  await next();
});

export function isOrgRoleAtLeast(role: string | null, minRole: OrgRole) {
  if (!role) return false;
  const minimumRank = ORG_ROLE_RANK[minRole] ?? Number.POSITIVE_INFINITY;
  return (ORG_ROLE_RANK[role] ?? -1) >= minimumRank;
}

export function requireOrgMinRole(minRole: OrgRole) {
  return createMiddleware<AuthEnv>(async (c, next) => {
    const session = c.get("session");
    if (!session?.activeOrganizationId) {
      await next();
      return;
    }

    if (!isOrgRoleAtLeast(c.get("orgRole"), minRole)) {
      return c.json(
        {
          error: {
            code: "FORBIDDEN",
            message: `Requires ${minRole} access to this organization.`,
          },
        },
        403,
      );
    }

    await next();
  });
}

export function requireOrgMutationRole(
  minRole: OrgRole,
  methods = ["POST", "PUT", "PATCH", "DELETE"],
) {
  const methodSet = new Set(methods);
  const requireRole = requireOrgMinRole(minRole);

  return createMiddleware<AuthEnv>(async (c, next) => {
    if (!methodSet.has(c.req.method.toUpperCase())) {
      await next();
      return;
    }

    return requireRole(c, next);
  });
}

export function getBetterAuthSessionCookie(c: Parameters<typeof getCookie>[0]) {
  return (
    getCookie(c, "better-auth.session_token") ||
    getCookie(c, "__Secure-better-auth.session_token")
  );
}

async function findValidSession(rawToken: string) {
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

  return session ?? null;
}

export async function resolveSessionOwnerContext(
  session: SessionContext,
  findRole: (userId: string, orgId: string) => Promise<string | null> = findMembershipRole,
): Promise<
  | { ok: true; ownerId: string; orgRole: string | null }
  | { ok: false; message: string }
> {
  if (!session.activeOrganizationId) {
    return { ok: true, ownerId: session.userId, orgRole: null };
  }

  const role = await findRole(session.userId, session.activeOrganizationId);
  if (!role) {
    return {
      ok: false,
      message: "Active organization access is no longer available.",
    };
  }

  return {
    ok: true,
    ownerId: session.activeOrganizationId,
    orgRole: role,
  };
}

async function findMembershipRole(userId: string, orgId: string) {
  const [membership] = await db
    .select({ role: members.role })
    .from(members)
    .where(and(eq(members.userId, userId), eq(members.organizationId, orgId)))
    .limit(1);

  return membership?.role ?? null;
}

function setSessionContext(
  c: Context<AuthEnv>,
  session: SessionContext,
  ownerContext: { ownerId: string; orgRole: string | null },
) {
  c.set("userId", session.userId);
  c.set("session", session);
  c.set("ownerId", ownerContext.ownerId);
  c.set("orgRole", ownerContext.orgRole);
}
