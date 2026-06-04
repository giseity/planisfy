export type TilesetArtifactFormat = "pmtiles" | "mbtiles" | "directory";
export type BasemapArtifactName = "manifest.json" | "tiles.pmtiles" | "style.json";
export type SpriteAssetKind = "json" | "png";
export type GlyphRange = `${number}-${number}`;

const SAFE_SEGMENT_PATTERN = /^[A-Za-z0-9._-]+$/;

export class UnsafeStoragePathSegmentError extends Error {
  constructor(readonly segment: string) {
    super(`Unsafe storage path segment: ${segment}`);
    this.name = "UnsafeStoragePathSegmentError";
  }
}

export function safeSegment(segment: string): string {
  if (!segment || segment === "." || segment === ".." || !SAFE_SEGMENT_PATTERN.test(segment)) {
    throw new UnsafeStoragePathSegmentError(segment);
  }

  return segment;
}

export const StoragePaths = {
  uploadOriginal: (accountId: string, uploadId: string, fileName: string) =>
    `accounts/${safeSegment(accountId)}/uploads/${safeSegment(uploadId)}/original/${safeSegment(fileName)}`,

  datasetVersion: (accountId: string, datasetId: string, version: number, fileName = "features.geojson") =>
    `accounts/${safeSegment(accountId)}/datasets/${safeSegment(datasetId)}/v${version}/${safeSegment(fileName)}`,

  tilesetVersion: (
    accountId: string,
    tilesetId: string,
    version: number,
    format: TilesetArtifactFormat,
  ) =>
    `accounts/${safeSegment(accountId)}/tilesets/${safeSegment(tilesetId)}/v${version}/tiles.${format}`,

  styleVersion: (accountId: string, styleId: string, version: number) =>
    `accounts/${safeSegment(accountId)}/styles/${safeSegment(styleId)}/v${version}/style.json`,

  styleThumbnail: (accountId: string, styleId: string, version: number) =>
    `accounts/${safeSegment(accountId)}/styles/${safeSegment(styleId)}/v${version}/thumbnail.png`,

  basemapRelease: (name: string, version: string, artifact: BasemapArtifactName) =>
    `basemaps/${safeSegment(name)}/${safeSegment(version)}/${safeSegment(artifact)}`,

  spriteAsset: (spriteId: string, kind: SpriteAssetKind) =>
    `sprites/${safeSegment(spriteId)}.${kind}`,

  glyphRange: (fontStack: string, range: GlyphRange) =>
    `glyphs/${safeSegment(fontStack)}/${safeSegment(range)}.pbf`,

  accountPrefix: (accountId: string) => `accounts/${safeSegment(accountId)}/`,

  uploadPrefix: (accountId: string, uploadId: string) =>
    `accounts/${safeSegment(accountId)}/uploads/${safeSegment(uploadId)}/`,

  tilesetPrefix: (accountId: string, tilesetId: string) =>
    `accounts/${safeSegment(accountId)}/tilesets/${safeSegment(tilesetId)}/`,
} as const;

export type ParsedStoragePath =
  | {
      kind: "uploadOriginal";
      accountId: string;
      uploadId: string;
      fileName: string;
    }
  | {
      kind: "tilesetVersion";
      accountId: string;
      tilesetId: string;
      version: number;
      format: TilesetArtifactFormat;
    }
  | {
      kind: "basemapRelease";
      name: string;
      version: string;
      artifact: BasemapArtifactName;
    };

export function parseStoragePath(path: string): ParsedStoragePath | null {
  const upload = path.match(/^accounts\/([^/]+)\/uploads\/([^/]+)\/original\/([^/]+)$/);
  if (upload) {
    return {
      kind: "uploadOriginal",
      accountId: upload[1]!,
      uploadId: upload[2]!,
      fileName: upload[3]!,
    };
  }

  const tileset = path.match(
    /^accounts\/([^/]+)\/tilesets\/([^/]+)\/v([0-9]+)\/tiles\.(pmtiles|mbtiles|directory)$/,
  );
  if (tileset) {
    return {
      kind: "tilesetVersion",
      accountId: tileset[1]!,
      tilesetId: tileset[2]!,
      version: Number(tileset[3]),
      format: tileset[4]! as TilesetArtifactFormat,
    };
  }

  const basemap = path.match(/^basemaps\/([^/]+)\/([^/]+)\/(manifest\.json|tiles\.pmtiles|style\.json)$/);
  if (basemap) {
    return {
      kind: "basemapRelease",
      name: basemap[1]!,
      version: basemap[2]!,
      artifact: basemap[3]! as BasemapArtifactName,
    };
  }

  return null;
}
