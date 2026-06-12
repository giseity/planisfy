#!/usr/bin/env node
import { open } from "node:fs/promises";
import { stat } from "node:fs/promises";

const repoRoot = new URL("../", import.meta.url);
const fixturePath = new URL(
  process.env.DEMO_PMTILES_PATH ?? "infra/docker/data/pmtiles/stuttgart.pmtiles",
  repoRoot,
);
const martinUrl = stripTrailingSlash(
  process.env.MARTIN_URL ?? "http://localhost:3005",
);
const source = process.env.DEMO_TILE_SOURCE ?? "planisfy.basic";
const lon = Number(process.env.DEMO_TILE_LON ?? "9.1829");
const lat = Number(process.env.DEMO_TILE_LAT ?? "48.7758");
const zoom = Number(process.env.DEMO_TILE_ZOOM ?? "13");
const minTileBytes = Number(process.env.DEMO_TILE_MIN_BYTES ?? "256");

await assertPmtilesFixture();

const tileJsonUrl = `${martinUrl}/${source}`;
const tileJson = await fetchJson(tileJsonUrl);
if (!Array.isArray(tileJson.vector_layers) || tileJson.vector_layers.length === 0) {
  throw new Error(`Martin TileJSON has no vector_layers: ${tileJsonUrl}`);
}
if (!Array.isArray(tileJson.tiles) || typeof tileJson.tiles[0] !== "string") {
  throw new Error(`Martin TileJSON has no tile URL template: ${tileJsonUrl}`);
}

const tile = lonLatToTile(lon, lat, zoom);
const tileUrl = tileJson.tiles[0]
  .replace("{z}", String(tile.z))
  .replace("{x}", String(tile.x))
  .replace("{y}", String(tile.y));
const tileResponse = await fetch(tileUrl, {
  headers: { Accept: "application/x-protobuf" },
});
if (!tileResponse.ok) {
  throw new Error(
    `Default map tile failed: ${tileResponse.status} ${tileResponse.statusText} ${tileUrl}`,
  );
}
const tileBytes = Buffer.from(await tileResponse.arrayBuffer());
if (tileBytes.byteLength < minTileBytes) {
  throw new Error(
    `Default map tile was too small: ${tileBytes.byteLength} bytes from ${tileUrl}`,
  );
}

console.log(
  [
    "Default map smoke passed",
    `fixture=${fixturePath.pathname}`,
    `tilejson=${tileJsonUrl}`,
    `tile=${tile.z}/${tile.x}/${tile.y}`,
    `bytes=${tileBytes.byteLength}`,
    `layers=${tileJson.vector_layers.length}`,
  ].join("\n"),
);

async function assertPmtilesFixture() {
  const info = await stat(fixturePath).catch(() => null);
  if (!info?.isFile()) {
    throw new Error(
      `Default PMTiles fixture is missing: ${fixturePath.pathname}. Run scripts/self-host-setup.sh --demo-data or provide DEMO_PMTILES_PATH.`,
    );
  }
  const file = await open(fixturePath, "r");
  const magic = Buffer.alloc(7);
  try {
    await file.read(magic, 0, magic.byteLength, 0);
  } finally {
    await file.close();
  }
  if (magic.toString("utf8") !== "PMTiles") {
    throw new Error(`Default PMTiles fixture is not a PMTiles archive: ${fixturePath.pathname}`);
  }
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status} ${response.statusText}`);
  }
  return response.json();
}

function lonLatToTile(tileLon, tileLat, tileZoom) {
  const n = 2 ** tileZoom;
  const x = Math.floor(((tileLon + 180) / 360) * n);
  const latRad = (tileLat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  );
  return { z: tileZoom, x, y };
}

function stripTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}
