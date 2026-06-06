/* global console, process */

import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const repoRoot = dirname(dirname(root));

const { values } = parseArgs({
  options: {
    name: { type: "string", default: "stuttgart" },
    version: { type: "string", default: "dev" },
    pmtiles: {
      type: "string",
      default: join(repoRoot, "infra/docker/data/pmtiles/stuttgart.pmtiles"),
    },
    out: { type: "string" },
    "tilejson-url": {
      type: "string",
      default: "http://localhost:3005/planisfy.basic",
    },
    style: {
      type: "string",
      default: join(root, "styles/planisfy-streets-light-v1.json"),
    },
    "source-version": { type: "string", multiple: true, default: [] },
  },
});

const releaseName = safeId(values.name);
const releaseVersion = safeId(values.version);
const pmtilesPath = resolvePath(values.pmtiles);
const outDir = values.out
  ? resolvePath(values.out)
  : join(root, "dist/regional", releaseName, releaseVersion);
const stylePath = resolvePath(values.style);
const tilejsonUrl = values["tilejson-url"];

const [contract, sourceStyle] = await Promise.all([
  readJson(join(root, "source-layer-contract.json")),
  readJson(stylePath),
]);
const pmtiles = await inspectPmtiles(pmtilesPath);
validateStyleSourceLayers(sourceStyle, contract);

if (!sourceStyle.sources?.[contract.sourceId]) {
  throw new Error(`Style is missing source ${contract.sourceId}`);
}

const releaseId = `${releaseName}-${releaseVersion}`;
const generatedStyle = {
  ...sourceStyle,
  name: `${sourceStyle.name} (${releaseName})`,
  metadata: {
    ...(sourceStyle.metadata ?? {}),
    "planisfy:regionalRelease": releaseId,
    "planisfy:pmtilesSha256": pmtiles.sha256,
  },
  sources: {
    ...sourceStyle.sources,
    [contract.sourceId]: {
      ...sourceStyle.sources[contract.sourceId],
      url: tilejsonUrl,
    },
  },
};

const manifest = {
  schemaVersion: contract.schemaVersion,
  release: releaseId,
  kind: "regional-basemap",
  status: "generated-metadata",
  generatedAt: new Date().toISOString(),
  region: {
    id: releaseName,
    name: releaseName,
    center: sourceStyle.center ?? null,
  },
  sourceLayerContract: "source-layer-contract.json",
  sourceLayers: contract.layers.map((layer) => layer.id),
  sourceDataVersions: parseSourceVersions(values["source-version"]),
  source: {
    pmtilesPath: relative(repoRoot, pmtilesPath).replaceAll("\\", "/"),
    sha256: pmtiles.sha256,
    size: pmtiles.size,
    format: "pmtiles",
    binaryCommitted: false,
  },
  attribution:
    "&copy; OpenStreetMap contributors, Overture Maps Foundation, Natural Earth",
  artifacts: {
    manifest: "manifest.json",
    style: "style.json",
  },
  style: {
    id: `${releaseName}-planisfy-streets-light`,
    sourceId: contract.sourceId,
    tilejsonUrl,
  },
};

await mkdir(outDir, { recursive: true });
await writeFile(join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile(join(outDir, "style.json"), `${JSON.stringify(generatedStyle, null, 2)}\n`);

console.log(
  `[map-styles] generated regional release ${releaseId} at ${relative(repoRoot, outDir).replaceAll("\\", "/")}`,
);

function resolvePath(value) {
  return isAbsolute(value) ? value : resolve(process.cwd(), value);
}

function safeId(value) {
  if (!/^[A-Za-z0-9._-]+$/.test(value)) {
    throw new Error(`Unsafe release identifier: ${value}`);
  }
  return value;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function inspectPmtiles(path) {
  let data;
  try {
    data = await readFile(path);
  } catch {
    throw new Error(
      `PMTiles artifact is missing at ${path}. Provide --pmtiles or run scripts/self-host-setup.sh --demo-data first.`,
    );
  }
  if (data.subarray(0, 7).toString("utf8") !== "PMTiles") {
    throw new Error(`PMTiles artifact has an invalid header: ${path}`);
  }
  const details = await stat(path);
  return {
    size: details.size,
    sha256: createHash("sha256").update(data).digest("hex"),
  };
}

function parseSourceVersions(values) {
  return Object.fromEntries(
    values.map((value) => {
      const separator = value.indexOf("=");
      if (separator === -1) {
        throw new Error(`Source version must use name=value format: ${value}`);
      }
      const key = value.slice(0, separator);
      const version = value.slice(separator + 1);
      if (!key || !version) {
        throw new Error(`Source version must use name=value format: ${value}`);
      }
      return [key, version];
    }),
  );
}

function validateStyleSourceLayers(style, contract) {
  const contractLayerIds = new Set(contract.layers.map((layer) => layer.id));
  const missing = new Set();
  for (const layer of style.layers ?? []) {
    const sourceLayer = layer["source-layer"];
    if (layer.source === contract.sourceId && !contractLayerIds.has(sourceLayer)) {
      missing.add(sourceLayer);
    }
  }

  if (missing.size > 0) {
    throw new Error(
      `Style references source layers missing from contract: ${Array.from(missing).join(", ")}`,
    );
  }
}
