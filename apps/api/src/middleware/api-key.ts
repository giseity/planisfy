import { createMiddleware } from "hono/factory";
import { db, apiKeys } from "@planisfy/database";
import { eq, and, isNull } from "drizzle-orm";
import {
  hashKey,
  isRequestOriginAllowed,
  requiredScopeForPath,
} from "../lib/api-key";

export type ApiKeyEnv = {
  Variables: {
    apiKeyId: string | null;
    apiKeyOwnerId: string | null;
    apiKeyScopes: string[] | null;
  };
};

/**
 * Validates an API key from the X-API-Key header.
 * Sets apiKeyId, apiKeyOwnerId, apiKeyScopes on the context.
 *
 * Does NOT reject missing keys — that's handled by the dual-auth middleware.
 * This only rejects INVALID keys (bad hash, expired, wrong domain, missing scope).
 */
export const apiKeyMiddleware = createMiddleware<ApiKeyEnv>(async (c, next) => {
  c.set("apiKeyId", null);
  c.set("apiKeyOwnerId", null);
  c.set("apiKeyScopes", null);

  const rawKey = c.req.header("x-api-key");
  if (!rawKey) {
    await next();
    return;
  }

  // Validate key format
  if (!rawKey.startsWith("pk_")) {
    return c.json(
      { error: { code: "UNAUTHORIZED", message: "Invalid API key format" } },
      401,
    );
  }

  // Hash and look up
  const keyHash = hashKey(rawKey);
  const [key] = await db
    .select({
      id: apiKeys.id,
      ownerId: apiKeys.ownerId,
      scopes: apiKeys.scopes,
      allowedDomains: apiKeys.allowedDomains,
      expiresAt: apiKeys.expiresAt,
    })
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, keyHash), isNull(apiKeys.deletedAt)))
    .limit(1);

  if (!key) {
    return c.json(
      { error: { code: "UNAUTHORIZED", message: "Invalid API key" } },
      401,
    );
  }

  // Check expiry
  if (key.expiresAt && new Date(key.expiresAt) < new Date()) {
    return c.json(
      { error: { code: "KEY_EXPIRED", message: "API key has expired" } },
      401,
    );
  }

  // Check allowed domains (Origin or Referer header)
  const domains = key.allowedDomains as string[] | null;
  if (domains && domains.length > 0) {
    const origin = c.req.header("origin") || c.req.header("referer");
    if (!isRequestOriginAllowed(origin, domains)) {
      return c.json(
        {
          error: {
            code: "DOMAIN_NOT_ALLOWED",
            message: origin
              ? "Request origin not in allowed domains"
              : "API key is restricted to browser origins",
          },
        },
        403,
      );
    }
  }

  // Check scope for this endpoint
  const scopes = key.scopes as string[];
  const requiredScope = requiredScopeForPath(c.req.path);
  if (requiredScope && !scopes.includes(requiredScope)) {
    return c.json(
      {
        error: {
          code: "SCOPE_DENIED",
          message: `API key missing required scope: ${requiredScope}`,
        },
      },
      403,
    );
  }

  // Set context variables
  c.set("apiKeyId", key.id);
  c.set("apiKeyOwnerId", key.ownerId);
  c.set("apiKeyScopes", scopes);

  // Update lastUsedAt in the background (fire-and-forget)
  db.update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, key.id))
    .catch((err: unknown) => {
      console.error("[api-key] Failed to update lastUsedAt:", err);
    });

  await next();
});
