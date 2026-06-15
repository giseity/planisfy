import { describe, expect, it } from "vitest";
import {
  contentTypeForTileType,
  parsePublicTilesetSlug,
  parseTileCoordinates,
  parseTileQueryCoordinates,
  parseTileQueryOptions,
} from ".";
import { TileType } from "pmtiles";

describe("tile runtime public helpers", () => {
  it("parses public tileset aliases", () => {
    expect(parsePublicTilesetSlug("acme.roads")).toEqual({
      owner: "acme",
      handle: "roads",
      version: undefined,
    });
    expect(parsePublicTilesetSlug("acme.roads@2")).toEqual({
      owner: "acme",
      handle: "roads",
      version: 2,
    });
    expect(parsePublicTilesetSlug("Acme.roads")).toBeNull();
  });

  it("validates tile and tilequery coordinates", () => {
    expect(parseTileCoordinates("3", "7", "7")).toEqual({
      z: 3,
      x: 7,
      y: 7,
    });
    expect(parseTileCoordinates("3", "8", "0")).toBeNull();
    expect(parseTileQueryCoordinates("-73.9857,40.7484")).toEqual({
      lon: -73.9857,
      lat: 40.7484,
    });
    expect(parseTileQueryCoordinates("0,90")).toBeNull();
  });

  it("normalizes tilequery options and tile content types", () => {
    expect(
      parseTileQueryOptions({
        z: "14",
        radius: "25",
        limit: "3",
        layers: "roads,pois",
        geometry: "full",
      }),
    ).toEqual({
      z: 14,
      radius: 25,
      limit: 3,
      layers: ["roads", "pois"],
      geometry: "full",
    });
    expect(contentTypeForTileType(TileType.Mvt)).toBe(
      "application/vnd.mapbox-vector-tile",
    );
  });
});
