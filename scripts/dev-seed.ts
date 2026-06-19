#!/usr/bin/env tsx
import { randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq, isNull, ne } from "drizzle-orm";
import { auth } from "@planisfy/auth/auth";
import {
  accounts,
  apiKeys,
  db,
  members,
  organizations,
  storageObjects,
  stylePublications,
  styles,
  styleVersions,
  tilesets,
  tilesetVersions,
  users,
} from "@planisfy/database";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const seed = {
  email: process.env.PLANISFY_SEED_EMAIL ?? "demo@planisfy.localhost",
  password: process.env.PLANISFY_SEED_PASSWORD ?? "Planisfy-demo-12345",
  name: process.env.PLANISFY_SEED_NAME ?? "Planisfy Demo",
  handle: process.env.PLANISFY_SEED_HANDLE ?? "planisfy-demo",
  orgName: process.env.PLANISFY_SEED_ORG_NAME ?? "Planisfy Demo Team",
  orgSlug: process.env.PLANISFY_SEED_ORG_SLUG ?? "planisfy-demo-team",
  styleHandle: process.env.PLANISFY_SEED_STYLE_HANDLE ?? "stuttgart-demo",
  tilesetHandle: process.env.PLANISFY_SEED_TILESET_HANDLE ?? "stuttgart-base",
};

const now = new Date();
let fullApiKey = "";

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });

async function main() {
  const user = await ensureUser();
  const organization = await ensureOrganization(user.id);
  await ensureApiKey(user.id);
  const tileset = await ensureTileset(user.id);
  const style = await ensureStyle(user.id);

  console.log("Seeded local product-loop data");
  console.log(`user=${seed.email}`);
  console.log(`password=${seed.password}`);
  console.log(`account=${seed.handle}`);
  console.log(`organization=${organization.slug}`);
  console.log(`apiKey=${fullApiKey}`);
  console.log(`style=${style.handle}`);
  console.log(`tileset=${tileset.handle}`);
  if (!tileset.currentVersionId) {
    console.log(
      "tilesetArtifact=missing; add infra/docker/data/pmtiles/stuttgart.pmtiles and rerun to seed a published PMTiles version",
    );
  }
}

async function ensureUser() {
  const existing = await findUserByEmail(seed.email);
  if (existing) {
    await releaseConflictingAccountHandle(existing.id);
    await db
      .update(users)
      .set({ emailVerified: true, name: seed.name, updatedAt: now })
      .where(eq(users.id, existing.id));
    await db
      .update(accounts)
      .set({
        handle: seed.handle,
        displayName: seed.name,
        updatedAt: now,
      })
      .where(eq(accounts.id, existing.id));
    return { ...existing, name: seed.name, emailVerified: true };
  }

  const created = await auth.api.signUpEmail({
    body: {
      email: seed.email,
      password: seed.password,
      name: seed.name,
    },
  });

  await db
    .update(users)
    .set({ emailVerified: true, updatedAt: now })
    .where(eq(users.id, created.user.id));
  await releaseConflictingAccountHandle(created.user.id);
  await db
    .update(accounts)
    .set({ handle: seed.handle, displayName: seed.name, updatedAt: now })
    .where(eq(accounts.id, created.user.id));

  return { ...created.user, emailVerified: true };
}

async function releaseConflictingAccountHandle(targetAccountId: string) {
  const [conflict] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(
      and(eq(accounts.handle, seed.handle), ne(accounts.id, targetAccountId)),
    )
    .limit(1);

  if (!conflict) return;

  await db
    .update(accounts)
    .set({
      handle: `${seed.handle}-orphan-${Date.now()}`,
      updatedAt: now,
    })
    .where(eq(accounts.id, conflict.id));
}

async function ensureOrganization(userId: string) {
  const [existing] = await db
    .select()
    .from(organizations)
    .where(
      and(
        eq(organizations.slug, seed.orgSlug),
        isNull(organizations.deletedAt),
      ),
    )
    .limit(1);

  const organization =
    existing ??
    (await insertOrganization({
      name: seed.orgName,
      slug: seed.orgSlug,
    }));

  const [membership] = await db
    .select({ id: members.id })
    .from(members)
    .where(
      and(
        eq(members.organizationId, organization.id),
        eq(members.userId, userId),
      ),
    )
    .limit(1);

  if (!membership) {
    await db.insert(members).values({
      organizationId: organization.id,
      userId,
      role: "owner",
    });
  }

  return organization;
}

async function insertOrganization(input: { name: string; slug: string }) {
  const id = randomUUID();
  await db.insert(accounts).values({
    id,
    type: "ORGANIZATION",
    handle: input.slug,
    displayName: input.name,
  });
  const [organization] = await db
    .insert(organizations)
    .values({
      id,
      name: input.name,
      slug: input.slug,
    })
    .returning();
  return organization!;
}

async function ensureApiKey(ownerId: string) {
  const scopes = [
    "tiles:read",
    "styles:read",
    "styles:write",
    "geocoding",
    "directions",
    "elevation",
    "static",
    "sources:read",
    "sources:write",
    "usage:read",
  ];

  await db
    .delete(apiKeys)
    .where(
      and(
        eq(apiKeys.referenceId, ownerId),
        eq(apiKeys.name, "Local development key"),
      ),
    );

  const created = await auth.api.createApiKey({
    body: {
      configId: "user-keys",
      userId: ownerId,
      name: "Local development key",
      metadata: { allowedDomains: [] },
      permissions: { scopes },
      rateLimitEnabled: false,
      remaining: null,
      expiresIn: null,
    },
  });
  fullApiKey = created.key;
  return created;
}

async function ensureStyle(ownerId: string) {
  const styleJson = await readJson(
    "packages/map-styles/styles/planisfy-streets-v1.json",
  );
  const [existing] = await db
    .select()
    .from(styles)
    .where(
      and(
        eq(styles.ownerId, ownerId),
        eq(styles.handle, seed.styleHandle),
        isNull(styles.deletedAt),
      ),
    )
    .limit(1);

  const style =
    existing ??
    (await insertStyle({
      ownerId,
      styleJson,
    }));

  if (existing) {
    await db
      .update(styles)
      .set({
        name: "Stuttgart Demo Style",
        description:
          "Seeded MapLibre style backed by the local Stuttgart fixture.",
        styleJson,
        originalStyleJson: styleJson,
        isPublic: true,
        version: 1,
        updatedAt: now,
      })
      .where(eq(styles.id, existing.id));
  }

  const version = await ensureStyleVersion(style.id, ownerId, styleJson);
  await ensureStylePublication(style.id, version.id, ownerId);
  return { ...style, handle: seed.styleHandle };
}

async function insertStyle(input: {
  ownerId: string;
  styleJson: Record<string, unknown>;
}) {
  const [style] = await db
    .insert(styles)
    .values({
      ownerId: input.ownerId,
      handle: seed.styleHandle,
      name: "Stuttgart Demo Style",
      description:
        "Seeded MapLibre style backed by the local Stuttgart fixture.",
      styleJson: input.styleJson,
      originalStyleJson: input.styleJson,
      isPublic: true,
      version: 1,
    })
    .returning();
  return style!;
}

async function ensureStyleVersion(
  styleId: string,
  userId: string,
  styleJson: Record<string, unknown>,
) {
  const [existing] = await db
    .select()
    .from(styleVersions)
    .where(
      and(eq(styleVersions.styleId, styleId), eq(styleVersions.version, 1)),
    )
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(styleVersions)
      .set({
        styleJson,
        name: "Stuttgart Demo Style",
        createdBy: userId,
      })
      .where(eq(styleVersions.id, existing.id))
      .returning();
    return updated!;
  }

  const [version] = await db
    .insert(styleVersions)
    .values({
      styleId,
      version: 1,
      styleJson,
      name: "Stuttgart Demo Style",
      createdBy: userId,
    })
    .returning();
  return version!;
}

async function ensureStylePublication(
  styleId: string,
  styleVersionId: string,
  accountId: string,
) {
  for (const alias of ["latest", "v1"]) {
    const [existing] = await db
      .select({ id: stylePublications.id })
      .from(stylePublications)
      .where(
        and(
          eq(stylePublications.styleId, styleId),
          eq(stylePublications.alias, alias),
        ),
      )
      .limit(1);

    if (existing) {
      await db
        .update(stylePublications)
        .set({ styleVersionId, accountId, publishedBy: accountId })
        .where(eq(stylePublications.id, existing.id));
    } else {
      await db.insert(stylePublications).values({
        styleId,
        styleVersionId,
        accountId,
        alias,
        publishedBy: accountId,
      });
    }
  }
}

async function ensureTileset(ownerId: string) {
  const [existing] = await db
    .select()
    .from(tilesets)
    .where(
      and(
        eq(tilesets.accountId, ownerId),
        eq(tilesets.handle, seed.tilesetHandle),
        isNull(tilesets.deletedAt),
      ),
    )
    .limit(1);

  const tileset =
    existing ??
    (await insertTileset({
      ownerId,
    }));
  const artifact = await ensureTilesetArtifact(ownerId, tileset.id);

  if (!artifact) {
    await db
      .update(tilesets)
      .set({
        name: "Stuttgart Base",
        description: "Seeded Stuttgart fixture tileset.",
        status: "DRAFT",
        currentVersionId: null,
        updatedAt: now,
      })
      .where(eq(tilesets.id, tileset.id));
    return { ...tileset, currentVersionId: null };
  }

  const version = await ensureTilesetVersion(tileset.id, artifact.id);
  const [updated] = await db
    .update(tilesets)
    .set({
      name: "Stuttgart Base",
      description: "Seeded Stuttgart fixture tileset.",
      status: "READY",
      currentVersionId: version.id,
      bounds: [9.0, 48.6, 9.35, 48.9],
      minZoom: 0,
      maxZoom: 14,
      layerMetadata: stuttgartVectorLayerSchema(),
      updatedAt: now,
    })
    .where(eq(tilesets.id, tileset.id))
    .returning();
  return updated!;
}

async function insertTileset(input: { ownerId: string }) {
  const [tileset] = await db
    .insert(tilesets)
    .values({
      accountId: input.ownerId,
      handle: seed.tilesetHandle,
      name: "Stuttgart Base",
      description: "Seeded Stuttgart fixture tileset.",
      type: "VECTOR",
      status: "DRAFT",
      bounds: [9.0, 48.6, 9.35, 48.9],
      minZoom: 0,
      maxZoom: 14,
      layerMetadata: stuttgartVectorLayerSchema(),
    })
    .returning();
  return tileset!;
}

async function ensureTilesetArtifact(ownerId: string, tilesetId: string) {
  const fixture = resolve(root, "infra/docker/data/pmtiles/stuttgart.pmtiles");
  try {
    await stat(fixture);
  } catch {
    return null;
  }

  const storageKey = `accounts/${ownerId}/tilesets/${tilesetId}/v1/tiles.pmtiles`;
  const storagePath = resolveRepoPath(
    process.env.LOCAL_STORAGE_PATH ?? ".storage",
  );
  const target = resolve(storagePath, storageKey);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(fixture, target);
  const file = await stat(target);

  const [existing] = await db
    .select()
    .from(storageObjects)
    .where(
      and(
        eq(storageObjects.provider, "local"),
        eq(storageObjects.bucket, localStorageBucket()),
        eq(storageObjects.storageKey, storageKey),
        isNull(storageObjects.deletedAt),
      ),
    )
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(storageObjects)
      .set({
        accountId: ownerId,
        fileName: "tiles.pmtiles",
        contentType: "application/octet-stream",
        size: file.size,
        resourceType: "tileset",
        resourceId: tilesetId,
        artifactKind: "seed",
        version: "v1",
        updatedAt: now,
      })
      .where(eq(storageObjects.id, existing.id))
      .returning();
    return updated!;
  }

  const [object] = await db
    .insert(storageObjects)
    .values({
      accountId: ownerId,
      provider: "local",
      bucket: localStorageBucket(),
      storageKey,
      fileName: "tiles.pmtiles",
      contentType: "application/octet-stream",
      size: file.size,
      resourceType: "tileset",
      resourceId: tilesetId,
      artifactKind: "seed",
      version: "v1",
    })
    .returning();
  return object!;
}

async function ensureTilesetVersion(
  tilesetId: string,
  storageObjectId: string,
) {
  const [existing] = await db
    .select()
    .from(tilesetVersions)
    .where(
      and(
        eq(tilesetVersions.tilesetId, tilesetId),
        eq(tilesetVersions.version, 1),
      ),
    )
    .limit(1);

  const values = {
    artifactStorageObjectId: storageObjectId,
    format: "PMTILES" as const,
    schema: stuttgartVectorLayerSchema(),
    bounds: [9.0, 48.6, 9.35, 48.9],
    minZoom: 0,
    maxZoom: 14,
    publishedAt: now,
  };

  if (existing) {
    const [updated] = await db
      .update(tilesetVersions)
      .set(values)
      .where(eq(tilesetVersions.id, existing.id))
      .returning();
    return updated!;
  }

  const [version] = await db
    .insert(tilesetVersions)
    .values({
      tilesetId,
      version: 1,
      ...values,
    })
    .returning();
  return version!;
}

async function findUserByEmail(email: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return user ?? null;
}

async function readJson(path: string) {
  return JSON.parse(await readFile(resolve(root, path), "utf8")) as Record<
    string,
    unknown
  >;
}

function resolveRepoPath(path: string) {
  return path.startsWith("/") ? path : resolve(root, path);
}

function localStorageBucket() {
  return process.env.LOCAL_STORAGE_BUCKET || "planisfy-local";
}

function stuttgartVectorLayerSchema() {
  return {
    vector_layers: [
      { id: "boundary", fields: {}, minzoom: 0, maxzoom: 14 },
      { id: "building", fields: {}, minzoom: 12, maxzoom: 14 },
      { id: "landcover", fields: {}, minzoom: 0, maxzoom: 14 },
      { id: "place", fields: {}, minzoom: 0, maxzoom: 14 },
      { id: "transportation", fields: {}, minzoom: 0, maxzoom: 14 },
      { id: "water", fields: {}, minzoom: 0, maxzoom: 14 },
    ],
  };
}
