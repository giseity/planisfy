/* global console, process */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(root, "dist");

async function readJson(path) {
  return JSON.parse(await readFile(join(root, path), "utf8"));
}

const manifest = await readJson("release-manifest.json");
const contract = await readJson("source-layer-contract.json");
const contractLayers = new Set(contract.layers.map((layer) => layer.id));
const errors = [];

if (!manifest.release || !manifest.schemaVersion) {
  errors.push("release-manifest.json must include release and schemaVersion.");
}

if (manifest.schemaVersion !== contract.schemaVersion) {
  errors.push("Manifest schemaVersion must match source-layer contract.");
}

if (!Array.isArray(manifest.tilesets) || manifest.tilesets.length === 0) {
  errors.push("Manifest must define at least one tileset.");
}

for (const layer of contract.layers) {
  if (layer.minZoom > layer.maxZoom) {
    errors.push(`Layer ${layer.id} has minZoom greater than maxZoom.`);
  }
}

for (const styleEntry of manifest.styles ?? []) {
  const style = await readJson(styleEntry.style);
  if (style.version !== 8) {
    errors.push(`${styleEntry.style} must be a MapLibre style v8 document.`);
  }
  if (!style.sources?.[contract.sourceId]) {
    errors.push(`${styleEntry.style} must include source ${contract.sourceId}.`);
  }
  for (const layer of style.layers ?? []) {
    const sourceLayer = layer["source-layer"];
    if (sourceLayer && !contractLayers.has(sourceLayer)) {
      errors.push(
        `${styleEntry.style} uses unknown source-layer ${sourceLayer} in ${layer.id}.`,
      );
    }
  }
}

if (errors.length > 0) {
  for (const error of errors) console.error(`[map-styles] ${error}`);
  process.exit(1);
}

await mkdir(outDir, { recursive: true });
await writeFile(
  join(outDir, "release-manifest.json"),
  JSON.stringify(
    {
      ...manifest,
      builtAt: new Date().toISOString(),
      contractLayerCount: contract.layers.length,
      styleCount: manifest.styles.length,
    },
    null,
    2,
  ) + "\n",
);

console.log(
  `[map-styles] validated ${manifest.release}: ${manifest.styles.length} styles, ${contract.layers.length} layers`,
);
