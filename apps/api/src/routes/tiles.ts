import { Hono, type Context } from "hono";
import { and, eq, isNull } from "drizzle-orm";
import {
  db,
  accounts,
  storageObjects,
  tilesetVersions,
  tilesets,
} from "@planisfy/database";
import type { AuthEnv } from "../middleware/auth";
import { env } from "../env";

export const tilesRoute = new Hono<AuthEnv>();
type ApiContext = Context<AuthEnv>;

// Stable owner/tileset TileJSON resolves to the promoted current version.
tilesRoute.get("/tiles/v1/:owner/:handle.json", async (c) => {
  const resolved = await resolveTileset(
    c.req.param("owner")!,
    c.req.param("handle")!,
  );
  if (!resolved?.version) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Tileset not found" } },
      404,
    );
  }

  return c.json(toTileJson(c.req.url, resolved, "stable"), 200, {
    "Cache-Control": "public, max-age=300",
    ETag: `"tileset-${resolved.version.id}"`,
  });
});

// Immutable version TileJSON.
tilesRoute.get("/tiles/v1/:owner/:handle/versions/:version.json", async (c) => {
  const versionNumber = Number(c.req.param("version"));
  if (!Number.isInteger(versionNumber) || versionNumber <= 0) {
    return c.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid tileset version",
        },
      },
      400,
    );
  }

  const resolved = await resolveTileset(
    c.req.param("owner")!,
    c.req.param("handle")!,
    versionNumber,
  );
  if (!resolved?.version) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Tileset version not found" } },
      404,
    );
  }

  return c.json(toTileJson(c.req.url, resolved, "version"), 200, {
    "Cache-Control": "public, max-age=31536000, immutable",
    ETag: `"tileset-${resolved.version.id}"`,
  });
});

// Dotted public aliases:
// /tiles/v1/{owner}.{handle}.json
// /tiles/v1/{owner}.{handle}@{version}.json
tilesRoute.get("/tiles/v1/:source{.+\\.json$}", async (c) => {
  const source = c.req.param("source").replace(/\.json$/, "");
  const parsed = parsePublicTilesetSlug(source);

  if (parsed) {
    const resolved = await resolveTileset(
      parsed.owner,
      parsed.handle,
      parsed.version,
    );
    if (!resolved?.version) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Tileset not found" } },
        404,
      );
    }

    return c.json(
      toTileJson(
        c.req.url,
        resolved,
        parsed.version ? "dotted-version" : "dotted-stable",
      ),
      200,
      {
        "Cache-Control": parsed.version
          ? "public, max-age=31536000, immutable"
          : "public, max-age=300",
        ETag: `"tileset-${resolved.version.id}"`,
      },
    );
  }

  return legacyMartinTileJson(c, source);
});

// Dotted and legacy Martin tile proxy.
tilesRoute.get("/tiles/v1/:source/:z/:x/:y", async (c) => {
  const { source, z, x, y } = c.req.param();
  const parsed = parsePublicTilesetSlug(source);

  if (parsed) {
    const resolved = await resolveTileset(
      parsed.owner,
      parsed.handle,
      parsed.version,
    );
    if (!resolved?.version) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Tileset not found" } },
        404,
      );
    }

    const martinSource = parsed.version
      ? `${parsed.owner}.${parsed.handle}.v${parsed.version}`
      : `${parsed.owner}.${parsed.handle}`;
    return proxyMartinTile(c, `${martinSource}/${z}/${x}/${y}`);
  }

  return proxyMartinTile(c, `${source}/${z}/${x}/${y}`);
});

// Versioned owner/tileset tile proxy. Martin source names are conventional and
// can be mapped by deployment glue; TileJSON above is the stable contract.
tilesRoute.get(
  "/tiles/v1/:owner/:handle/versions/:version/:z/:x/:y",
  async (c) => {
    const { owner, handle, version, z, x, y } = c.req.param();
    return proxyMartinTile(c, `${owner}.${handle}.v${version}/${z}/${x}/${y}`);
  },
);

tilesRoute.get("/tiles/v1/:owner/:handle/:z/:x/:y", async (c) => {
  const { owner, handle, z, x, y } = c.req.param();
  return proxyMartinTile(c, `${owner}.${handle}/${z}/${x}/${y}`);
});

async function legacyMartinTileJson(c: ApiContext, source: string) {
  try {
    const martinUrl = `${env.MARTIN_URL}/${source}`;
    const res = await fetch(martinUrl, {
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Source not found" } },
        404,
      );
    }

    const tileJson = (await res.json()) as { tiles?: string[] };
    const apiBase = apiBaseFromUrl(c.req.url);
    tileJson.tiles = [`${apiBase}/tiles/v1/${source}/{z}/{x}/{y}`];

    c.header("Cache-Control", "public, max-age=300");
    return c.json(tileJson);
  } catch {
    return c.json(
      { error: { code: "INTERNAL_ERROR", message: "Tile server unavailable" } },
      503,
    );
  }
}

async function proxyMartinTile(c: ApiContext, path: string) {
  try {
    const res = await fetch(`${env.MARTIN_URL}/${path}`);

    if (!res.ok) {
      if (res.status === 404) {
        return c.json(
          { error: { code: "NOT_FOUND", message: "Tile not found" } },
          404,
        );
      }
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "Tile server error" } },
        502,
      );
    }

    const body = await res.arrayBuffer();
    const contentType =
      res.headers.get("content-type") || "application/x-protobuf";
    const encoding = res.headers.get("content-encoding");

    c.header("Content-Type", contentType);
    if (encoding) c.header("Content-Encoding", encoding);
    c.header("Cache-Control", "public, max-age=3600");
    c.header("Access-Control-Allow-Origin", "*");

    return c.body(body);
  } catch (err) {
    console.error("[tiles] Proxy error:", err);
    return c.json(
      { error: { code: "INTERNAL_ERROR", message: "Tile server unavailable" } },
      503,
    );
  }
}

async function resolveTileset(
  ownerHandle: string,
  handle: string,
  versionNumber?: number,
) {
  const [owner] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.handle, ownerHandle), isNull(accounts.deletedAt)))
    .limit(1);

  if (!owner) return null;

  const [tileset] = await db
    .select()
    .from(tilesets)
    .where(
      and(
        eq(tilesets.accountId, owner.id),
        eq(tilesets.handle, handle),
        isNull(tilesets.deletedAt),
      ),
    )
    .limit(1);

  if (!tileset) return null;

  const versionWhere = versionNumber
    ? and(
        eq(tilesetVersions.tilesetId, tileset.id),
        eq(tilesetVersions.version, versionNumber),
      )
    : eq(
        tilesetVersions.id,
        tileset.currentVersionId ?? "00000000-0000-0000-0000-000000000000",
      );
  const [version] = await db
    .select()
    .from(tilesetVersions)
    .where(versionWhere)
    .limit(1);

  const [artifact] = version?.artifactStorageObjectId
    ? await db
        .select({ storageKey: storageObjects.storageKey })
        .from(storageObjects)
        .where(eq(storageObjects.id, version.artifactStorageObjectId))
        .limit(1)
    : [];

  return { owner: ownerHandle, tileset, version, artifact };
}

function toTileJson(
  url: string,
  resolved: NonNullable<Awaited<ReturnType<typeof resolveTileset>>>,
  mode: "stable" | "version" | "dotted-stable" | "dotted-version",
) {
  const apiBase = apiBaseFromUrl(url);
  const tilesBase = publicTilesetBaseUrl({
    apiBase,
    owner: resolved.owner,
    handle: resolved.tileset.handle,
    version: resolved.version!.version,
    mode,
  });

  return {
    tilejson: "3.0.0",
    name: resolved.tileset.name,
    description: resolved.tileset.description ?? undefined,
    version: String(resolved.version!.version),
    scheme: "xyz",
    tiles: [`${tilesBase}/{z}/{x}/{y}`],
    minzoom: resolved.version!.minZoom ?? resolved.tileset.minZoom ?? 0,
    maxzoom: resolved.version!.maxZoom ?? resolved.tileset.maxZoom ?? 14,
    bounds: resolved.version!.bounds ?? resolved.tileset.bounds ?? undefined,
    vector_layers: extractVectorLayers(
      resolved.version!.schema ?? resolved.tileset.layerMetadata,
    ),
    artifact: resolved.artifact?.storageKey,
  };
}

export function extractVectorLayers(schema: unknown) {
  if (
    typeof schema === "object" &&
    schema !== null &&
    "vector_layers" in schema &&
    Array.isArray(schema.vector_layers)
  ) {
    return schema.vector_layers;
  }

  return [{ id: "data", fields: {} }];
}

export function apiBaseFromUrl(url: string) {
  const baseUrl = new URL(url);
  return `${baseUrl.protocol}//${baseUrl.host}`;
}

export function parsePublicTilesetSlug(slug: string) {
  const match = slug.match(
    /^([a-z0-9][a-z0-9_-]*)\.([a-z0-9][a-z0-9_-]*)(?:@([1-9]\d*))?$/,
  );
  if (!match) return null;

  return {
    owner: match[1]!,
    handle: match[2]!,
    version: match[3] ? Number(match[3]) : undefined,
  };
}

export function publicTilesetBaseUrl(params: {
  apiBase: string;
  owner: string;
  handle: string;
  version: number;
  mode: "stable" | "version" | "dotted-stable" | "dotted-version";
}) {
  if (params.mode === "version") {
    return `${params.apiBase}/tiles/v1/${params.owner}/${params.handle}/versions/${params.version}`;
  }
  if (params.mode === "dotted-version") {
    return `${params.apiBase}/tiles/v1/${params.owner}.${params.handle}@${params.version}`;
  }
  if (params.mode === "dotted-stable") {
    return `${params.apiBase}/tiles/v1/${params.owner}.${params.handle}`;
  }
  return `${params.apiBase}/tiles/v1/${params.owner}/${params.handle}`;
}
