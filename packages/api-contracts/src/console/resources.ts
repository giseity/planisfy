export interface ConsoleVectorLayer {
  id: string;
  fields?: Record<string, string>;
  description?: string;
  minzoom?: number;
  maxzoom?: number;
}

export interface ConsoleTilesetVersion {
  id: string;
  tilesetId: string;
  version: number;
  buildJobId: string | null;
  format: string;
  artifactStorageObjectId: string | null;
  schema: {
    vector_layers?: ConsoleVectorLayer[];
  } | null;
  bounds: unknown;
  minZoom: number | null;
  maxZoom: number | null;
  createdAt: string;
  publishedAt: string | null;
  artifact: ConsoleStorageArtifact | null;
}

export interface ConsoleUploadValidation {
  format?: string;
  featureCount?: number;
  bounds?: [number, number, number, number] | null;
  schema?: {
    fields?: Record<string, string>;
    columns?: string[];
  };
  csv?: {
    latitude?: string;
    longitude?: string;
  };
  byteLength?: number;
}

export interface ConsoleUpload {
  id: string;
  accountId: string;
  originalFileName: string;
  contentType: string | null;
  size: number | null;
  storageObjectId: string | null;
  artifactAvailability: ConsoleArtifactAvailability | null;
  status: string;
  validationResult: ConsoleUploadValidation | null;
  linkedTilesetId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConsoleStorageArtifact {
  id: string;
  provider: string;
  bucket: string | null;
  storageKey: string;
  fileName: string | null;
  contentType: string | null;
  size: number | null;
  url: string;
  availability: ConsoleArtifactAvailability;
}

export type ConsoleArtifactAvailability =
  | { ok: true }
  | { ok: false; code: string; message: string };

export interface ConsoleSpriteAsset {
  id: string;
  name: string;
  folder: string;
  description: string | null;
  sourceFormat: "png" | "svg" | string;
  width: number;
  height: number;
  size?: number | null;
  tags: string[];
  previewUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConsoleTileset {
  id: string;
  accountId: string;
  linkedDatasetId: string | null;
  ownerHandle: string | null;
  name: string;
  handle: string;
  description: string | null;
  type: "VECTOR" | "RASTER" | string;
  status: string;
  currentVersionId: string | null;
  bounds: unknown;
  minZoom: number | null;
  maxZoom: number | null;
  layerMetadata: {
    vector_layers?: ConsoleVectorLayer[];
  } | null;
  uploads: ConsoleUpload[];
  latestUpload: ConsoleUpload | null;
  versions: ConsoleTilesetVersion[];
  latestVersion: ConsoleTilesetVersion | null;
  currentVersion: ConsoleTilesetVersion | null;
  isPublished: boolean;
  tilejsonUrl: string | null;
  versionedTilejsonUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConsoleProcessingJob {
  id: string;
  accountId: string;
  type: string;
  status: string;
  progress: number;
  retryCount: number;
  cancelRequestedAt: string | null;
  input: {
    tilesetId?: string;
    uploadId?: string;
    datasetId?: string;
    datasetVersionId?: string;
    format?: string;
  } | null;
  output: {
    stage?: string;
    storageKey?: string;
    fallback?: string;
  } | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  executionTargetId?: string | null;
  workerProfileId?: string | null;
}

export interface TilesetUploadOptions {
  name: string;
  handle: string;
  description?: string;
  minZoom?: number;
  maxZoom?: number;
  csvLatitude?: string;
  csvLongitude?: string;
  executionTargetId?: string;
  workerProfileId?: string;
}

export interface TilesetUploadResult {
  upload: unknown;
  tileset: unknown;
  processingJob: unknown;
}

export interface DatasetTilesetOptions {
  handle: string;
  name: string;
  description?: string;
  datasetVersionId?: string;
  minZoom?: number;
  maxZoom?: number;
  executionTargetId?: string;
  workerProfileId?: string;
}

export interface DatasetTilesetResult {
  dataset: unknown;
  datasetVersion: unknown;
  tileset: ConsoleTileset;
  processingJob: ConsoleProcessingJob;
}

export interface ConsoleSavedRegion {
  id: string;
  accountId: string;
  handle: string;
  name: string;
  description: string | null;
  bbox: [number, number, number, number];
  geometry: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface SavedRegionOptions {
  handle: string;
  name: string;
  description?: string;
  bbox: [number, number, number, number];
  geometry?: unknown;
}

export interface ConsoleSourceImport {
  id: string;
  accountId: string;
  sourceConnectionId: string | null;
  regionId: string | null;
  datasetId: string | null;
  processingJobId: string | null;
  provider: "OVERTURE" | "NATURAL_EARTH" | "CUSTOM" | string;
  sourceName: string;
  status: string;
  input: {
    theme?: string;
    type?: string;
    catalog?: {
      label?: string;
      geometry?: string[];
      defaultLayerId?: string;
    };
  } | null;
  output: {
    stage?: string;
    datasetVersionId?: string;
    featureCount?: number;
    bounds?: [number, number, number, number] | null;
    schema?: Record<string, unknown>;
    warnings?: string[];
  } | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OvertureCatalogType {
  theme: string;
  type: string;
  label: string;
  description: string;
  geometry: string[];
  defaultLayerId: string;
}

export interface OvertureCatalogTheme {
  theme: string;
  label: string;
  description: string;
  types: OvertureCatalogType[];
}

export interface OvertureImportOptions {
  handle: string;
  name: string;
  description?: string;
  regionId: string;
  sourceConnectionId?: string;
  theme: string;
  type?: string;
}

export interface OvertureImportResult {
  dataset: unknown;
  sourceImport: ConsoleSourceImport;
  processingJob: ConsoleProcessingJob;
}

export interface StylePublishResponse {
  id: string;
  handle: string;
  name: string;
  isPublic: boolean;
  version: number;
  publishedVersion: number;
}
