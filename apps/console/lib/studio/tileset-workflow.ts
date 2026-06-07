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

export function tilesetWorkflowMessage(tileset: ConsoleTileset) {
  if (tileset.status === "BUILDING") return "Tiles are building";
  if (tileset.status === "ERROR") return "Tileset build failed";
  if (tileset.status === "ARCHIVED") return "Tileset is archived";
  if (!tileset.latestVersion) return "No processed version yet";
  if (!tileset.currentVersionId)
    return "Review and publish a processed version";
  return "Ready for Studio and published map URLs";
}

export function jobStateMessage(
  status: string,
  cancelRequestedAt?: string | null,
) {
  if (cancelRequestedAt && status !== "CANCELED")
    return "Cancellation requested";
  switch (status) {
    case "PENDING":
      return "Queued";
    case "PROCESSING":
      return "Processing";
    case "SUCCEEDED":
      return "Succeeded";
    case "FAILED":
      return "Failed - retry available";
    case "CANCELED":
      return "Canceled - retry available";
    default:
      return status;
  }
}
