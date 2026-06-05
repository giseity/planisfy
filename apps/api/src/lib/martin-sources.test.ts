import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import type { StorageProvider } from "@planisfy/storage";
import { registerPublishedMartinSources } from "./martin-sources";

test("registerPublishedMartinSources writes stable and versioned local aliases", async () => {
  const previousLocalStoragePath = process.env.LOCAL_STORAGE_PATH;
  const previousMartinSourcesPath = process.env.MARTIN_SOURCES_PATH;
  const root = await mkdtemp(join(tmpdir(), "planisfy-martin-sources-"));

  try {
    process.env.LOCAL_STORAGE_PATH = join(root, "storage");
    process.env.MARTIN_SOURCES_PATH = join(
      process.env.LOCAL_STORAGE_PATH,
      "martin-sources",
    );

    const pmtilesKey = "accounts/account/tilesets/tileset/v1/tiles.pmtiles";
    const pmtilesPath = join(process.env.LOCAL_STORAGE_PATH, pmtilesKey);
    await mkdir(dirname(pmtilesPath), { recursive: true });
    await writeFile(pmtilesPath, "pmtiles-fixture");

    const firstRegistration = await registerPublishedMartinSources({
      storageObject: { provider: "local", storageKey: pmtilesKey },
      artifactFormat: "PMTILES",
      ownerHandle: "owner_name",
      tilesetHandle: "roads",
      version: 1,
    });

    assert.ok(firstRegistration);
    assert.equal(
      await readFile(firstRegistration.stablePath, "utf8"),
      "pmtiles-fixture",
    );
    assert.equal(
      await readFile(firstRegistration.versionedPath, "utf8"),
      "pmtiles-fixture",
    );

    const mbtilesKey = "accounts/account/tilesets/tileset/v2/tiles.mbtiles";
    const mbtilesPath = join(process.env.LOCAL_STORAGE_PATH, mbtilesKey);
    await mkdir(dirname(mbtilesPath), { recursive: true });
    await writeFile(mbtilesPath, "mbtiles-fixture");

    const secondRegistration = await registerPublishedMartinSources({
      storageObject: { provider: "local", storageKey: mbtilesKey },
      artifactFormat: "MBTILES",
      ownerHandle: "owner_name",
      tilesetHandle: "roads",
      version: 2,
    });

    assert.ok(secondRegistration);
    assert.equal(
      await readFile(secondRegistration.stablePath, "utf8"),
      "mbtiles-fixture",
    );
    assert.equal(
      await readFile(secondRegistration.versionedPath, "utf8"),
      "mbtiles-fixture",
    );
    assert.equal(existsSync(firstRegistration.stablePath), false);
    assert.equal(existsSync(firstRegistration.versionedPath), true);
  } finally {
    if (previousLocalStoragePath === undefined) {
      delete process.env.LOCAL_STORAGE_PATH;
    } else {
      process.env.LOCAL_STORAGE_PATH = previousLocalStoragePath;
    }

    if (previousMartinSourcesPath === undefined) {
      delete process.env.MARTIN_SOURCES_PATH;
    } else {
      process.env.MARTIN_SOURCES_PATH = previousMartinSourcesPath;
    }

    await rm(root, { recursive: true, force: true });
  }
});

test("registerPublishedMartinSources writes stable and versioned R2 aliases", async () => {
  const previousPrefix = process.env.MARTIN_SOURCES_PREFIX;
  const storage = new MemoryStorage("r2", "planisfy-artifacts", {
    "accounts/account/tilesets/tileset/v4/tiles.pmtiles": "pmtiles-fixture",
  });

  try {
    process.env.MARTIN_SOURCES_PREFIX = "tiles/martin-sources";

    const registration = await registerPublishedMartinSources({
      storageObject: {
        provider: "r2",
        bucket: "planisfy-artifacts",
        storageKey: "accounts/account/tilesets/tileset/v4/tiles.pmtiles",
      },
      artifactFormat: "PMTILES",
      ownerHandle: "owner",
      tilesetHandle: "roads",
      version: 4,
      storage,
    });

    assert.ok(registration);
    assert.equal(registration.provider, "r2");
    assert.equal(registration.stableStorageKey, "tiles/martin-sources/owner.roads.pmtiles");
    assert.equal(registration.versionedStorageKey, "tiles/martin-sources/owner.roads.v4.pmtiles");
    assert.equal(
      storage.objects.get("tiles/martin-sources/owner.roads.pmtiles"),
      "pmtiles-fixture",
    );
    assert.equal(
      storage.objects.get("tiles/martin-sources/owner.roads.v4.pmtiles"),
      "pmtiles-fixture",
    );
  } finally {
    if (previousPrefix === undefined) {
      delete process.env.MARTIN_SOURCES_PREFIX;
    } else {
      process.env.MARTIN_SOURCES_PREFIX = previousPrefix;
    }
  }
});

test("registerPublishedMartinSources skips unsupported providers and raw artifacts", async () => {
  const remoteRegistration = await registerPublishedMartinSources({
    storageObject: { provider: "memory", storageKey: "tiles.pmtiles" },
    artifactFormat: "PMTILES",
    ownerHandle: "owner",
    tilesetHandle: "roads",
    version: 1,
  });
  const directoryRegistration = await registerPublishedMartinSources({
    storageObject: { provider: "local", storageKey: "tiles.directory" },
    artifactFormat: "DIRECTORY",
    ownerHandle: "owner",
    tilesetHandle: "roads",
    version: 1,
  });

  assert.equal(remoteRegistration, null);
  assert.equal(directoryRegistration, null);
});

class MemoryStorage implements StorageProvider {
  objects: Map<string, string>;

  constructor(
    private provider: "s3" | "r2",
    private bucket: string,
    initialObjects: Record<string, string>,
  ) {
    this.objects = new Map(Object.entries(initialObjects));
  }

  async upload(
    key: string,
    data: Buffer | Readable,
    contentType = "application/octet-stream",
  ) {
    const body = Buffer.isBuffer(data) ? data : Buffer.alloc(0);
    this.objects.set(key, body.toString("utf8"));
    return { key, url: this.getUrl(key), size: body.length, contentType };
  }

  async download(key: string) {
    return Buffer.from(this.objects.get(key) ?? "", "utf8");
  }

  async copy(sourceKey: string, targetKey: string) {
    const value = this.objects.get(sourceKey);
    if (value === undefined) throw new Error(`Missing ${sourceKey}`);
    this.objects.set(targetKey, value);
  }

  async delete(key: string) {
    this.objects.delete(key);
  }

  async exists(key: string) {
    return this.objects.has(key);
  }

  getUrl(key: string) {
    return `https://artifacts.example.com/${key}`;
  }

  getInfo() {
    return { provider: this.provider, bucket: this.bucket };
  }
}
