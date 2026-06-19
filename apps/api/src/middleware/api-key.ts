import { createMiddleware } from "hono/factory";
import { auth } from "@planisfy/auth/auth";
import { accounts, db } from "@planisfy/database";
import { and, eq, isNull } from "drizzle-orm";
import {
  isRequestOriginAllowed,
  metadataAllowedDomains,
  ORG_API_KEY_CONFIG_ID,
  permissionsToScopes,
  requiredScopeForPath,
  USER_API_KEY_CONFIG_ID,
} from "../lib/api-key";

export type ApiKeyEnv = {
  Variables: {
    apiKeyId: string | null;
    apiKeyOwnerId: string | null;
    apiKeyScopes: string[] | null;
  };
};

type VerifiedApiKey = NonNullable<
  Awaited<ReturnType<typeof auth.api.verifyApiKey>>["key"]
>;

/**
 * Validates an API key from the X-API-Key header.
 * Sets apiKeyId, apiKeyOwnerId, apiKeyScopes on the context.
 *
 * Missing keys are allowed so dual-auth middleware can fall back to sessions.
 * Invalid, disabled, expired, wrong-domain, or under-scoped keys are rejected.
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

  if (!rawKey.startsWith("pk_")) {
    return c.json(
      { error: { code: "UNAUTHORIZED", message: "Invalid API key format" } },
      401,
    );
  }

  const verified = await verifyApiKeyAcrossConfigs(rawKey);
  if ("status" in verified) {
    return c.json(
      {
        error: {
          code: verified.code,
          message: verified.message,
        },
      },
      verified.status,
    );
  }

  const [account] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(
      and(
        eq(accounts.id, verified.key.referenceId),
        eq(accounts.lifecycleStatus, "ACTIVE"),
        isNull(accounts.deletedAt),
      ),
    )
    .limit(1);

  if (!account) {
    return c.json(
      { error: { code: "UNAUTHORIZED", message: "Invalid API key" } },
      401,
    );
  }

  const domains = metadataAllowedDomains(verified.key.metadata);
  if (domains.length > 0) {
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

  const scopes = permissionsToScopes(verified.key.permissions);
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

  c.set("apiKeyId", verified.key.id);
  c.set("apiKeyOwnerId", verified.key.referenceId);
  c.set("apiKeyScopes", scopes);

  await next();
});

async function verifyApiKeyAcrossConfigs(rawKey: string): Promise<
  | { valid: true; key: VerifiedApiKey }
  | { valid: false; status: 401; code: string; message: string }
> {
  let lastError: { code?: string; message?: string } | null = null;

  for (const configId of [USER_API_KEY_CONFIG_ID, ORG_API_KEY_CONFIG_ID]) {
    const result = await auth.api.verifyApiKey({
      body: {
        configId,
        key: rawKey,
      },
    });

    if (result.valid && result.key) {
      return { valid: true, key: result.key };
    }
    lastError = result.error
      ? {
          code: result.error.code,
          message: result.error.message
            ? String(result.error.message)
            : undefined,
        }
      : null;
  }

  const code = lastError?.code ?? "UNAUTHORIZED";
  const publicCode =
    code === "KEY_DISABLED" || code === "KEY_EXPIRED" ? code : "UNAUTHORIZED";
  return {
    valid: false,
    status: 401,
    code: publicCode,
    message:
      code === "KEY_DISABLED"
        ? "API key is disabled"
        : lastError?.message || "Invalid API key",
  };
}
