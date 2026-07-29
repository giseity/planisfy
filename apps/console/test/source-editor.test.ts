import { describe, expect, it } from "vitest";
import type {
  SourceSpecification,
  StyleSpecification,
} from "maplibre-gl";
import {
  insertSource,
  normalizeSourceId,
} from "@/features/style-editor/style-spec/source";

describe("style source insertion", () => {
  it("normalizes safe IDs and refuses collisions without replacement", () => {
    const original = styleWithSources({
      roads: { type: "vector", url: "mapbox://original" },
    });
    const collision = insertSource(original, " roads ", {
      type: "vector",
      url: "mapbox://replacement",
    });

    expect(collision).toEqual({ ok: false, code: "SOURCE_EXISTS" });
    expect(original.sources.roads).toEqual({
      type: "vector",
      url: "mapbox://original",
    });
    expect(normalizeSourceId("  terrain.dem  ")).toBe("terrain.dem");
    expect(normalizeSourceId("unsafe source")).toBeNull();
    expect(normalizeSourceId("../source")).toBeNull();
  });

  it.each(sourceFixtures())(
    "preserves the $name source representation",
    ({ source }) => {
      const inserted = insertSource(styleWithSources({}), "fixture", source);
      expect(inserted.ok).toBe(true);
      if (inserted.ok) {
        expect(inserted.style.sources.fixture).toEqual(source);
      }
    },
  );
});

function sourceFixtures(): Array<{
  name: string;
  source: SourceSpecification;
}> {
  return [
    {
      name: "vector URL",
      source: { type: "vector", url: "mapbox://roads" },
    },
    {
      name: "vector tiles",
      source: {
        type: "vector",
        tiles: ["https://tiles.example/{z}/{x}/{y}.pbf"],
      },
    },
    {
      name: "raster tiles",
      source: {
        type: "raster",
        tiles: ["https://tiles.example/{z}/{x}/{y}.png"],
        tileSize: 256,
      },
    },
    {
      name: "raster DEM",
      source: {
        type: "raster-dem",
        url: "https://tiles.example/dem.json",
        encoding: "terrarium",
      },
    },
    {
      name: "GeoJSON URL",
      source: { type: "geojson", data: "https://example.com/data.geojson" },
    },
    {
      name: "inline GeoJSON",
      source: {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      },
    },
    {
      name: "image",
      source: {
        type: "image",
        url: "https://example.com/image.png",
        coordinates: [
          [0, 1],
          [1, 1],
          [1, 0],
          [0, 0],
        ],
      },
    },
    {
      name: "video",
      source: {
        type: "video",
        urls: ["https://example.com/video.mp4"],
        coordinates: [
          [0, 1],
          [1, 1],
          [1, 0],
          [0, 0],
        ],
      },
    },
  ];
}

function styleWithSources(
  sources: Record<string, SourceSpecification>,
): StyleSpecification {
  return {
    version: 8,
    name: "Fixture",
    sources,
    layers: [],
  };
}
