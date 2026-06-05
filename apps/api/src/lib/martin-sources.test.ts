import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
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

test("registerPublishedMartinSources skips non-local and raw artifacts", async () => {
  const remoteRegistration = await registerPublishedMartinSources({
    storageObject: { provider: "s3", storageKey: "tiles.pmtiles" },
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
