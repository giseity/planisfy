import type { TilesetBuildFormat } from "@planisfy/geodata-contracts";

export type UploadFormat = TilesetBuildFormat;

const SUPPORTED_EXTENSIONS: Record<string, UploadFormat> = {
  geojson: "geojson",
  json: "geojson",
  csv: "csv",
  zip: "shapefile",
  pmtiles: "pmtiles",
  mbtiles: "mbtiles",
};

export const SUPPORTED_UPLOAD_FORMATS = [
  "GeoJSON",
  "CSV",
  "zipped Shapefile",
  "PMTiles",
  "MBTiles",
] as const;

export function detectUploadFormat(
  filename: string,
  mimeType = "",
): UploadFormat | null {
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  const byExtension = SUPPORTED_EXTENSIONS[extension];
  if (byExtension) return byExtension;

  const normalizedMime = mimeType.toLowerCase();
  if (
    normalizedMime.includes("geo+json") ||
    normalizedMime === "application/json" ||
    normalizedMime.endsWith("+json")
  ) {
    return "geojson";
  }
  if (normalizedMime.includes("csv")) return "csv";
  if (
    normalizedMime.includes("zip") ||
    normalizedMime === "application/x-shapefile"
  ) {
    return "shapefile";
  }
  if (normalizedMime.includes("pmtiles")) return "pmtiles";
  if (normalizedMime.includes("mbtiles") || normalizedMime.includes("sqlite")) {
    return "mbtiles";
  }
  return null;
}

export function unsupportedUploadFormatMessage() {
  return `Unsupported file format. Accepted: ${SUPPORTED_UPLOAD_FORMATS.join(", ")}.`;
}

export function toStorageFileName(filename: string): string {
  const basename = filename.split(/[\\/]/).pop() ?? filename;
  const normalized = basename
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/\.{2,}/g, ".");

  if (!normalized || normalized === "." || normalized === "..") return "upload";
  if (normalized.startsWith(".")) return `upload${normalized}`;
  return normalized.slice(0, 180);
}
