import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  NodeFileSource,
  type ArtifactValidationLimits,
  validateGeneratedArtifact,
  validateShapefileArchive,
  validateUploadFile,
} from "./artifact-validation";

const limits: ArtifactValidationLimits = {
  maxSourceBytes: 1024 * 1024,
  maxOutputBytes: 1024 * 1024,
  maxZipEntries: 8,
  maxZipEntryBytes: 256 * 1024,
  maxZipExpandedBytes: 512 * 1024,
  maxZipCompressionRatio: 20,
};
const execFileAsync = promisify(execFile);

test("CSV validation follows RFC 4180 quoting and multiline records", async () => {
  await withTempDir(async (directory) => {
    const path = join(directory, "points.csv");
    await writeFile(
      path,
      'name,lat,lon\r\n"Depot, north",48.7,9.1\r\n"Hub\r\nannex",48.9,9.3\r\n',
    );

    const result = await validateUploadFile(path, "csv", undefined, limits);

    assert.equal(result.featureCount, 2);
    assert.deepEqual(result.bounds, [9.1, 48.7, 9.3, 48.9]);
  });
});

test("Shapefile validation requires a safe matching component set", async () => {
  await withTempDir(async (directory) => {
    const validPath = join(directory, "valid.zip");
    await writeFile(
      validPath,
      createStoredZip([
        ["roads.shp", "shape"],
        ["roads.shx", "index"],
        ["roads.dbf", "table"],
      ]),
    );
    const result = await validateShapefileArchive(validPath, limits);
    assert.equal(result.baseName, "roads");

    const unsafePath = join(directory, "unsafe.zip");
    await writeFile(
      unsafePath,
      createStoredZip([
        ["../roads.shp", "shape"],
        ["roads.shx", "index"],
        ["roads.dbf", "table"],
      ]),
    );
    await assert.rejects(
      validateShapefileArchive(unsafePath, limits),
      /Unsafe path|invalid relative path/,
    );
  });
});

test("MBTiles validation checks SQLite integrity, tables, and coordinate uniqueness", async () => {
  await withTempDir(async (directory) => {
    const validPath = join(directory, "valid.mbtiles");
    await createSqliteDatabase(
      validPath,
      `
      CREATE TABLE metadata (name TEXT, value TEXT);
      CREATE TABLE tiles (
        zoom_level INTEGER NOT NULL,
        tile_column INTEGER NOT NULL,
        tile_row INTEGER NOT NULL,
        tile_data BLOB NOT NULL,
        UNIQUE (zoom_level, tile_column, tile_row)
      );
      INSERT INTO metadata VALUES ('format', 'pbf');
    `,
    );

    const result = await validateUploadFile(validPath, "mbtiles", undefined, limits);
    assert.equal(result.format, "mbtiles");
    await validateGeneratedArtifact(validPath, "mbtiles", limits);

    const invalidPath = join(directory, "invalid.mbtiles");
    await createSqliteDatabase(
      invalidPath,
      `
      CREATE TABLE metadata (name TEXT, value TEXT);
      CREATE TABLE tiles (
        zoom_level INTEGER,
        tile_column INTEGER,
        tile_row INTEGER,
        tile_data BLOB
      );
    `,
    );
    await assert.rejects(
      validateUploadFile(invalidPath, "mbtiles", undefined, limits),
      /uniquely index/,
    );
  });
});

async function createSqliteDatabase(path: string, statements: string) {
  await execFileAsync(
    process.env.PYTHON_PATH ?? "python3",
    [
      "-I",
      "-c",
      [
        "import sqlite3, sys",
        "database = sqlite3.connect(sys.argv[1])",
        "database.executescript(sys.argv[2])",
        "database.close()",
      ].join("; "),
      path,
      statements,
    ],
    { timeout: 10_000, maxBuffer: 64 * 1024 },
  );
}

test("PMTiles validation rejects magic-header-only impostors", async () => {
  await withTempDir(async (directory) => {
    const path = join(directory, "fake.pmtiles");
    await writeFile(path, "PMTiles fixture bytes");
    await assert.rejects(
      validateUploadFile(path, "pmtiles", undefined, limits),
      /Invalid PMTiles archive/,
    );
  });
});

test("PMTiles file reads clamp the initial range at EOF", async () => {
  await withTempDir(async (directory) => {
    const path = join(directory, "small.pmtiles");
    const contents = Buffer.from("small PMTiles fixture");
    await writeFile(path, contents);
    const source = new NodeFileSource(path, contents.length);

    try {
      const response = await source.getBytes(0, 16_384);
      assert.deepEqual(Buffer.from(response.data), contents);
      await assert.rejects(
        source.getBytes(contents.length + 1, 1),
        /requested bytes outside the file/,
      );
    } finally {
      await source.close();
    }
  });
});

async function withTempDir(run: (directory: string) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), "planisfy-artifact-test-"));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function createStoredZip(entries: Array<[name: string, contents: string]>) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const [name, contents] of entries) {
    const nameBytes = Buffer.from(name);
    const data = Buffer.from(contents);
    const checksum = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    localParts.push(local, nameBytes, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBytes);
    offset += local.length + nameBytes.length + data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

function crc32(data: Buffer) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
