import type { ConsoleTileset, ConsoleTilesetVersion } from "@/lib/api";

export function tilesetVersionActionLabel(params: {
  version: ConsoleTilesetVersion;
  currentVersionId: string | null;
  currentVersionNumber?: number | null;
}) {
  if (params.version.id === params.currentVersionId) {
    return `v${params.version.version} current`;
  }

  if (
    typeof params.currentVersionNumber === "number" &&
    params.version.version < params.currentVersionNumber
  ) {
    return `v${params.version.version} rollback`;
  }

  return `v${params.version.version} promote`;
}

export function canRebuildTileset(tileset: ConsoleTileset) {
  return Boolean(tileset.latestUpload);
}
