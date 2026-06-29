export type ConsoleBBox = [number, number, number, number];

export type ConsoleAreaOfInterest =
  | { kind: "world" }
  | { kind: "bbox"; bbox: ConsoleBBox };

export const WORLD_BBOX: ConsoleBBox = [-180, -90, 180, 90];

export function normalizeAreaOfInterest(
  value: unknown,
): ConsoleAreaOfInterest {
  if (isRecord(value) && value.kind === "world") return { kind: "world" };
  if (isRecord(value) && value.kind === "bbox") {
    return { kind: "bbox", bbox: coerceBBox(value.bbox) };
  }
  if (Array.isArray(value)) return { kind: "bbox", bbox: coerceBBox(value) };
  throw new Error("Area of interest must be full world or a valid bbox");
}

export function areaOfInterestToBBox(
  areaOfInterest: ConsoleAreaOfInterest,
): ConsoleBBox {
  return areaOfInterest.kind === "world" ? WORLD_BBOX : areaOfInterest.bbox;
}

export function coerceBBox(value: unknown): ConsoleBBox {
  if (!Array.isArray(value) || value.length !== 4) {
    throw new Error("BBox must be [west, south, east, north]");
  }
  const bbox = value.map(Number) as ConsoleBBox;
  const [west, south, east, north] = bbox;
  if (
    !bbox.every(Number.isFinite) ||
    west < -180 ||
    east > 180 ||
    south < -90 ||
    north > 90 ||
    west >= east ||
    south >= north
  ) {
    throw new Error("BBox is outside valid WGS84 bounds");
  }
  return bbox;
}

export function bboxToHgtTileNames(bbox: ConsoleBBox): string[] {
  const [west, south, east, north] = coerceBBox(bbox);
  const minLat = Math.floor(clamp(south, -90, 89));
  const maxLat = clamp(Math.ceil(north) - 1, -90, 89);
  const minLon = Math.floor(clamp(west, -180, 179));
  const maxLon = clamp(Math.ceil(east) - 1, -180, 179);
  const tiles: string[] = [];
  for (let lat = minLat; lat <= maxLat; lat += 1) {
    for (let lon = minLon; lon <= maxLon; lon += 1) {
      tiles.push(hgtTileName(lat, lon));
    }
  }
  return tiles;
}

export function areaOfInterestToHgtTileNames(
  areaOfInterest: ConsoleAreaOfInterest,
): string[] {
  return bboxToHgtTileNames(areaOfInterestToBBox(areaOfInterest));
}

export function hgtTileName(lat: number, lon: number): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${ns}${String(Math.abs(lat)).padStart(2, "0")}${ew}${String(Math.abs(lon)).padStart(3, "0")}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
