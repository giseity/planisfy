import {
  extractVectorLayers,
  parsePublicTilesetSlug,
  parseStableTileJsonPath,
  parseTileCoordinates,
  parseTileQueryCoordinates,
  parseTileQueryOptions,
  parseVersionedTileJsonPath,
  publicTilesetBaseUrl,
  queryResolvedTileset,
  readResolvedTile,
  resolveTileset,
  verifyTileJsonArtifact,
  type ResolvedTileset,
  type StorageArtifactAvailability,
  type TileRuntimeError,
} from "@planisfy/tile-runtime";
import { Hono, type Context } from "hono";
import type { AuthEnv } from "../../middleware/auth";
import { env } from "../../env";

export const tilesRoute = new Hono<AuthEnv>();
type ApiContext = Context<AuthEnv>;

// Stable owner/tileset TileJSON resolves to the promoted current version.
// Inline @version suffixes are accepted for copied/version-pinned URLs.
tilesRoute.get("/tiles/v1/:owner/:handle.json", async (c) => {
  const parsed = parseStableTileJsonPath(new URL(c.req.url).pathname);
  if (!parsed) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Tileset not found" } },
      404,
    );
  }

  const resolved = await resolveTileset(
    parsed.owner,
    parsed.handle,
    parsed.version,
  );
  if (!resolved?.version) {
    return c.json(
      {
        error: {
          code: "NOT_FOUND",
          message: parsed.version
            ? "Tileset version not found"
            : "Tileset not found",
        },
      },
      404,
    );
  }
  const artifactAvailability = await verifyTileJsonArtifact(resolved);
  if (!artifactAvailability.ok) {
    return tileJsonArtifactError(c, artifactAvailability);
  }

  return c.json(
    toTileJson(resolved, parsed.version ? "version" : "stable"),
    200,
    {
      "Cache-Control": parsed.version
        ? "public, max-age=31536000, immutable"
        : "public, max-age=300",
      ETag: `"tileset-${resolved.version.id}"`,
    },
  );
});

// Immutable version TileJSON.
tilesRoute.get("/tiles/v1/:owner/:handle/versions/:version.json", async (c) => {
  const parsed = parseVersionedTileJsonPath(new URL(c.req.url).pathname);
  if (!parsed) {
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
    parsed.owner,
    parsed.handle,
    parsed.version,
  );
  if (!resolved?.version) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Tileset version not found" } },
      404,
    );
  }
  const artifactAvailability = await verifyTileJsonArtifact(resolved);
  if (!artifactAvailability.ok) {
    return tileJsonArtifactError(c, artifactAvailability);
  }

  return c.json(toTileJson(resolved, "version"), 200, {
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
    const artifactAvailability = await verifyTileJsonArtifact(resolved);
    if (!artifactAvailability.ok) {
      return tileJsonArtifactError(c, artifactAvailability);
    }

    return c.json(
      toTileJson(resolved, parsed.version ? "dotted-version" : "dotted-stable"),
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
    return serveResolvedTile(c, resolved, z, x, y, () =>
      proxyMartinTile(c, `${martinSource}/${z}/${x}/${y}`),
    );
  }

  return proxyMartinTile(c, `${source}/${z}/${x}/${y}`);
});

// Versioned owner/tileset tile proxy. Martin source names are conventional and
// can be mapped by deployment glue; TileJSON above is the stable contract.
tilesRoute.get(
  "/tiles/v1/:owner/:handle/versions/:version/:z/:x/:y",
  async (c) => {
    const { owner, handle, version, z, x, y } = c.req.param();
    const versionNumber = Number(version);
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

    const resolved = await resolveTileset(owner, handle, versionNumber);
    if (!resolved?.version) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Tileset version not found" } },
        404,
      );
    }

    return serveResolvedTile(c, resolved, z, x, y, () =>
      proxyMartinTile(c, `${owner}.${handle}.v${version}/${z}/${x}/${y}`),
    );
  },
);

tilesRoute.get("/tiles/v1/:owner/:handle/:z/:x/:y", async (c) => {
  const { owner, handle, z, x, y } = c.req.param();
  const resolved = await resolveTileset(owner, handle);
  if (!resolved?.version) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Tileset not found" } },
      404,
    );
  }

  return serveResolvedTile(c, resolved, z, x, y, () =>
    proxyMartinTile(c, `${owner}.${handle}/${z}/${x}/${y}`),
  );
});

tilesRoute.get("/v4/:tileset/tilequery/:coords.json", async (c) => {
  const route = parseTileQueryRoutePath(new URL(c.req.url).pathname);
  const tileset = route ? parsePublicTilesetSlug(route.tileset) : null;
  const coords = route ? parseTileQueryCoordinates(route.coords) : null;
  const options = parseTileQueryOptions(c.req.query());

  if (!tileset || !coords || !options) {
    return c.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid tilequery request",
        },
      },
      400,
    );
  }

  const resolved = await resolveTileset(
    tileset.owner,
    tileset.handle,
    tileset.version,
  );
  if (!resolved?.version) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Tileset not found" } },
      404,
    );
  }
  if (shouldProxyToTileWorker(resolved)) {
    const url = new URL(c.req.url);
    return proxyTileWorker(c, `${url.pathname}${url.search}`);
  }
  const result = await queryResolvedTileset(resolved, coords, options);
  if (!result.ok) {
    if (result.cause) console.error("[tiles] tilequery error:", result.cause);
    return tileRuntimeError(c, result);
  }

  return c.json(result.collection, 200, result.headers);
});

async function legacyMartinTileJson(c: ApiContext, source: string) {
  const martinUrl = buildMartinSourceUrl(env.MARTIN_URL, source);
  if (!martinUrl) {
    return c.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid tile source" } },
      400,
    );
  }

  try {
    const res = await fetch(martinUrl, {
      headers: { Accept: "application/json" },
      redirect: "manual",
    });

    if (!res.ok) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Source not found" } },
        404,
      );
    }

    const tileJson = (await res.json()) as { tiles?: string[] };
    const apiBase = publicApiBaseFromEnv();
    tileJson.tiles = [
      `${apiBase}/tiles/v1/${encodeURIComponent(source)}/{z}/{x}/{y}`,
    ];

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
  const martinUrl = buildMartinTileUrl(env.MARTIN_URL, path);
  if (!martinUrl) {
    return c.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid tile request",
        },
      },
      400,
    );
  }

  try {
    const res = await fetch(martinUrl, { redirect: "manual" });

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
    const headers = martinTileResponseHeaders(res.headers);

    c.header("Content-Type", headers.contentType);
    c.header("Cache-Control", headers.cacheControl);
    c.header("Access-Control-Allow-Origin", headers.accessControlAllowOrigin);

    return c.body(body);
  } catch (err) {
    console.error("[tiles] Proxy error:", err);
    return c.json(
      { error: { code: "INTERNAL_ERROR", message: "Tile server unavailable" } },
      503,
    );
  }
}

export function martinTileResponseHeaders(upstreamHeaders: Headers) {
  return {
    contentType:
      upstreamHeaders.get("content-type") || "application/x-protobuf",
    cacheControl: "public, max-age=3600",
    accessControlAllowOrigin: "*",
  };
}

async function serveResolvedTile(
  c: ApiContext,
  resolved: ResolvedTileset,
  z: string,
  x: string,
  y: string,
  fallback: () => Promise<Response>,
) {
  const coords = parseTileCoordinates(z, x, y);
  if (!coords) {
    return c.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid tile coordinates",
        },
      },
      400,
    );
  }

  if (resolved.version?.format !== "PMTILES" || !resolved.artifact) {
    return fallback();
  }

  if (shouldProxyToTileWorker(resolved)) {
    return proxyTileWorker(c, new URL(c.req.url).pathname);
  }

  const result = await readResolvedTile(resolved, coords);
  if (!result.ok) {
    if (result.cause) {
      console.error("[tiles] PMTiles storage proxy error:", result.cause);
    }
    return tileRuntimeError(c, result);
  }

  const headers = new Headers({
    "Content-Type": result.contentType,
    "Cache-Control": result.cacheControl,
    "Access-Control-Allow-Origin": "*",
  });
  if (result.expires) headers.set("Expires", result.expires);

  return new Response(toResponseArrayBuffer(result.data), { headers });
}

function toTileJson(
  resolved: ResolvedTileset,
  mode: "stable" | "version" | "dotted-stable" | "dotted-version",
) {
  const apiBase = publicApiBaseFromEnv();
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

function tileJsonArtifactError(
  c: ApiContext,
  availability: Exclude<StorageArtifactAvailability, { ok: true }>,
) {
  c.header("Cache-Control", "no-store");
  return c.json(
    {
      error: {
        code: availability.code,
        message: availability.message,
      },
    },
    503,
  );
}

export function publicApiBaseFromEnv() {
  return env.NEXT_PUBLIC_API_URL.replace(/\/$/, "");
}

export function buildMartinSourceUrl(baseUrl: string, source: string) {
  if (!isSafeMartinSource(source)) return null;
  return new URL(
    encodeURIComponent(source),
    `${baseUrl.replace(/\/$/, "")}/`,
  ).toString();
}

export function buildMartinTileUrl(baseUrl: string, path: string) {
  const segments = path.split("/");
  if (segments.length !== 4) return null;

  const [source, z, x, y] = segments;
  if (!source || !z || !x || !y || !isSafeMartinSource(source)) return null;
  if (!parseTileCoordinates(z, x, y)) return null;

  return new URL(
    segments.map((segment) => encodeURIComponent(segment)).join("/"),
    `${baseUrl.replace(/\/$/, "")}/`,
  ).toString();
}

export function tileWorkerUrlForPath(baseUrl: string, pathWithQuery: string) {
  if (!baseUrl) return null;
  if (!pathWithQuery.startsWith("/")) return null;
  const url = new URL(pathWithQuery, `${baseUrl.replace(/\/$/, "")}/`);
  if (!url.pathname.startsWith("/tiles/") && !url.pathname.startsWith("/v4/")) {
    return null;
  }
  return url.toString();
}

function shouldProxyToTileWorker(resolved: ResolvedTileset) {
  return (
    env.TILE_DELIVERY_MODE === "worker" &&
    resolved.version?.format === "PMTILES" &&
    Boolean(resolved.artifact)
  );
}

async function proxyTileWorker(c: ApiContext, pathWithQuery: string) {
  const tileWorkerUrl = tileWorkerUrlForPath(env.TILE_WORKER_URL, pathWithQuery);
  if (!tileWorkerUrl) {
    return c.json(
      {
        error: {
          code: "TILE_WORKER_UNCONFIGURED",
          message: "Tile worker delivery mode requires TILE_WORKER_URL.",
        },
      },
      503,
    );
  }

  try {
    const res = await fetch(tileWorkerUrl, {
      headers: { Accept: c.req.header("accept") ?? "*/*" },
      redirect: "manual",
    });
    const headers = new Headers();
    for (const [name, value] of res.headers.entries()) {
      if (isForwardableResponseHeader(name)) headers.set(name, value);
    }
    headers.set("X-Planisfy-Tile-Delivery", "worker");
    return new Response(await res.arrayBuffer(), {
      status: res.status,
      statusText: res.statusText,
      headers,
    });
  } catch (err) {
    console.error("[tiles] Tile worker proxy error:", err);
    return c.json(
      {
        error: {
          code: "TILE_WORKER_UNAVAILABLE",
          message: "Tile worker unavailable",
        },
      },
      503,
    );
  }
}

function isForwardableResponseHeader(name: string) {
  return ![
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
  ].includes(name.toLowerCase());
}

function isSafeMartinSource(source: string) {
  if (source.length === 0 || source.length > 256) return false;
  if (source === "." || source === "..") return false;
  return /^[A-Za-z0-9._-]+$/.test(source);
}

function parseTileQueryRoutePath(pathname: string) {
  const match = pathname.match(/^\/v4\/([^/]+)\/tilequery\/(.+)\.json$/);
  if (!match) return null;
  return {
    tileset: decodeURIComponent(match[1]!),
    coords: decodeURIComponent(match[2]!),
  };
}

function tileRuntimeError(c: ApiContext, error: TileRuntimeError) {
  return c.json(
    {
      error: {
        code: error.code,
        message: error.message,
      },
    },
    error.status,
  );
}

function toResponseArrayBuffer(data: Uint8Array | ArrayBuffer) {
  if (data instanceof ArrayBuffer) return data;
  return data.buffer.slice(
    data.byteOffset,
    data.byteOffset + data.byteLength,
  ) as ArrayBuffer;
}
