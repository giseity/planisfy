import type { SourceSpecification } from "maplibre-gl";
import type { ConsoleTileset } from "@/lib/api";
import type { SourceLayerOptions } from "@/features/style-editor/store/style-store";

export const VECTOR_LAYER_TYPES: Array<
  NonNullable<SourceLayerOptions["layerType"]>
> = ["circle", "line", "fill", "symbol"];

export function tilesetToStyleSource(
  tileset: ConsoleTileset,
): SourceSpecification | null {
  if (!tileset.tilejsonUrl) return null;

  switch (tileset.type) {
    case "VECTOR":
      return { type: "vector", url: tileset.tilejsonUrl } as SourceSpecification;
    case "RASTER":
      return {
        type: "raster",
        url: tileset.tilejsonUrl,
        tileSize: 256,
      } as SourceSpecification;
    default:
      return null;
  }
}

export function defaultLayerOptionsForTileset(
  tileset: ConsoleTileset,
  sourceLayer?: string,
): SourceLayerOptions {
  if (tileset.type === "RASTER") return { layerType: "raster" };
  return {
    layerType: inferLayerType(sourceLayer),
    sourceLayer,
  };
}

export function vectorLayersForTileset(tileset: ConsoleTileset) {
  return (
    tileset.currentVersion?.schema?.vector_layers ??
    tileset.layerMetadata?.vector_layers ??
    []
  );
}

export function styleSourceIdForTileset(tileset: ConsoleTileset) {
  const owner = tileset.ownerHandle ? `${tileset.ownerHandle}-` : "";
  return `${owner}${tileset.handle || tileset.id}`.replace(/[^A-Za-z0-9_-]+/g, "-");
}

export function publishabilityMessage(tileset: ConsoleTileset) {
  if (!tileset.isPublished) return "Publish a processed version first";
  if (!tileset.tilejsonUrl) return "TileJSON URL unavailable";
  return tileset.status;
}

export function inferLayerType(
  sourceLayer: string | undefined,
): NonNullable<SourceLayerOptions["layerType"]> {
  const layer = sourceLayer?.toLowerCase() ?? "";
  if (/(road|transport|route|line|rail|boundary)/.test(layer)) return "line";
  if (/(building|land|water|park|area|polygon)/.test(layer)) return "fill";
  if (/(label|place|name|poi)/.test(layer)) return "symbol";
  return "circle";
}

export function defaultLayerType(
  source: SourceSpecification,
): NonNullable<SourceLayerOptions["layerType"]> {
  if (source.type === "raster") return "raster";
  if (source.type === "raster-dem") return "hillshade";
  return "circle";
}

export function layerTypesForSource(
  source: SourceSpecification,
): Array<NonNullable<SourceLayerOptions["layerType"]>> {
  if (source.type === "raster") return ["raster"];
  if (source.type === "raster-dem") return ["hillshade"];
  if (source.type === "vector" || source.type === "geojson")
    return VECTOR_LAYER_TYPES;
  return ["symbol"];
}
