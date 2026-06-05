import { existsSync } from "node:fs";
import { copyFile, link, mkdir, symlink, unlink } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

type TileArtifactFormat = "PMTILES" | "MBTILES" | "DIRECTORY";

interface LocalStorageObject {
  provider: string;
  storageKey: string;
}

export interface MartinSourceRegistration {
  stableSource: string;
  versionedSource: string;
  stablePath: string;
  versionedPath: string;
}

export async function registerPublishedMartinSources({
  storageObject,
  artifactFormat,
  ownerHandle,
  tilesetHandle,
  version,
}: {
  storageObject: LocalStorageObject;
  artifactFormat: TileArtifactFormat;
  ownerHandle: string;
  tilesetHandle: string;
  version: number;
}): Promise<MartinSourceRegistration | null> {
  if (storageObject.provider !== "local") return null;
  if (artifactFormat !== "PMTILES" && artifactFormat !== "MBTILES") return null;

  const localStoragePath =
    process.env.LOCAL_STORAGE_PATH ?? join(process.cwd(), ".storage");
  const sourcesDir =
    process.env.MARTIN_SOURCES_PATH ?? join(localStoragePath, "martin-sources");
  const extension = artifactFormat === "MBTILES" ? "mbtiles" : "pmtiles";
  const stableSource = `${ownerHandle}.${tilesetHandle}`;
  const versionedSource = `${stableSource}.v${version}`;

  assertSafeMartinSource(stableSource);
  assertSafeMartinSource(versionedSource);

  const targetPath = join(localStoragePath, storageObject.storageKey);
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
