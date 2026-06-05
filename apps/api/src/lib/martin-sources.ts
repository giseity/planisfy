import { existsSync } from "node:fs";
import { copyFile, link, mkdir, symlink, unlink } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { getStorage, type StorageProvider } from "@planisfy/storage";

type TileArtifactFormat = "PMTILES" | "MBTILES" | "DIRECTORY";

interface LocalStorageObject {
  provider: string;
  bucket?: string;
  storageKey: string;
}

export interface MartinSourceRegistration {
  stableSource: string;
  versionedSource: string;
  stablePath: string;
  versionedPath: string;
  provider: "local" | "s3" | "r2";
  stableStorageKey?: string;
  versionedStorageKey?: string;
  stableUrl?: string;
  versionedUrl?: string;
}

export async function registerPublishedMartinSources({
  storageObject,
  artifactFormat,
  ownerHandle,
  tilesetHandle,
  version,
  storage = getStorage(),
}: {
  storageObject: LocalStorageObject;
  artifactFormat: TileArtifactFormat;
  ownerHandle: string;
  tilesetHandle: string;
  version: number;
  storage?: StorageProvider;
}): Promise<MartinSourceRegistration | null> {
  if (artifactFormat !== "PMTILES" && artifactFormat !== "MBTILES") return null;

  const extension = artifactFormat === "MBTILES" ? "mbtiles" : "pmtiles";
  const stableSource = `${ownerHandle}.${tilesetHandle}`;
  const versionedSource = `${stableSource}.v${version}`;

  assertSafeMartinSource(stableSource);
  assertSafeMartinSource(versionedSource);

  if (storageObject.provider === "local") {
    return registerLocalMartinSources({
      storageKey: storageObject.storageKey,
      extension,
      stableSource,
      versionedSource,
    });
  }

  if (storageObject.provider === "r2" || storageObject.provider === "s3") {
    return registerObjectStorageMartinSources({
      storage,
      storageObject,
      extension,
      stableSource,
      versionedSource,
    });
  }

  return null;
}

async function registerLocalMartinSources({
  storageKey,
  extension,
  stableSource,
  versionedSource,
}: {
  storageKey: string;
  extension: "pmtiles" | "mbtiles";
  stableSource: string;
  versionedSource: string;
}): Promise<MartinSourceRegistration> {
  const localStoragePath =
    process.env.LOCAL_STORAGE_PATH ?? join(process.cwd(), ".storage");
  const sourcesDir =
    process.env.MARTIN_SOURCES_PATH ?? join(localStoragePath, "martin-sources");
  const targetPath = join(localStoragePath, storageKey);
  const stablePath = join(sourcesDir, `${stableSource}.${extension}`);
  const versionedPath = join(sourcesDir, `${versionedSource}.${extension}`);
  const staleExtension = extension === "pmtiles" ? "mbtiles" : "pmtiles";

  await mkdir(sourcesDir, { recursive: true });
  await unlinkIfExists(join(sourcesDir, `${stableSource}.${staleExtension}`));
  await unlinkIfExists(
    join(sourcesDir, `${versionedSource}.${staleExtension}`),
  );
  await replaceAlias(stablePath, targetPath);
  await replaceAlias(versionedPath, targetPath);

  return {
    stableSource,
    versionedSource,
    stablePath,
    versionedPath,
    provider: "local",
  };
}

async function registerObjectStorageMartinSources({
  storage,
  storageObject,
  extension,
  stableSource,
  versionedSource,
}: {
  storage: StorageProvider;
  storageObject: LocalStorageObject;
  extension: "pmtiles" | "mbtiles";
  stableSource: string;
  versionedSource: string;
}): Promise<MartinSourceRegistration> {
  const info = storage.getInfo();
  if (info.provider !== storageObject.provider) {
    throw new Error(
      `Storage provider mismatch: artifact uses ${storageObject.provider}, configured storage is ${info.provider}`,
    );
  }
  if (storageObject.bucket && storageObject.bucket !== info.bucket) {
    throw new Error(
      `Storage bucket mismatch: artifact uses ${storageObject.bucket}, configured storage is ${info.bucket}`,
    );
  }
  if (!(await storage.exists(storageObject.storageKey))) {
    throw new Error(`Published tileset artifact not found: ${storageObject.storageKey}`);
  }

  const prefix = normalizeStoragePrefix(
    process.env.MARTIN_SOURCES_PREFIX ?? "martin-sources",
  );
  const stableStorageKey = `${prefix}/${stableSource}.${extension}`;
  const versionedStorageKey = `${prefix}/${versionedSource}.${extension}`;
  const staleExtension = extension === "pmtiles" ? "mbtiles" : "pmtiles";

  await storage.delete(`${prefix}/${stableSource}.${staleExtension}`);
  await storage.delete(`${prefix}/${versionedSource}.${staleExtension}`);
  await storage.copy(storageObject.storageKey, stableStorageKey);
  await storage.copy(storageObject.storageKey, versionedStorageKey);

  return {
    stableSource,
    versionedSource,
    stablePath: stableStorageKey,
    versionedPath: versionedStorageKey,
    provider: info.provider,
    stableStorageKey,
    versionedStorageKey,
    stableUrl: storage.getUrl(stableStorageKey),
    versionedUrl: storage.getUrl(versionedStorageKey),
  };
}

function assertSafeMartinSource(source: string) {
  if (!/^[A-Za-z0-9._-]+$/.test(source)) {
    throw new Error(`Unsafe Martin source name: ${source}`);
  }
}

async function replaceAlias(aliasPath: string, targetPath: string) {
  if (!existsSync(targetPath)) {
    throw new Error(`Published tileset artifact not found: ${targetPath}`);
  }

  await unlinkIfExists(aliasPath);
  try {
    await symlink(relative(dirname(aliasPath), targetPath), aliasPath);
  } catch {
    try {
      await link(targetPath, aliasPath);
    } catch {
      await copyFile(targetPath, aliasPath);
    }
  }
}

async function unlinkIfExists(path: string) {
  try {
    await unlink(path);
  } catch (err) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      err.code === "ENOENT"
    ) {
      return;
    }
    throw err;
  }
}

function normalizeStoragePrefix(prefix: string) {
  return prefix.replace(/^\/+|\/+$/g, "") || "martin-sources";
}
