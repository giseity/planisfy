export const SOURCE_PROCESSING_QUEUE_NAME = "source-processing";
export const WORKER_GEODATA_HEARTBEAT_KEY =
  "planisfy:worker-geodata:heartbeat";
export const WORKER_GEODATA_HEARTBEAT_STALE_MS = 60_000;

export type TilesetBuildFormat =
  | "geojson"
  | "csv"
  | "shapefile"
  | "pmtiles"
  | "mbtiles";

export type TilesetBuildOptions = {
  minZoom?: number;
  maxZoom?: number;
  dropDensest?: boolean;
  simplification?: number;
};

export type SourceProcessingJobInput = {
  tilesetId: string;
  uploadId?: string;
  datasetId?: string;
  datasetVersionId?: string;
  storageObjectId?: string;
  uploadKey: string;
  format: TilesetBuildFormat;
  csv?: {
    latitude?: string;
    longitude?: string;
  };
  options?: TilesetBuildOptions;
};

const SOURCE_FORMATS = [
  "geojson",
  "csv",
  "shapefile",
  "pmtiles",
  "mbtiles",
] as const;

export function buildDatasetTilesetProcessingInput(params: {
  tilesetId: string;
  datasetId: string;
  datasetVersionId: string;
  storageObjectId: string;
  storageKey: string;
  options?: TilesetBuildOptions;
}): SourceProcessingJobInput {
  return {
    tilesetId: params.tilesetId,
    datasetId: params.datasetId,
    datasetVersionId: params.datasetVersionId,
    storageObjectId: params.storageObjectId,
    uploadKey: params.storageKey,
    format: "geojson",
    options: params.options,
  };
}

export function parseSourceProcessingJobInput(
  input: unknown,
): SourceProcessingJobInput {
  if (!isRecord(input)) {
    throw new Error("Processing job input is missing");
  }

  const format = input.format;
  if (
    typeof input.tilesetId !== "string" ||
    typeof input.uploadKey !== "string" ||
    !isTilesetBuildFormat(format)
  ) {
    throw new Error(
      "Processing job input cannot reconstruct a tileset build request",
    );
  }

  if (
    typeof input.uploadId !== "string" &&
    typeof input.datasetVersionId !== "string"
  ) {
    throw new Error(
      "Processing job input is missing an upload or dataset version source",
    );
  }

  return {
    tilesetId: input.tilesetId,
    uploadId: optionalString(input.uploadId),
    datasetId: optionalString(input.datasetId),
    datasetVersionId: optionalString(input.datasetVersionId),
    storageObjectId: optionalString(input.storageObjectId),
    uploadKey: input.uploadKey,
    format,
    csv: parseCsvOptions(input.csv),
    options: parseTilesetBuildOptions(input.options),
  };
}

export function buildRetrySourceResource(input: SourceProcessingJobInput): {
  sourceResourceType: "upload" | "dataset";
  sourceResourceId: string;
} {
  if (input.uploadId) {
    return { sourceResourceType: "upload", sourceResourceId: input.uploadId };
  }
  if (input.datasetVersionId) {
    return {
      sourceResourceType: "dataset",
      sourceResourceId: input.datasetVersionId,
    };
  }
  throw new Error("Processing job input is missing a retryable source resource");
}

export function isTilesetBuildFormat(
  value: unknown,
): value is TilesetBuildFormat {
  return SOURCE_FORMATS.includes(value as TilesetBuildFormat);
}

function parseCsvOptions(value: unknown): SourceProcessingJobInput["csv"] {
  if (!isRecord(value)) return undefined;
  const latitude = optionalString(value.latitude);
  const longitude = optionalString(value.longitude);
  return {
    ...(latitude ? { latitude } : {}),
    ...(longitude ? { longitude } : {}),
  };
}

function parseTilesetBuildOptions(
  value: unknown,
): TilesetBuildOptions | undefined {
  if (!isRecord(value)) return undefined;
  const minZoom = optionalNumber(value.minZoom);
  const maxZoom = optionalNumber(value.maxZoom);
  const dropDensest = optionalBoolean(value.dropDensest);
  const simplification = optionalNumber(value.simplification);
  return {
    ...(minZoom !== undefined ? { minZoom } : {}),
    ...(maxZoom !== undefined ? { maxZoom } : {}),
    ...(dropDensest !== undefined ? { dropDensest } : {}),
    ...(simplification !== undefined ? { simplification } : {}),
  };
}

function optionalString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function optionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function optionalBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
