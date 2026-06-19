import { Hono, type Context } from "hono";
import { z } from "zod";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { auth } from "@planisfy/auth/auth";
import { accounts, apiKeys, db, users } from "@planisfy/database";
import { logAudit } from "../lib/audit";
import {
  ALL_SCOPES,
  metadataAllowedDomains,
  metadataWithAllowedDomains,
  normalizeAllowedDomains,
  ORG_API_KEY_CONFIG_ID,
  permissionsToScopes,
  scopesToPermissions,
  USER_API_KEY_CONFIG_ID,
  type ApiKeyScope,
} from "../lib/api-key";
import { getAccountPlanLimits } from "../lib/billing";
import { requireOrgMutationPermission, type AuthEnv } from "../middleware/auth";
import { env } from "../env";
import { apiKeyMutationGate } from "../lib/platform-gates";

export const keysRoute = new Hono<AuthEnv>();

keysRoute.use("/keys", requireOrgMutationPermission("api_key.manage"));
keysRoute.use("/keys/*", requireOrgMutationPermission("api_key.manage"));

type BetterAuthApiKeyRow = Omit<
  typeof apiKeys.$inferSelect,
  "key" | "metadata" | "permissions"
> & {
  metadata: unknown;
  permissions: unknown;
};

function getClientIp(req: Request): string | undefined {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    undefined
  );
}

function serializeApiKey(row: BetterAuthApiKeyRow) {
  return {
    id: row.id,
    name: row.name ?? "Untitled key",
    scopes: permissionsToScopes(row.permissions),
    allowedDomains: metadataAllowedDomains(row.metadata),
    expiresAt: row.expiresAt,
    lastUsedAt: row.lastRequest,
    createdAt: row.createdAt,
    status:
      row.expiresAt && new Date(row.expiresAt) < new Date()
        ? "expired"
        : "active",
    prefix: row.start ?? row.prefix ?? "pk_",
  };
}

function secondsUntil(date: string | Date | null | undefined) {
  if (!date) return null;
  const expiresAt = typeof date === "string" ? new Date(date) : date;
  const seconds = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
  return seconds > 0 ? seconds : null;
}

async function getApiKeyConfig(ownerId: string) {
  const [account] = await db
    .select({ type: accounts.type })
    .from(accounts)
    .where(eq(accounts.id, ownerId))
    .limit(1);

  if (!account) return null;
  return account.type === "ORGANIZATION"
    ? ORG_API_KEY_CONFIG_ID
    : USER_API_KEY_CONFIG_ID;
}

async function findOwnedEnabledKey(keyId: string, ownerId: string) {
  const [key] = await db
    .select()
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.id, keyId),
        eq(apiKeys.referenceId, ownerId),
        eq(apiKeys.enabled, true),
      ),
    )
    .limit(1);

  return key ?? null;
}

async function withApiKeyOwnerLock<T>(ownerId: string, fn: () => Promise<T>) {
  await db.execute(
    sql`select pg_advisory_lock(hashtext(${`apiKeys:${ownerId}`}))`,
  );
  try {
    return await fn();
  } finally {
    await db.execute(
      sql`select pg_advisory_unlock(hashtext(${`apiKeys:${ownerId}`}))`,
    );
  }
}

function scopesFromExistingKey(value: unknown): ApiKeyScope[] {
  return permissionsToScopes(value).filter((scope): scope is ApiKeyScope =>
    ALL_SCOPES.includes(scope as ApiKeyScope),
  );
}

// -- Validation schemas -------------------------------------------------------

const createKeySchema = z.object({
  name: z.string().min(1).max(128),
  scopes: z.array(z.enum(ALL_SCOPES)).min(1, "At least one scope is required"),
  allowedDomains: z.array(z.string().max(255)).max(20).default([]),
  expiresAt: z.string().datetime().nullable().optional(),
});

const updateKeySchema = z.object({
  name: z.string().min(1).max(128).optional(),
  scopes: z.array(z.enum(ALL_SCOPES)).min(1).optional(),
  allowedDomains: z.array(z.string().max(255)).max(20).optional(),
});

// -- POST /console/keys - Create ---------------------------------------------

keysRoute.post("/keys", async (c) => {
  const ownerId = c.get("ownerId");
  const userId = c.get("userId");
  const verificationError = await requireManagedEmailVerification(c);
  if (verificationError) return verificationError;

  const parsed = createKeySchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid input",
          details: parsed.error.flatten(),
        },
      },
      400,
    );
  }

  const { name, scopes, expiresAt } = parsed.data;
  const expiresIn = secondsUntil(expiresAt);
  if (expiresAt && expiresIn === null) {
    return c.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Expiration must be in the future",
        },
      },
      400,
    );
  }

  const normalizedDomains = normalizeAllowedDomains(parsed.data.allowedDomains);
  if (normalizedDomains.errors.length > 0) {
    return c.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid allowed domains",
          details: { allowedDomains: normalizedDomains.errors },
        },
      },
      400,
    );
  }

  const [limits, configId] = await Promise.all([
    getAccountPlanLimits(ownerId),
    getApiKeyConfig(ownerId),
  ]);
  if (!configId) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Account not found" } },
      404,
    );
  }

  const created = await withApiKeyOwnerLock(ownerId, async () => {
    if (limits.maxApiKeys !== Infinity) {
      const [row] = await db
        .select({ count: count() })
        .from(apiKeys)
        .where(
          and(eq(apiKeys.referenceId, ownerId), eq(apiKeys.enabled, true)),
        );
      const current = row?.count ?? 0;
      if (current >= limits.maxApiKeys) {
        return { ok: false as const, limit: limits.maxApiKeys };
      }
    }

    const apiKey = await auth.api.createApiKey({
      body: {
        configId,
        name,
        expiresIn,
        userId,
        ...(configId === ORG_API_KEY_CONFIG_ID
          ? { organizationId: ownerId }
          : {}),
        metadata: metadataWithAllowedDomains(normalizedDomains.domains),
        permissions: scopesToPermissions(scopes),
        rateLimitEnabled: false,
        remaining: null,
      },
    });

    return { ok: true as const, apiKey };
  });

  if (!created.ok) {
    return c.json(
      {
        error: {
          code: "PLAN_LIMIT",
          message: `You've reached the maximum of ${created.limit} API keys on your current plan. Please upgrade to create more.`,
        },
      },
      403,
    );
  }

  logAudit({
    profileId: userId,
    action: "key.created",
    resourceType: "api_key",
    resourceId: created.apiKey.id,
    metadata: { name, scopes },
    ipAddress: getClientIp(c.req.raw),
  });

  return c.json(
    {
      data: {
        id: created.apiKey.id,
        key: created.apiKey.key,
        name,
        scopes,
        allowedDomains: normalizedDomains.domains,
        expiresAt: expiresAt ?? null,
        createdAt: created.apiKey.createdAt.toISOString(),
        prefix: created.apiKey.start ?? created.apiKey.prefix ?? "pk_",
      },
    },
    201,
  );
});

// -- GET /console/keys - List ------------------------------------------------

keysRoute.get("/keys", async (c) => {
  const ownerId = c.get("ownerId");

  const results = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.referenceId, ownerId), eq(apiKeys.enabled, true)))
    .orderBy(desc(apiKeys.createdAt));

  return c.json({ data: results.map(serializeApiKey) });
});

// -- GET /console/keys/:id - Get single key ----------------------------------

keysRoute.get("/keys/:id", async (c) => {
  const key = await findOwnedEnabledKey(c.req.param("id"), c.get("ownerId"));

  if (!key) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "API key not found" } },
      404,
    );
  }

  return c.json({ data: serializeApiKey(key) });
});

// -- PUT /console/keys/:id - Update ------------------------------------------

keysRoute.put("/keys/:id", async (c) => {
  const keyId = c.req.param("id");
  const ownerId = c.get("ownerId");
  const userId = c.get("userId");
  const verificationError = await requireManagedEmailVerification(c);
  if (verificationError) return verificationError;

  const parsed = updateKeySchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid input",
          details: parsed.error.flatten(),
        },
      },
      400,
    );
  }

  const updates: {
    name?: string;
    permissions?: ReturnType<typeof scopesToPermissions>;
    metadata?: ReturnType<typeof metadataWithAllowedDomains>;
  } = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.scopes !== undefined) {
    updates.permissions = scopesToPermissions(parsed.data.scopes);
  }
  if (parsed.data.allowedDomains !== undefined) {
    const normalizedDomains = normalizeAllowedDomains(
      parsed.data.allowedDomains,
    );
    if (normalizedDomains.errors.length > 0) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid allowed domains",
            details: { allowedDomains: normalizedDomains.errors },
          },
        },
        400,
      );
    }
    updates.metadata = metadataWithAllowedDomains(normalizedDomains.domains);
  }

  if (Object.keys(updates).length === 0) {
    return c.json(
      { error: { code: "VALIDATION_ERROR", message: "No fields to update" } },
      400,
    );
  }

  const existing = await findOwnedEnabledKey(keyId, ownerId);
  if (!existing) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "API key not found" } },
      404,
    );
  }

  const result = await auth.api.updateApiKey({
    body: {
      configId: existing.configId,
      keyId,
      userId,
      ...updates,
    },
  });

  logAudit({
    profileId: userId,
    action: "key.updated",
    resourceType: "api_key",
    resourceId: keyId,
    metadata: updates,
    ipAddress: getClientIp(c.req.raw),
  });

  return c.json({ data: serializeApiKey(result) });
});

// -- DELETE /console/keys/:id - Revoke ---------------------------------------

keysRoute.delete("/keys/:id", async (c) => {
  const keyId = c.req.param("id");
  const ownerId = c.get("ownerId");
  const userId = c.get("userId");

  const existing = await findOwnedEnabledKey(keyId, ownerId);
  if (!existing) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "API key not found" } },
      404,
    );
  }

  await auth.api.updateApiKey({
    body: {
      configId: existing.configId,
      keyId,
      userId,
      enabled: false,
    },
  });

  logAudit({
    profileId: userId,
    action: "key.revoked",
    resourceType: "api_key",
    resourceId: keyId,
    metadata: { name: existing.name },
    ipAddress: getClientIp(c.req.raw),
  });

  return c.json({ data: { id: keyId, revoked: true } });
});

// -- POST /console/keys/:id/rotate - Rotate ----------------------------------

keysRoute.post("/keys/:id/rotate", async (c) => {
  const keyId = c.req.param("id");
  const ownerId = c.get("ownerId");
  const userId = c.get("userId");
  const verificationError = await requireManagedEmailVerification(c);
  if (verificationError) return verificationError;

  const existing = await findOwnedEnabledKey(keyId, ownerId);
  if (!existing) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "API key not found" } },
      404,
    );
  }

  const replacement = await auth.api.createApiKey({
    body: {
      configId: existing.configId,
      name: existing.name ?? undefined,
      expiresIn: secondsUntil(existing.expiresAt),
      userId,
      ...(existing.configId === ORG_API_KEY_CONFIG_ID
        ? { organizationId: ownerId }
        : {}),
      metadata: metadataWithAllowedDomains(
        metadataAllowedDomains(existing.metadata),
      ),
      permissions: scopesToPermissions(scopesFromExistingKey(existing.permissions)),
      rateLimitEnabled: false,
      remaining: null,
    },
  });

  await auth.api.updateApiKey({
    body: {
      configId: existing.configId,
      keyId,
      userId,
      enabled: false,
    },
  });

  logAudit({
    profileId: userId,
    action: "key.rotated",
    resourceType: "api_key",
    resourceId: keyId,
    metadata: { name: existing.name, replacementId: replacement.id },
    ipAddress: getClientIp(c.req.raw),
  });

  return c.json({
    data: {
      id: replacement.id,
      key: replacement.key,
      name: replacement.name ?? existing.name,
    },
  });
});

async function requireManagedEmailVerification(c: Context<AuthEnv>) {
  if (env.DEPLOYMENT_MODE !== "managed") return null;

  const [user] = await db
    .select({ emailVerified: users.emailVerified })
    .from(users)
    .where(eq(users.id, c.get("userId")))
    .limit(1);

  const denial = apiKeyMutationGate({
    deploymentMode: env.DEPLOYMENT_MODE,
    emailVerified: Boolean(user?.emailVerified),
  });
  if (!denial) return null;

  return c.json(
    {
      error: {
        code: denial.code,
        message: denial.message,
      },
    },
    denial.status,
  );
}
