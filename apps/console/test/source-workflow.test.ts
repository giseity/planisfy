import { describe, expect, it } from "vitest";
import type {
  ConsoleSourceImport,
  ConsoleTileset,
  ConsoleTilesetVersion,
} from "@/lib/api";
import { normalizeApiUrl } from "@/lib/api";
import { useStyleStore } from "@/lib/store/style-store";
import {
  canRebuildTileset,
  tilesetVersionActionLabel,
} from "@/lib/studio/tileset-workflow";
import {
  defaultLayerOptionsForTileset,
  publishabilityMessage,
  styleSourceIdForTileset,
  tilesetToStyleSource,
  vectorLayersForTileset,
} from "@/lib/studio/source-workflow";
import {
  canRequestOvertureImport,
  canCreateTilesetFromImport,
  catalogTypeForSelection,
  catalogTypesForTheme,
  defaultOvertureImportOptions,
  defaultTilesetOptionsForImport,
  sourceImportStatusVariant,
  sourceImportSummary,
} from "@/lib/studio/import-workflow";

describe("Studio source workflow", () => {
  it("creates stable source IDs and vector sources from published tilesets", () => {
    const tileset = tilesetFixture({
      ownerHandle: "acme.maps",
      handle: "roads/main",
      isPublished: true,
      tilejsonUrl:
        "https://api.planisfy.localhost/tilesets/acme.roads/tilejson.json",
    });

    expect(styleSourceIdForTileset(tileset)).toBe("acme-maps-roads-main");
    expect(tilesetToStyleSource(tileset)).toEqual({
      type: "vector",
      url: "https://api.planisfy.localhost/tilesets/acme.roads/tilejson.json",
    });
    expect(publishabilityMessage(tileset)).toBe("READY");
  });

  it("derives default layer options from vector layer metadata", () => {
    const tileset = tilesetFixture({
      currentVersion: versionFixture({
        schema: {
          vector_layers: [
            { id: "transportation" },
            { id: "building" },
            { id: "place_label" },
          ],
        },
      }),
    });

    expect(vectorLayersForTileset(tileset).map((layer) => layer.id)).toEqual([
      "transportation",
      "building",
      "place_label",
    ]);
    expect(defaultLayerOptionsForTileset(tileset, "transportation")).toEqual({
      layerType: "line",
      sourceLayer: "transportation",
    });
    expect(defaultLayerOptionsForTileset(tileset, "building")).toEqual({
      layerType: "fill",
      sourceLayer: "building",
    });
  });

  it("adds source layers with duplicate-safe IDs", () => {
    const store = useStyleStore.getState();
    store.loadStyle({
      version: 8,
      name: "Draft",
      sources: {
        roads: { type: "vector", url: "https://example.com/roads.json" },
      },
      layers: [
        {
          id: "roads-transportation",
          type: "line",
          source: "roads",
          "source-layer": "transportation",
        },
      ],
    });

    useStyleStore.getState().addLayerFromSource("roads", {
      layerType: "line",
      sourceLayer: "transportation",
    });

    const layers = useStyleStore.getState().style?.layers ?? [];
    expect(layers.map((layer) => layer.id)).toEqual([
      "roads-transportation",
      "roads-transportation-2",
    ]);
    expect(layers[1]).toMatchObject({
      type: "line",
      source: "roads",
      "source-layer": "transportation",
    });
  });
});

describe("Console tileset workflow", () => {
  it("labels current, rollback, and promote version actions", () => {
    expect(
      tilesetVersionActionLabel({
        version: versionFixture({ id: "v2", version: 2 }),
        currentVersionId: "v2",
        currentVersionNumber: 2,
      }),
    ).toBe("v2 current");
    expect(
      tilesetVersionActionLabel({
        version: versionFixture({ id: "v1", version: 1 }),
        currentVersionId: "v2",
        currentVersionNumber: 2,
      }),
    ).toBe("v1 rollback");
    expect(
      tilesetVersionActionLabel({
        version: versionFixture({ id: "v3", version: 3 }),
        currentVersionId: "v2",
        currentVersionNumber: 2,
      }),
    ).toBe("v3 promote");
  });

  it("requires an original upload before rebuild", () => {
    expect(canRebuildTileset(tilesetFixture({ latestUpload: null }))).toBe(
      false,
    );
    expect(
      canRebuildTileset(
        tilesetFixture({
          latestUpload: {
            id: "upload-1",
            accountId: "account-1",
            originalFileName: "roads.geojson",
            contentType: "application/geo+json",
            size: 100,
            storageObjectId: "storage-1",
            linkedTilesetId: "tileset-1",
            status: "READY",
            validationResult: null,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        }),
      ),
    ).toBe(true);
  });
});

describe("Console import workflow", () => {
  const catalog = [
    {
      theme: "transportation",
      label: "Transportation",
      description: "Transportation network.",
      types: [
        {
          theme: "transportation",
          type: "segment",
          label: "Segment",
          description: "Road, rail, and ferry centerlines.",
          geometry: ["LineString"],
          defaultLayerId: "segment",
        },
      ],
    },
  ];

  it("derives Overture import defaults from catalog selections", () => {
    expect(catalogTypesForTheme(catalog, "transportation")).toHaveLength(1);
    expect(
      catalogTypeForSelection(catalog, "transportation", "segment")?.label,
    ).toBe("Segment");
    expect(
      defaultOvertureImportOptions(catalog, "transportation", "segment"),
    ).toEqual({
      name: "Overture Segment",
      handle: "overture-transportation-segment",
      description: "DuckDB import of Overture Transportation Segment.",
    });
    expect(
      canRequestOvertureImport({
        theme: "transportation",
        type: "segment",
        name: "Overture Segment",
        handle: "overture-transportation-segment",
        regionReady: true,
      }),
    ).toBe(true);
  });

  it("allows tileset creation only from succeeded imports with dataset artifacts", () => {
    expect(
      canCreateTilesetFromImport(
        sourceImportFixture({
          status: "SUCCEEDED",
          datasetId: "dataset-1",
          output: { datasetVersionId: "dataset-version-1" },
        }),
      ),
    ).toBe(true);
    expect(
      canCreateTilesetFromImport(
        sourceImportFixture({
          status: "PROCESSING",
          datasetId: "dataset-1",
          output: { datasetVersionId: "dataset-version-1" },
        }),
      ),
    ).toBe(false);
    expect(
      canCreateTilesetFromImport(
        sourceImportFixture({
          status: "SUCCEEDED",
          datasetId: "dataset-1",
          output: {},
        }),
      ),
    ).toBe(false);
  });

  it("derives safe default tileset options from import catalog metadata", () => {
    expect(
      defaultTilesetOptionsForImport(
        sourceImportFixture({
          sourceName: "transportation",
          input: {
            type: "segment",
            catalog: { label: "Segment", geometry: ["LineString"] },
          },
        }),
      ),
    ).toEqual({
      name: "Segment tiles",
      handle: "transportation-segment",
      description: "Tiles generated from OVERTURE transportation/segment.",
    });
  });

  it("summarizes import state for list rows", () => {
    expect(sourceImportStatusVariant("SUCCEEDED")).toBe("success");
    expect(
      sourceImportSummary(
        sourceImportFixture({
          sourceName: "places",
          input: { type: "place" },
          output: { featureCount: 1250 },
        }),
      ),
    ).toBe("OVERTURE places/place - 1,250 features");
  });
});

describe("publish URL normalization", () => {
  it("normalizes relative TileJSON and style URLs against the API root", () => {
    expect(normalizeApiUrl("/tilesets/acme.roads/tilejson.json")).toBe(
      "https://api.planisfy.localhost/tilesets/acme.roads/tilejson.json",
    );
    expect(normalizeApiUrl("styles/v1/acme/basic")).toBe(
      "https://api.planisfy.localhost/styles/v1/acme/basic",
    );
    expect(normalizeApiUrl("https://cdn.example.com/style.json")).toBe(
      "https://cdn.example.com/style.json",
    );
  });
});

function tilesetFixture(
  overrides: Partial<ConsoleTileset> = {},
): ConsoleTileset {
  const latestVersion = overrides.latestVersion ?? versionFixture();
  return {
    id: "tileset-1",
    accountId: "account-1",
    handle: "roads",
    name: "Roads",
    description: null,
    type: "VECTOR",
    status: "READY",
    isPublished: false,
    ownerHandle: "acme",
    currentVersionId: latestVersion.id,
    currentVersion: latestVersion,
    latestVersion,
    versions: [latestVersion],
    latestUpload: null,
    tilejsonUrl: null,
    versionedTilejsonUrl: null,
    bounds: null,
    minZoom: 0,
    maxZoom: 14,
    layerMetadata: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  } as ConsoleTileset;
}

function versionFixture(
  overrides: Partial<ConsoleTilesetVersion> = {},
): ConsoleTilesetVersion {
  return {
    id: "version-1",
    tilesetId: "tileset-1",
    version: 1,
    buildJobId: null,
    format: "PMTILES",
    schema: null,
    bounds: null,
    minZoom: 0,
    maxZoom: 14,
    createdAt: "2026-01-01T00:00:00.000Z",
    publishedAt: null,
    artifact: {
      id: "artifact-1",
      url: "https://api.planisfy.localhost/storage/tiles.pmtiles",
      size: 100,
      contentType: "application/x-protobuf",
      storageKey: "tiles.pmtiles",
    },
    ...overrides,
  } as ConsoleTilesetVersion;
}

function sourceImportFixture(
  overrides: Partial<ConsoleSourceImport> = {},
): ConsoleSourceImport {
  return {
    id: "import-1",
    accountId: "account-1",
    sourceConnectionId: null,
    regionId: "region-1",
    datasetId: "dataset-1",
    processingJobId: "job-1",
    provider: "OVERTURE",
    sourceName: "places",
    status: "SUCCEEDED",
    input: { theme: "places", type: "place" },
    output: { datasetVersionId: "dataset-version-1", featureCount: 10 },
    errorCode: null,
    errorMessage: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}
