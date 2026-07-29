import { parse } from "csv-parse";
import { createReadStream } from "node:fs";
import { open as openFile, readFile, stat } from "node:fs/promises";
import { basename, extname } from "node:path";
import { PMTiles, type Source } from "pmtiles";
import { open as openZip, type Entry, type ZipFile } from "yauzl";
import { env } from "../../env";
import { runCancellableCommand } from "../jobs/cancellable-command";
import {
  validateUpload,
  type SourceFormat,
  type UploadValidation,
} from "./upload-tiling";

export type ArtifactValidationLimits = {
  maxSourceBytes: number;
  maxOutputBytes: number;
  maxZipEntries: number;
  maxZipEntryBytes: number;
  maxZipExpandedBytes: number;
  maxZipCompressionRatio: number;
};

export function artifactValidationLimits(): ArtifactValidationLimits {
  return {
    maxSourceBytes: env.GEODATA_MAX_SOURCE_BYTES,
    maxOutputBytes: env.GEODATA_MAX_OUTPUT_BYTES,
    maxZipEntries: env.GEODATA_ZIP_MAX_ENTRIES,
    maxZipEntryBytes: env.GEODATA_ZIP_MAX_ENTRY_BYTES,
    maxZipExpandedBytes: env.GEODATA_ZIP_MAX_EXPANDED_BYTES,
    maxZipCompressionRatio: env.GEODATA_ZIP_MAX_COMPRESSION_RATIO,
  };
}

export async function validateUploadFile(
  path: string,
  format: SourceFormat,
  csv?: { latitude?: string; longitude?: string },
  limits = artifactValidationLimits(),
): Promise<UploadValidation> {
  const file = await stat(path);
  if (!file.isFile()) throw new Error("Uploaded artifact is not a regular file");
  if (file.size <= 0) throw new Error("Uploaded artifact is empty");
  if (file.size > limits.maxSourceBytes) {
    throw new Error(
      `Uploaded artifact exceeds the ${limits.maxSourceBytes} byte source limit`,
    );
  }

  if (format === "shapefile") {
    await validateShapefileArchive(path, limits);
    return {
      format,
      schema: { fields: {}, columns: [] },
      byteLength: file.size,
    };
  }
  if (format === "csv") {
    return validateCsvFile(path, csv, file.size);
  }
  if (format === "pmtiles") {
    const header = await validatePmtilesFile(path, file.size);
    return {
      format,
      byteLength: file.size,
      bounds: [
        header.minLon,
        header.minLat,
        header.maxLon,
        header.maxLat,
      ],
    };
  }
  if (format === "mbtiles") {
    await validateMbtilesFile(path);
    return { format, byteLength: file.size };
  }

  return validateUpload(await readFile(path), format, csv);
}

export async function validateGeneratedArtifact(
  path: string,
  format: "pmtiles" | "mbtiles",
  limits = artifactValidationLimits(),
) {
  const file = await stat(path);
  if (!file.isFile() || file.size <= 0) {
    throw new Error("Generated artifact is missing or empty");
  }
  if (file.size > limits.maxOutputBytes) {
    throw new Error(
      `Generated artifact exceeds the ${limits.maxOutputBytes} byte output limit`,
    );
  }
  if (format === "pmtiles") {
    await validatePmtilesFile(path, file.size);
  } else {
    await validateMbtilesFile(path);
  }
  return file.size;
}

export async function validateShapefileArchive(
  path: string,
  limits = artifactValidationLimits(),
) {
  const zip = await openZipFile(path);
  const seen = new Set<string>();
  const components = new Map<string, Set<string>>();
  let declaredExpandedBytes = 0;
  let actualExpandedBytes = 0;

  try {
    if (zip.entryCount > limits.maxZipEntries) {
      throw new Error(
        `Shapefile archive exceeds the ${limits.maxZipEntries} entry limit`,
      );
    }

    for await (const entry of zip.eachEntry()) {
      validateZipEntryName(entry.fileName);
      if (entry.isEncrypted() || !entry.canDecodeFileData()) {
        throw new Error(`Shapefile archive entry cannot be decoded: ${entry.fileName}`);
      }

      const normalizedName = entry.fileName.replaceAll("\\", "/");
      const duplicateKey = normalizedName.toLowerCase();
      if (seen.has(duplicateKey)) {
        throw new Error(`Shapefile archive contains duplicate entry: ${entry.fileName}`);
      }
      seen.add(duplicateKey);

      const isDirectory = normalizedName.endsWith("/");
      if (isDirectory) continue;
      const extension = extname(normalizedName).toLowerCase();
      if (isNestedArchive(extension)) {
        throw new Error(
          `Nested archives are not allowed in Shapefile uploads: ${entry.fileName}`,
        );
      }
      if (entry.uncompressedSize > limits.maxZipEntryBytes) {
        throw new Error(
          `Shapefile archive entry exceeds the ${limits.maxZipEntryBytes} byte limit: ${entry.fileName}`,
        );
      }
      declaredExpandedBytes += entry.uncompressedSize;
      if (declaredExpandedBytes > limits.maxZipExpandedBytes) {
        throw new Error(
          `Shapefile archive exceeds the ${limits.maxZipExpandedBytes} byte expanded limit`,
        );
      }
      if (
        entry.uncompressedSize > 0 &&
        (entry.compressedSize === 0 ||
          entry.uncompressedSize / entry.compressedSize >
            limits.maxZipCompressionRatio)
      ) {
        throw new Error(
          `Shapefile archive entry exceeds the ${limits.maxZipCompressionRatio}:1 compression ratio: ${entry.fileName}`,
        );
      }

      const componentBase = normalizedName.slice(0, -extension.length).toLowerCase();
      const extensions = components.get(componentBase) ?? new Set<string>();
      extensions.add(extension);
      components.set(componentBase, extensions);

      actualExpandedBytes += await drainZipEntry(zip, entry, {
        maxEntryBytes: limits.maxZipEntryBytes,
        maxRemainingBytes:
          limits.maxZipExpandedBytes - actualExpandedBytes,
      });
    }
  } finally {
    zip.close();
  }

  const required = [".shp", ".shx", ".dbf"];
  const completeBase = [...components.entries()].find(([, extensions]) =>
    required.every((extension) => extensions.has(extension)),
  );
  if (!completeBase) {
    throw new Error(
      "Shapefile archive must contain matching .shp, .shx, and .dbf files",
    );
  }

  return {
    entries: seen.size,
    expandedBytes: actualExpandedBytes,
    baseName: basename(completeBase[0]),
  };
}

async function validateCsvFile(
  path: string,
  csv: { latitude?: string; longitude?: string } | undefined,
  byteLength: number,
): Promise<UploadValidation> {
  const parser = createReadStream(path).pipe(
    parse({
      bom: true,
      skip_empty_lines: true,
      relax_column_count: false,
    }),
  );
  let columns: string[] | null = null;
  let latitude = "";
  let longitude = "";
  let latIndex = -1;
  let lonIndex = -1;
  let featureCount = 0;
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;

  try {
    for await (const value of parser) {
      const record = (value as unknown[]).map((cell) => String(cell));
      if (!columns) {
        columns = record;
        if (columns.length === 0 || columns.every((column) => !column.trim())) {
          throw new Error("CSV upload has no header row");
        }
        latitude = csv?.latitude ?? inferColumn(columns, ["lat", "latitude", "y"]) ?? "";
        longitude =
          csv?.longitude ?? inferColumn(columns, ["lon", "lng", "longitude", "x"]) ?? "";
        if (!latitude || !longitude) {
          throw new Error(
            "CSV uploads require latitude/longitude columns or explicit csvLatitude/csvLongitude options.",
          );
        }
        latIndex = columns.indexOf(latitude);
        lonIndex = columns.indexOf(longitude);
        if (latIndex < 0 || lonIndex < 0) {
          throw new Error("CSV latitude or longitude column was not found");
        }
        continue;
      }

      featureCount += 1;
      const lat = Number(record[latIndex]);
      const lon = Number(record[lonIndex]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        throw new Error(`CSV row ${featureCount + 1} has invalid coordinates`);
      }
      if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        throw new Error(
          `CSV row ${featureCount + 1} coordinates are outside WGS84 lon/lat bounds`,
        );
      }
      minLon = Math.min(minLon, lon);
      minLat = Math.min(minLat, lat);
      maxLon = Math.max(maxLon, lon);
      maxLat = Math.max(maxLat, lat);
    }
  } catch (error) {
    throw new Error(
      `Invalid CSV: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!columns) throw new Error("CSV upload has no header row");
  if (featureCount === 0) throw new Error("CSV upload has no data rows");
  return {
    format: "csv",
    featureCount,
    bounds: [minLon, minLat, maxLon, maxLat],
    schema: {
      fields: Object.fromEntries(columns.map((column) => [column, "string"])),
      columns,
    },
    csv: { latitude, longitude },
    byteLength,
  };
}

async function validatePmtilesFile(path: string, fileSize: number) {
  const source = new NodeFileSource(path, fileSize);
  try {
    const archive = new PMTiles(source);
    const header = await archive.getHeader();
    const ranges = [
      [header.rootDirectoryOffset, header.rootDirectoryLength],
      [header.jsonMetadataOffset, header.jsonMetadataLength],
      [header.leafDirectoryOffset, header.leafDirectoryLength ?? 0],
      [header.tileDataOffset, header.tileDataLength ?? 0],
    ] as const;
    for (const [offset, length] of ranges) {
      if (
        !Number.isSafeInteger(offset) ||
        !Number.isSafeInteger(length) ||
        offset < 0 ||
        length < 0 ||
        offset + length > fileSize
      ) {
        throw new Error("PMTiles archive contains an out-of-bounds data range");
      }
    }
    if (
      !Number.isInteger(header.minZoom) ||
      !Number.isInteger(header.maxZoom) ||
      header.minZoom < 0 ||
      header.maxZoom > 24 ||
      header.minZoom > header.maxZoom
    ) {
      throw new Error("PMTiles archive contains an invalid zoom range");
    }
    if (
      header.minLon < -180 ||
      header.maxLon > 180 ||
      header.minLat < -90 ||
      header.maxLat > 90 ||
      header.minLon > header.maxLon ||
      header.minLat > header.maxLat
    ) {
      throw new Error("PMTiles archive contains invalid WGS84 bounds");
    }
    await archive.getMetadata();
    return header;
  } catch (error) {
    throw new Error(
      `Invalid PMTiles archive: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    await source.close();
  }
}

async function validateMbtilesFile(path: string) {
  try {
    await runCancellableCommand({
      file: env.PYTHON_PATH,
      args: ["-I", "-c", MBTILES_VALIDATOR_SCRIPT, path],
      timeoutMs: 30_000,
      cancellationPollMs: env.GEODATA_CANCELLATION_POLL_MS,
    });
  } catch (error) {
    throw new Error(
      `Invalid MBTiles database: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

const MBTILES_VALIDATOR_SCRIPT = String.raw`
import sqlite3
import sys
import urllib.parse

path = sys.argv[1]
uri = "file:" + urllib.parse.quote(path, safe="/") + "?mode=ro"
database = sqlite3.connect(uri, uri=True)
try:
    database.execute("PRAGMA query_only = ON")
    quick_check = database.execute("PRAGMA quick_check").fetchall()
    if quick_check != [("ok",)]:
        raise RuntimeError("SQLite quick_check failed")

    tables = {
        row[0]
        for row in database.execute(
            "SELECT name FROM sqlite_master "
            "WHERE type = 'table' AND name IN ('metadata', 'tiles') LIMIT 2"
        )
    }
    if tables != {"metadata", "tiles"}:
        raise RuntimeError("MBTiles database must contain metadata and tiles tables")

    unique_indexes = database.execute(
        "SELECT name FROM pragma_index_list('tiles') WHERE \"unique\" = 1 LIMIT 128"
    ).fetchall()
    coordinate_columns = {"zoom_level", "tile_column", "tile_row"}
    has_coordinate_uniqueness = False
    for (index_name,) in unique_indexes:
        columns = {
            row[0]
            for row in database.execute(
                "SELECT name FROM pragma_index_info(?) ORDER BY seqno LIMIT 16",
                (index_name,),
            )
        }
        if coordinate_columns.issubset(columns):
            has_coordinate_uniqueness = True
            break
    if not has_coordinate_uniqueness:
        raise RuntimeError(
            "MBTiles tiles table must uniquely index "
            "zoom_level, tile_column, and tile_row"
        )
finally:
    database.close()
`

class NodeFileSource implements Source {
  private readonly handlePromise;

  constructor(
    private readonly path: string,
    private readonly size: number,
  ) {
    this.handlePromise = openFile(path, "r");
  }

  getKey() {
    return this.path;
  }

  async getBytes(offset: number, length: number) {
    if (
      !Number.isSafeInteger(offset) ||
      !Number.isSafeInteger(length) ||
      offset < 0 ||
      length < 0 ||
      offset + length > this.size
    ) {
      throw new Error("PMTiles reader requested bytes outside the file");
    }
    const buffer = Buffer.alloc(length);
    const handle = await this.handlePromise;
    const { bytesRead } = await handle.read(buffer, 0, length, offset);
    if (bytesRead !== length) throw new Error("PMTiles archive ended unexpectedly");
    return {
      data: buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength,
      ),
    };
  }

  async close() {
    const handle = await this.handlePromise;
    await handle.close();
  }
}

function openZipFile(path: string): Promise<ZipFile> {
  return new Promise((resolve, reject) => {
    openZip(
      path,
      {
        lazyEntries: true,
        strictFileNames: true,
        validateEntrySizes: true,
      },
      (error, zip) => {
        if (error || !zip) reject(error ?? new Error("Unable to open ZIP archive"));
        else resolve(zip);
      },
    );
  });
}

async function drainZipEntry(
  zip: ZipFile,
  entry: Entry,
  limits: { maxEntryBytes: number; maxRemainingBytes: number },
) {
  const stream = await zip.openReadStreamPromise(entry);
  let bytes = 0;
  for await (const chunk of stream) {
    bytes += Buffer.byteLength(chunk);
    if (bytes > limits.maxEntryBytes || bytes > limits.maxRemainingBytes) {
      stream.destroy(new Error("Shapefile archive expanded size limit exceeded"));
      throw new Error("Shapefile archive expanded size limit exceeded");
    }
  }
  return bytes;
}

function validateZipEntryName(name: string) {
  const normalized = name.replaceAll("\\", "/");
  if (
    name.includes("\0") ||
    normalized.startsWith("/") ||
    /^[a-z]:\//i.test(normalized) ||
    normalized.split("/").some((segment) => segment === ".." || segment === ".")
  ) {
    throw new Error(`Unsafe path in Shapefile archive: ${name}`);
  }
}

function isNestedArchive(extension: string) {
  return [".zip", ".tar", ".gz", ".tgz", ".bz2", ".xz", ".7z", ".rar"].includes(
    extension,
  );
}

function inferColumn(columns: string[], candidates: string[]) {
  const normalized = new Map(
    columns.map((column) => [column.trim().toLowerCase(), column]),
  );
  for (const candidate of candidates) {
    const match = normalized.get(candidate);
    if (match) return match;
  }
  return undefined;
}
