import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const root = join(import.meta.dirname, "..");

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(join(root, path), "utf8")) as T;
}

type ReleaseManifest = {
  release: string;
  schemaVersion: string;
  tilesets: Array<{
    id: string;
    tileset: string;
    sourceLayerContract: string;
    artifact?: {
      path?: string;
      requiredForLocalRender?: boolean;
    };
    attribution?: string;
  }>;
  styles: Array<{
    id: string;
    style: string;
    tileset?: string;
  }>;
};

type SourceLayerContract = {
  tileset: string;
  sourceId: string;
  schemaVersion: string;
  minZoom: number;
  maxZoom: number;
  layers: Array<{
    id: string;
    minZoom: number;
    maxZoom: number;
  }>;
};

type StyleJson = {
  version: number;
  sources?: Record<string, unknown>;
  layers?: Array<{
    id: string;
    source?: string;
    "source-layer"?: string;
  }>;
};

describe("Planisfy Streets fixture release", () => {
  test("ties the release manifest to the source-layer contract", async () => {
    const manifest = await readJson<ReleaseManifest>("release-manifest.json");
    const contract = await readJson<SourceLayerContract>(
      "source-layer-contract.json",
    );

    expect(manifest.release).toBeTruthy();
    expect(manifest.schemaVersion).toBe(contract.schemaVersion);
    expect(manifest.tilesets).toHaveLength(1);
    expect(manifest.tilesets[0]?.tileset).toBe(contract.tileset);
    expect(manifest.tilesets[0]?.sourceLayerContract).toBe(
      "source-layer-contract.json",
    );
    expect(manifest.tilesets[0]?.artifact?.requiredForLocalRender).toBe(true);
    expect(manifest.tilesets[0]?.artifact?.path).toBe(
      "infra/docker/data/pmtiles/stuttgart.pmtiles",
    );
  });

  test("uses only documented source layers in fixture styles", async () => {
    const manifest = await readJson<ReleaseManifest>("release-manifest.json");
    const contract = await readJson<SourceLayerContract>(
      "source-layer-contract.json",
    );
    const sourceLayers = new Set(contract.layers.map((layer) => layer.id));

    for (const styleEntry of manifest.styles) {
      const style = await readJson<StyleJson>(styleEntry.style);

      expect(style.version).toBe(8);
      expect(style.sources?.[contract.sourceId]).toBeTruthy();
      for (const layer of style.layers ?? []) {
        if (layer["source-layer"]) {
          expect(sourceLayers.has(layer["source-layer"])).toBe(true);
        }
      }
    }
  });

  test("keeps contract zoom ranges valid", async () => {
    const contract = await readJson<SourceLayerContract>(
      "source-layer-contract.json",
    );

    for (const layer of contract.layers) {
      expect(layer.minZoom).toBeGreaterThanOrEqual(contract.minZoom);
      expect(layer.maxZoom).toBeLessThanOrEqual(contract.maxZoom);
      expect(layer.minZoom).toBeLessThanOrEqual(layer.maxZoom);
    }
  });
});
