type UploadTilingOptions = {
  minZoom: number;
  maxZoom: number;
  dropDensest?: boolean;
  simplification?: number;
};

export type SourceFormat = "geojson" | "csv" | "shapefile" | "pmtiles" | "mbtiles";

export type UploadValidation = {
  format: SourceFormat;
  featureCount?: number;
  bounds?: [number, number, number, number] | null;
  schema?: { fields: Record<string, string>; columns?: string[] };
  csv?: { latitude: string; longitude: string };
  byteLength: number;
};

type GeoJsonLike = {
  type?: string;
  coordinates?: unknown;
  geometries?: GeoJsonLike[];
  geometry?: GeoJsonLike | null;
  features?: Array<{
    geometry?: GeoJsonLike | null;
    properties?: Record<string, unknown> | null;
  }>;
  properties?: Record<string, unknown> | null;
};

export function buildTippecanoeArgs(params: {
  inputPath: string;
  outputPath: string;
  options: UploadTilingOptions;
}): string[] {
  const args = [
    "-o",
    params.outputPath,
    `-z${params.options.maxZoom}`,
    `-Z${params.options.minZoom}`,
    "--force",
    "--no-tile-compression",
  ];

  if (params.options.dropDensest) {
    args.push("--drop-densest-as-needed");
  } else {
    args.push("--coalesce-densest-as-needed");
  }

  if (params.options.simplification) {
    args.push(`--simplification=${params.options.simplification}`);
  }

  args.push(params.inputPath);
  return args;
}

export function shouldStoreRawFallback(params: {
  missingTippecanoe: boolean;
  allowRawFallback: boolean;
}): boolean {
  return params.missingTippecanoe && params.allowRawFallback;
}

export function missingTippecanoeMessage(path: string): string {
  return `GeoJSON, CSV, and Shapefile tiling require Tippecanoe at ${path}. Set TIPPECANOE_PATH or enable GEODATA_ALLOW_RAW_FALLBACK=true only for local degraded development.`;
}

export function validateUpload(
  data: Buffer,
  format: SourceFormat,
  csv?: { latitude?: string; longitude?: string },
): UploadValidation {
  if (format === "geojson") {
    return validateGeoJsonUpload(data);
  }

  if (format === "csv") {
    return validateCsvUpload(data, csv);
  }

  if (format === "pmtiles") {
    if (data.subarray(0, 7).toString("utf-8") !== "PMTiles") {
      throw new Error("PMTiles upload is missing the PMTiles magic header");
    }
    return { format, byteLength: data.byteLength };
  }

  if (format === "mbtiles") {
    if (data.subarray(0, 16).toString("utf-8") !== "SQLite format 3\0") {
      throw new Error("MBTiles upload is not a valid SQLite database file");
    }
    return { format, byteLength: data.byteLength };
  }

  if (format === "shapefile") {
    if (!isZipArchive(data)) {
      throw new Error("Shapefile upload must be a zipped Shapefile archive");
    }
    return {
      format,
      schema: { fields: {}, columns: [] },
      byteLength: data.byteLength,
    };
  }

  return {
    format,
    schema: { fields: {}, columns: [] },
    byteLength: data.byteLength,
  };
}

function isZipArchive(data: Buffer): boolean {
  if (data.byteLength < 4) return false;
  if (data[0] !== 0x50 || data[1] !== 0x4b) return false;
  return (
    (data[2] === 0x03 && data[3] === 0x04) ||
    (data[2] === 0x05 && data[3] === 0x06) ||
    (data[2] === 0x07 && data[3] === 0x08)
  );
}

function validateGeoJsonUpload(data: Buffer): UploadValidation {
  let geojson: GeoJsonLike;
  try {
    geojson = JSON.parse(data.toString("utf-8")) as GeoJsonLike;
  } catch {
    throw new Error("Invalid GeoJSON: file is not valid JSON");
  }

  if (
    !geojson.type ||
    !["FeatureCollection", "Feature", "GeometryCollection"].includes(
      geojson.type,
    )
  ) {
    throw new Error("Invalid GeoJSON: missing or invalid 'type' property");
  }

  const features = normalizeGeoJsonFeatures(geojson);
  if (geojson.type === "FeatureCollection" && features.length === 0) {
    throw new Error("GeoJSON FeatureCollection has no features");
  }

  const bounds = calculateBounds(geojson);
  if (!bounds) {
    throw new Error("GeoJSON upload has no valid coordinates");
  }

  return {
    format: "geojson",
    featureCount: features.length,
    bounds,
    schema: { fields: summarizeGeoJsonFields(features) },
    byteLength: data.byteLength,
  };
}

function validateCsvUpload(
  data: Buffer,
  csv?: { latitude?: string; longitude?: string },
): UploadValidation {
  const text = data.toString("utf-8").replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const columns = parseCsvLine(lines[0] ?? "");
  if (columns.length === 0) throw new Error("CSV upload has no header row");
  if (lines.length < 2) throw new Error("CSV upload has no data rows");

  const latitude = csv?.latitude ?? inferColumn(columns, ["lat", "latitude", "y"]);
  const longitude = csv?.longitude ?? inferColumn(columns, [
    "lon",
    "lng",
    "longitude",
    "x",
  ]);

  if (!latitude || !longitude) {
    throw new Error(
      "CSV uploads require latitude/longitude columns or explicit csvLatitude/csvLongitude options.",
    );
  }
  requireColumn(columns, latitude, "latitude");
  requireColumn(columns, longitude, "longitude");

  const latIndex = columns.indexOf(latitude);
  const lonIndex = columns.indexOf(longitude);
  const bounds = calculateCsvBounds(lines.slice(1), latIndex, lonIndex, {
    latitude,
    longitude,
  });

  return {
    format: "csv",
    featureCount: lines.length - 1,
    bounds,
    schema: {
      fields: Object.fromEntries(columns.map((col) => [col, "string"])),
      columns,
    },
    csv: { latitude, longitude },
    byteLength: data.byteLength,
  };
}

function calculateCsvBounds(
  rows: string[],
  latIndex: number,
  lonIndex: number,
  labels: { latitude: string; longitude: string },
): [number, number, number, number] {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  let validRows = 0;

  rows.forEach((row, index) => {
    const values = parseCsvLine(row);
    const lat = Number(values[latIndex]);
    const lon = Number(values[lonIndex]);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      throw new Error(
        `CSV row ${index + 2} has invalid ${labels.latitude}/${labels.longitude} coordinates`,
      );
    }
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      throw new Error(
        `CSV row ${index + 2} coordinates are outside WGS84 lon/lat bounds`,
      );
    }

    validRows += 1;
    minLon = Math.min(minLon, lon);
    minLat = Math.min(minLat, lat);
    maxLon = Math.max(maxLon, lon);
    maxLat = Math.max(maxLat, lat);
  });

  if (validRows === 0) {
    throw new Error("CSV upload has no coordinate rows");
  }

  return [minLon, minLat, maxLon, maxLat];
}

function requireColumn(columns: string[], column: string, label: string) {
  if (!columns.includes(column)) {
    throw new Error(`CSV ${label} column '${column}' was not found`);
  }
}

function normalizeGeoJsonFeatures(
  geojson: GeoJsonLike,
): Array<{
  geometry?: GeoJsonLike | null;
  properties?: Record<string, unknown> | null;
}> {
  if (geojson.type === "FeatureCollection") return geojson.features ?? [];
  if (geojson.type === "Feature") {
    return [
      {
        geometry: geojson.geometry,
        properties: geojson.properties,
      },
    ];
  }
  return [{ geometry: geojson, properties: null }];
}

function calculateBounds(
  geojson: GeoJsonLike,
): [number, number, number, number] | null {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  let hasCoords = false;

  function processCoord(coord: number[]) {
    if (coord.length < 2) return;
    const lon = coord[0];
    const lat = coord[1];
    if (
      typeof lon !== "number" ||
      typeof lat !== "number" ||
      !Number.isFinite(lon) ||
      !Number.isFinite(lat)
    ) {
      return;
    }
    if (lon < -180 || lon > 180 || lat < -90 || lat > 90) return;
    hasCoords = true;
    minLon = Math.min(minLon, lon);
    minLat = Math.min(minLat, lat);
    maxLon = Math.max(maxLon, lon);
    maxLat = Math.max(maxLat, lat);
  }

  function processCoords(coords: unknown) {
    if (!Array.isArray(coords)) return;
    if (typeof coords[0] === "number") {
      processCoord(coords as number[]);
    } else {
      for (const coord of coords) processCoords(coord);
    }
  }

  function processGeometry(geom: GeoJsonLike | null | undefined) {
    if (!geom) return;
    if (geom.coordinates) processCoords(geom.coordinates);
    if (geom.geometries) geom.geometries.forEach(processGeometry);
  }

  if (geojson.type === "FeatureCollection") {
    geojson.features?.forEach((feature) => processGeometry(feature.geometry));
  } else if (geojson.type === "Feature") {
    processGeometry(geojson.geometry);
  } else {
    processGeometry(geojson);
  }

  return hasCoords ? [minLon, minLat, maxLon, maxLat] : null;
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]!;
    const next = line[i + 1];
    if (char === '"') {
      if (quoted && next === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === "," && !quoted) {
      values.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  values.push(current.trim());
  return values.map((value) => value.replace(/^"|"$/g, ""));
}

function inferColumn(columns: string[], candidates: string[]): string | undefined {
  const normalized = new Map(columns.map((column) => [column.toLowerCase(), column]));
  for (const candidate of candidates) {
    const match = normalized.get(candidate);
    if (match) return match;
  }
  return undefined;
}

function summarizeGeoJsonFields(
  features: Array<{
    geometry?: GeoJsonLike | null;
    properties?: Record<string, unknown> | null;
  }>,
): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const feature of features.slice(0, 100)) {
    for (const [key, value] of Object.entries(feature.properties ?? {})) {
      if (!(key in fields)) fields[key] = typeof value;
    }
  }
  return fields;
}
