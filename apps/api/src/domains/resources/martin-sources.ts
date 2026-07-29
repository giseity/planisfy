import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { link, mkdir, rename, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { getStorage, type StorageProvider } from '@planisfy/storage'

type TileArtifactFormat = 'PMTILES' | 'MBTILES' | 'DIRECTORY'

interface LocalStorageObject {
  provider: string
  bucket?: string
  storageKey: string
}

export interface PublishedTileAliasRegistration {
  versionedAlias: string
  versionedPath: string
  delivery: 'martin' | 'object-storage'
  provider: 'local' | 's3' | 'r2'
  aliasMode: 'hardlink' | 'object_copy'
  versionedStorageKey?: string
  versionedUrl?: string
}

export async function registerPublishedTileAliases({
  storageObject,
  artifactFormat,
  ownerHandle,
  tilesetHandle,
  version,
  storage = getStorage(),
}: {
  storageObject: LocalStorageObject
  artifactFormat: TileArtifactFormat
  ownerHandle: string
  tilesetHandle: string
  version: number
  storage?: StorageProvider
}): Promise<PublishedTileAliasRegistration | null> {
  if (artifactFormat !== 'PMTILES' && artifactFormat !== 'MBTILES') return null

  const extension = artifactFormat === 'MBTILES' ? 'mbtiles' : 'pmtiles'
  const versionedSource = `${ownerHandle}.${tilesetHandle}.v${version}`

  assertSafeMartinSource(versionedSource)

  if (storageObject.provider === 'local') {
    return registerLocalMartinSources({
      storageKey: storageObject.storageKey,
      extension,
      versionedSource,
    })
  }

  if (storageObject.provider === 'r2' || storageObject.provider === 's3') {
    return registerObjectStorageMartinSources({
      storage,
      storageObject,
      extension,
      versionedSource,
    })
  }

  return null
}

async function registerLocalMartinSources({
  storageKey,
  extension,
  versionedSource,
}: {
  storageKey: string
  extension: 'pmtiles' | 'mbtiles'
  versionedSource: string
}): Promise<PublishedTileAliasRegistration> {
  const localStoragePath = process.env.LOCAL_STORAGE_PATH ?? join(process.cwd(), '.storage')
  const sourcesDir = process.env.MARTIN_SOURCES_PATH ?? join(localStoragePath, 'martin-sources')
  const targetPath = join(localStoragePath, storageKey)
  const versionedPath = join(sourcesDir, `${versionedSource}.${extension}`)
  const staleExtension = extension === 'pmtiles' ? 'mbtiles' : 'pmtiles'

  await mkdir(sourcesDir, { recursive: true })
  await replaceAliasAtomically(versionedPath, targetPath)
  await unlinkIfExists(join(sourcesDir, `${versionedSource}.${staleExtension}`))

  return {
    versionedAlias: versionedSource,
    versionedPath,
    delivery: 'martin',
    provider: 'local',
    aliasMode: 'hardlink',
  }
}

async function registerObjectStorageMartinSources({
  storage,
  storageObject,
  extension,
  versionedSource,
}: {
  storage: StorageProvider
  storageObject: LocalStorageObject
  extension: 'pmtiles' | 'mbtiles'
  versionedSource: string
}): Promise<PublishedTileAliasRegistration> {
  const info = storage.getInfo()
  if (info.provider !== storageObject.provider) {
    throw new Error(
      `Storage provider mismatch: artifact uses ${storageObject.provider}, configured storage is ${info.provider}`
    )
  }
  if (storageObject.bucket && storageObject.bucket !== info.bucket) {
    throw new Error(
      `Storage bucket mismatch: artifact uses ${storageObject.bucket}, configured storage is ${info.bucket}`
    )
  }
  if (!(await storage.exists(storageObject.storageKey))) {
    throw new Error(`Published tileset artifact not found: ${storageObject.storageKey}`)
  }

  const prefix = normalizeStoragePrefix(
    process.env.TILE_ALIAS_STORAGE_PREFIX ?? process.env.MARTIN_SOURCES_PREFIX ?? 'tile-aliases'
  )
  const versionedStorageKey = `${prefix}/${versionedSource}.${extension}`
  const staleExtension = extension === 'pmtiles' ? 'mbtiles' : 'pmtiles'
  const sourceMetadata = await storage.getMetadata(storageObject.storageKey)
  if (!sourceMetadata) {
    throw new Error(`Published tileset artifact not found: ${storageObject.storageKey}`)
  }

  await storage.copy(storageObject.storageKey, versionedStorageKey)
  const aliasMetadata = await storage.getMetadata(versionedStorageKey)
  if (!aliasMetadata || aliasMetadata.size !== sourceMetadata.size) {
    throw new Error(`Published tileset alias verification failed: ${versionedStorageKey}`)
  }
  await storage.delete(`${prefix}/${versionedSource}.${staleExtension}`)

  return {
    versionedAlias: versionedSource,
    versionedPath: versionedStorageKey,
    delivery: 'object-storage',
    provider: info.provider,
    aliasMode: 'object_copy',
    versionedStorageKey,
    versionedUrl: storage.getUrl(versionedStorageKey),
  }
}

function assertSafeMartinSource(source: string) {
  if (!/^[A-Za-z0-9._-]+$/.test(source)) {
    throw new Error(`Unsafe Martin source name: ${source}`)
  }
}

async function replaceAliasAtomically(aliasPath: string, targetPath: string) {
  if (!existsSync(targetPath)) {
    throw new Error(`Published tileset artifact not found: ${targetPath}`)
  }

  const temporaryAliasPath = `${aliasPath}.${randomUUID()}.tmp`
  try {
    await link(targetPath, temporaryAliasPath)
    await rename(temporaryAliasPath, aliasPath)
  } catch (err) {
    await unlinkIfExists(temporaryAliasPath)
    throw new Error(
      `Published tileset alias hardlink failed for ${aliasPath}; ensure LOCAL_STORAGE_PATH and MARTIN_SOURCES_PATH are on one filesystem that supports hardlinks. ${
        err instanceof Error ? err.message : String(err)
      }`
    )
  }
}

async function unlinkIfExists(path: string) {
  try {
    await unlink(path)
  } catch (err) {
    if (typeof err === 'object' && err !== null && 'code' in err && err.code === 'ENOENT') {
      return
    }
    throw err
  }
}

function normalizeStoragePrefix(prefix: string) {
  return prefix.replace(/^\/+|\/+$/g, '') || 'tile-aliases'
}
