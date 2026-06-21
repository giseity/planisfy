export type TilesetArtifactFormat = "pmtiles" | "mbtiles" | "directory";
export type BasemapArtifactName =
  | "manifest.json"
  | "tiles.pmtiles"
  | "style.json";
export type SpriteAssetKind = "json" | "png";
export type SpriteScale = 1 | 2;
export type GlyphRange = `${number}-${number}`;

const SAFE_SEGMENT_PATTERN = /^[A-Za-z0-9._-]+$/;

export class UnsafeStoragePathSegmentError extends Error {
  constructor(readonly segment: string) {
    super(`Unsafe storage path segment: ${segment}`);
    this.name = "UnsafeStoragePathSegmentError";
  }
}

export function safeSegment(segment: string): string {
  if (
    !segment ||
    segment === "." ||
    segment === ".." ||
    !SAFE_SEGMENT_PATTERN.test(segment)
  ) {
    throw new UnsafeStoragePathSegmentError(segment);
  }

  return segment;
}

export const StoragePaths = {
  uploadOriginal: (accountId: string, uploadId: string, fileName: string) =>
    `accounts/${safeSegment(accountId)}/uploads/${safeSegment(uploadId)}/original/${safeSegment(fileName)}`,

  datasetVersion: (
    accountId: string,
    datasetId: string,
    version: number,
    fileName = "features.geojson",
  ) =>
    `accounts/${safeSegment(accountId)}/datasets/${safeSegment(datasetId)}/v${version}/${safeSegment(fileName)}`,

  tilesetVersion: (
    accountId: string,
    tilesetId: string,
    version: number,
    format: TilesetArtifactFormat,
  ) =>
    `accounts/${safeSegment(accountId)}/tilesets/${safeSegment(tilesetId)}/v${version}/tiles.${format}`,

  tilesetSourceArtifact: (
    accountId: string,
    sourceId: string,
    fileName: string,
  ) =>
    `accounts/${safeSegment(accountId)}/tileset-sources/${safeSegment(sourceId)}/${safeSegment(fileName)}`,

  styleVersion: (accountId: string, styleId: string, version: number) =>
    `accounts/${safeSegment(accountId)}/styles/${safeSegment(styleId)}/v${version}/style.json`,

  styleThumbnail: (accountId: string, styleId: string, version: number) =>
    `accounts/${safeSegment(accountId)}/styles/${safeSegment(styleId)}/v${version}/thumbnail.png`,

  accountSpriteAsset: (accountId: string, assetId: string, fileName: string) =>
    `accounts/${safeSegment(accountId)}/sprite-assets/${safeSegment(assetId)}/${safeSegment(fileName)}`,

  profileAvatar: (accountId: string, avatarId: string, fileName: string) =>
    `accounts/${safeSegment(accountId)}/profile/avatar/${safeSegment(avatarId)}/${safeSegment(fileName)}`,

  basemapRelease: (
    name: string,
    version: string,
    artifact: BasemapArtifactName,
  ) =>
    `basemaps/${safeSegment(name)}/${safeSegment(version)}/${safeSegment(artifact)}`,

  spriteAsset: (
    spriteId: string,
    kind: SpriteAssetKind,
    scale: SpriteScale = 1,
  ) => `sprites/${safeSegment(spriteId)}${scale === 2 ? "@2x" : ""}.${kind}`,

  glyphRange: (fontStack: string, range: GlyphRange) =>
    `glyphs/${safeSegment(fontStack)}/${safeSegment(range)}.pbf`,

  accountPrefix: (accountId: string) => `accounts/${safeSegment(accountId)}/`,

  uploadPrefix: (accountId: string, uploadId: string) =>
    `accounts/${safeSegment(accountId)}/uploads/${safeSegment(uploadId)}/`,

  tilesetPrefix: (accountId: string, tilesetId: string) =>
    `accounts/${safeSegment(accountId)}/tilesets/${safeSegment(tilesetId)}/`,

  tilesetSourcePrefix: (accountId: string, sourceId: string) =>
    `accounts/${safeSegment(accountId)}/tileset-sources/${safeSegment(sourceId)}/`,
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
      kind: "tilesetSourceArtifact";
      accountId: string;
      sourceId: string;
      fileName: string;
    }
  | {
      kind: "basemapRelease";
      name: string;
      version: string;
      artifact: BasemapArtifactName;
    };

export function parseStoragePath(path: string): ParsedStoragePath | null {
  const upload = path.match(
    /^accounts\/([^/]+)\/uploads\/([^/]+)\/original\/([^/]+)$/,
  );
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

  const tilesetSource = path.match(
    /^accounts\/([^/]+)\/tileset-sources\/([^/]+)\/([^/]+)$/,
  );
  if (tilesetSource) {
    return {
      kind: "tilesetSourceArtifact",
      accountId: tilesetSource[1]!,
      sourceId: tilesetSource[2]!,
      fileName: tilesetSource[3]!,
    };
  }

  const basemap = path.match(
    /^basemaps\/([^/]+)\/([^/]+)\/(manifest\.json|tiles\.pmtiles|style\.json)$/,
  );
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
