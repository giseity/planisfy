export type TilesetBuildFormat =
  | "geojson"
  | "csv"
  | "shapefile"
  | "pmtiles"
  | "mbtiles";

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
  options?: Record<string, unknown>;
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
  options?: Record<string, unknown>;
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
  if (typeof input !== "object" || input === null) {
    throw new Error("Processing job input is missing");
  }

  const candidate = input as Partial<SourceProcessingJobInput>;
  if (
    !candidate.tilesetId ||
    !candidate.uploadKey ||
    !candidate.format ||
    !SOURCE_FORMATS.includes(candidate.format)
  ) {
    throw new Error("Processing job input cannot reconstruct a tileset build request");
  }

  if (!candidate.uploadId && !candidate.datasetVersionId) {
    throw new Error("Processing job input is missing an upload or dataset version source");
  }

  return {
    tilesetId: candidate.tilesetId,
    uploadId: candidate.uploadId,
    datasetId: candidate.datasetId,
    datasetVersionId: candidate.datasetVersionId,
    storageObjectId: candidate.storageObjectId,
    uploadKey: candidate.uploadKey,
    format: candidate.format,
    csv: candidate.csv,
    options: candidate.options,
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
