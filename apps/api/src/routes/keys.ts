import { Hono } from "hono";
import { z } from "zod";
import { eq, and, isNull, desc } from "drizzle-orm";
import { db, apiKeys } from "@planisfy/database";
import { logAudit } from "../lib/audit";
import { generateApiKey, hashKey, ALL_SCOPES, type ApiKeyScope } from "../lib/api-key";
import type { AuthEnv } from "../middleware/auth";

export const keysRoute = new Hono<AuthEnv>();

function getClientIp(req: Request): string | undefined {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    undefined
  );
}

// ── Validation schemas ──────────────────────────────────────────────────────

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

// ── POST /console/keys — Create ─────────────────────────────────────────────

keysRoute.post("/keys", async (c) => {
  const ownerId = c.get("ownerId");
  const userId = c.get("userId");
  const body = await c.req.json();

  const parsed = createKeySchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid input", details: parsed.error.flatten() } },
      400
    );
  }

  const { name, scopes, allowedDomains, expiresAt } = parsed.data;
  const { id, fullKey, keyHash } = generateApiKey();

  await db.insert(apiKeys).values({
    id,
    keyHash,
    ownerId,
    name,
    scopes: scopes as string[],
    allowedDomains: allowedDomains.length > 0 ? allowedDomains : null,
    expiresAt: expiresAt ? new Date(expiresAt) : null,
  });

  logAudit({
    profileId: userId,
    action: "key.created",
    resourceType: "api_key",
    resourceId: id,
    metadata: { name, scopes },
    ipAddress: getClientIp(c.req.raw),
  });

  // Return the full key — this is the ONLY time it's visible
  return c.json({
    data: {
      id,
      key: fullKey,
      name,
      scopes,
      allowedDomains,
      expiresAt: expiresAt ?? null,
      createdAt: new Date().toISOString(),
    },
  }, 201);
});

// ── GET /console/keys — List ────────────────────────────────────────────────

keysRoute.get("/keys", async (c) => {
  const ownerId = c.get("ownerId");

  const results = await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      scopes: apiKeys.scopes,
      allowedDomains: apiKeys.allowedDomains,
      expiresAt: apiKeys.expiresAt,
      lastUsedAt: apiKeys.lastUsedAt,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .where(and(eq(apiKeys.ownerId, ownerId), isNull(apiKeys.deletedAt)))
    .orderBy(desc(apiKeys.createdAt));

  // Add computed status field
  const data = results.map((key) => ({
    ...key,
    status: key.expiresAt && new Date(key.expiresAt) < new Date() ? "expired" : "active",
    prefix: key.id, // pk_xxxx — the public prefix
  }));

  return c.json({ data });
});

// ── GET /console/keys/:id — Get single key ──────────────────────────────────

keysRoute.get("/keys/:id", async (c) => {
  const keyId = c.req.param("id");
  const ownerId = c.get("ownerId");

  const [key] = await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      scopes: apiKeys.scopes,
      allowedDomains: apiKeys.allowedDomains,
      expiresAt: apiKeys.expiresAt,
      lastUsedAt: apiKeys.lastUsedAt,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .where(
      and(eq(apiKeys.id, keyId), eq(apiKeys.ownerId, ownerId), isNull(apiKeys.deletedAt))
    )
    .limit(1);

  if (!key) {
    return c.json({ error: { code: "NOT_FOUND", message: "API key not found" } }, 404);
  }

  return c.json({
    data: {
      ...key,
      status: key.expiresAt && new Date(key.expiresAt) < new Date() ? "expired" : "active",
      prefix: key.id,
    },
  });
});

// ── PUT /console/keys/:id — Update ──────────────────────────────────────────

keysRoute.put("/keys/:id", async (c) => {
  const keyId = c.req.param("id");
  const ownerId = c.get("ownerId");
  const userId = c.get("userId");
  const body = await c.req.json();

  const parsed = updateKeySchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid input", details: parsed.error.flatten() } },
      400
    );
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.scopes !== undefined) updates.scopes = parsed.data.scopes;
  if (parsed.data.allowedDomains !== undefined) {
    updates.allowedDomains = parsed.data.allowedDomains.length > 0
      ? parsed.data.allowedDomains
      : null;
  }

  if (Object.keys(updates).length === 0) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "No fields to update" } }, 400);
  }

  const result = await db
    .update(apiKeys)
    .set(updates)
    .where(
      and(eq(apiKeys.id, keyId), eq(apiKeys.ownerId, ownerId), isNull(apiKeys.deletedAt))
    )
    .returning({
      id: apiKeys.id,
      name: apiKeys.name,
      scopes: apiKeys.scopes,
      allowedDomains: apiKeys.allowedDomains,
    });

  if (result.length === 0) {
    return c.json({ error: { code: "NOT_FOUND", message: "API key not found" } }, 404);
  }

  logAudit({
    profileId: userId,
    action: "key.updated",
    resourceType: "api_key",
    resourceId: keyId,
    metadata: updates,
    ipAddress: getClientIp(c.req.raw),
  });

  return c.json({ data: result[0] });
});

// ── DELETE /console/keys/:id — Revoke ───────────────────────────────────────

keysRoute.delete("/keys/:id", async (c) => {
  const keyId = c.req.param("id");
  const ownerId = c.get("ownerId");
  const userId = c.get("userId");

  const result = await db
    .update(apiKeys)
    .set({ deletedAt: new Date() })
    .where(
      and(eq(apiKeys.id, keyId), eq(apiKeys.ownerId, ownerId), isNull(apiKeys.deletedAt))
    )
    .returning({ id: apiKeys.id, name: apiKeys.name });

  if (result.length === 0) {
    return c.json({ error: { code: "NOT_FOUND", message: "API key not found" } }, 404);
  }

  logAudit({
    profileId: userId,
    action: "key.revoked",
    resourceType: "api_key",
    resourceId: keyId,
    metadata: { name: result[0]!.name },
    ipAddress: getClientIp(c.req.raw),
  });

  return c.json({ data: { id: keyId, revoked: true } });
});

// ── POST /console/keys/:id/rotate — Rotate ─────────────────────────────────

keysRoute.post("/keys/:id/rotate", async (c) => {
  const keyId = c.req.param("id");
  const ownerId = c.get("ownerId");
  const userId = c.get("userId");

  // Verify the key exists and belongs to the owner
  const [existing] = await db
    .select({ id: apiKeys.id, name: apiKeys.name })
    .from(apiKeys)
    .where(
      and(eq(apiKeys.id, keyId), eq(apiKeys.ownerId, ownerId), isNull(apiKeys.deletedAt))
    )
    .limit(1);

  if (!existing) {
    return c.json({ error: { code: "NOT_FOUND", message: "API key not found" } }, 404);
  }

  // Generate a new secret but keep the same id
  const { randomBytes } = await import("node:crypto");
  const newSecret = randomBytes(32).toString("hex");
  const newFullKey = `${keyId}_${newSecret}`;
  const newHash = hashKey(newFullKey);

  await db
    .update(apiKeys)
    .set({ keyHash: newHash })
    .where(eq(apiKeys.id, keyId));

  logAudit({
    profileId: userId,
    action: "key.rotated",
    resourceType: "api_key",
    resourceId: keyId,
    metadata: { name: existing.name },
    ipAddress: getClientIp(c.req.raw),
  });

  return c.json({
    data: {
      id: keyId,
      key: newFullKey,
      name: existing.name,
    },
  });
});
