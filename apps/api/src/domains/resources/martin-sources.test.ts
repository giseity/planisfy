import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { Readable } from 'node:stream'
import test from 'node:test'
import type { StorageProvider } from '@planisfy/storage'
import { registerPublishedTileAliases } from './martin-sources'

test('registerPublishedTileAliases writes immutable versioned local Martin aliases', async () => {
  const previousLocalStoragePath = process.env.LOCAL_STORAGE_PATH
  const previousMartinSourcesPath = process.env.MARTIN_SOURCES_PATH
  const root = await mkdtemp(join(tmpdir(), 'planisfy-martin-sources-'))

  try {
    process.env.LOCAL_STORAGE_PATH = join(root, 'storage')
    process.env.MARTIN_SOURCES_PATH = join(process.env.LOCAL_STORAGE_PATH, 'martin-sources')

    const pmtilesKey = 'accounts/account/tilesets/tileset/v1/tiles.pmtiles'
    const pmtilesPath = join(process.env.LOCAL_STORAGE_PATH, pmtilesKey)
    await mkdir(dirname(pmtilesPath), { recursive: true })
    await writeFile(pmtilesPath, 'pmtiles-fixture')

    const firstRegistration = await registerPublishedTileAliases({
      storageObject: { provider: 'local', storageKey: pmtilesKey },
      artifactFormat: 'PMTILES',
      ownerHandle: 'owner_name',
      tilesetHandle: 'roads',
      version: 1,
    })

    assert.ok(firstRegistration)
    assert.equal(firstRegistration.delivery, 'martin')
    assert.equal(firstRegistration.aliasMode, 'hardlink')
    assert.equal(firstRegistration.versionedAlias, 'owner_name.roads.v1')
    assert.equal(await readFile(firstRegistration.versionedPath, 'utf8'), 'pmtiles-fixture')
    await assertSameFile(pmtilesPath, firstRegistration.versionedPath)
    assert.equal(
      existsSync(join(process.env.MARTIN_SOURCES_PATH, 'owner_name.roads.pmtiles')),
      false
    )

    const mbtilesKey = 'accounts/account/tilesets/tileset/v2/tiles.mbtiles'
    const mbtilesPath = join(process.env.LOCAL_STORAGE_PATH, mbtilesKey)
    await mkdir(dirname(mbtilesPath), { recursive: true })
    await writeFile(mbtilesPath, 'mbtiles-fixture')

    const secondRegistration = await registerPublishedTileAliases({
      storageObject: { provider: 'local', storageKey: mbtilesKey },
      artifactFormat: 'MBTILES',
      ownerHandle: 'owner_name',
      tilesetHandle: 'roads',
      version: 2,
    })

    assert.ok(secondRegistration)
    assert.equal(secondRegistration.aliasMode, 'hardlink')
    assert.equal(await readFile(secondRegistration.versionedPath, 'utf8'), 'mbtiles-fixture')
    await assertSameFile(mbtilesPath, secondRegistration.versionedPath)
    assert.equal(existsSync(firstRegistration.versionedPath), true)
    assert.equal(await readFile(firstRegistration.versionedPath, 'utf8'), 'pmtiles-fixture')
  } finally {
    if (previousLocalStoragePath === undefined) {
      delete process.env.LOCAL_STORAGE_PATH
    } else {
      process.env.LOCAL_STORAGE_PATH = previousLocalStoragePath
    }

    if (previousMartinSourcesPath === undefined) {
      delete process.env.MARTIN_SOURCES_PATH
    } else {
      process.env.MARTIN_SOURCES_PATH = previousMartinSourcesPath
    }

    await rm(root, { recursive: true, force: true })
  }
})

test('concurrent local republishing leaves one complete atomic version alias', async () => {
  const previousLocalStoragePath = process.env.LOCAL_STORAGE_PATH
  const previousMartinSourcesPath = process.env.MARTIN_SOURCES_PATH
  const root = await mkdtemp(join(tmpdir(), 'planisfy-martin-sources-atomic-'))

  try {
    process.env.LOCAL_STORAGE_PATH = join(root, 'storage')
    process.env.MARTIN_SOURCES_PATH = join(process.env.LOCAL_STORAGE_PATH, 'martin-sources')

    const firstKey = 'artifacts/first.pmtiles'
    const secondKey = 'artifacts/second.pmtiles'
    await mkdir(join(process.env.LOCAL_STORAGE_PATH, 'artifacts'), { recursive: true })
    await writeFile(join(process.env.LOCAL_STORAGE_PATH, firstKey), 'first-complete-artifact')
    await writeFile(join(process.env.LOCAL_STORAGE_PATH, secondKey), 'second-complete-artifact')

    const registrations = await Promise.all(
      [firstKey, secondKey].map((storageKey) =>
        registerPublishedTileAliases({
          storageObject: { provider: 'local', storageKey },
          artifactFormat: 'PMTILES',
          ownerHandle: 'owner',
          tilesetHandle: 'roads',
          version: 3,
        })
      )
    )

    assert.ok(registrations[0])
    assert.ok(registrations[1])
    const aliasBody = await readFile(registrations[0].versionedPath, 'utf8')
    assert.ok(
      aliasBody === 'first-complete-artifact' || aliasBody === 'second-complete-artifact'
    )
    assert.deepEqual(
      (await readdir(process.env.MARTIN_SOURCES_PATH)).filter((name) => name.endsWith('.tmp')),
      []
    )
  } finally {
    if (previousLocalStoragePath === undefined) {
      delete process.env.LOCAL_STORAGE_PATH
    } else {
      process.env.LOCAL_STORAGE_PATH = previousLocalStoragePath
    }

    if (previousMartinSourcesPath === undefined) {
      delete process.env.MARTIN_SOURCES_PATH
    } else {
      process.env.MARTIN_SOURCES_PATH = previousMartinSourcesPath
    }

    await rm(root, { recursive: true, force: true })
  }
})

test('registerPublishedTileAliases writes only versioned R2 object-storage aliases', async () => {
  const previousTileAliasPrefix = process.env.TILE_ALIAS_STORAGE_PREFIX
  const previousPrefix = process.env.MARTIN_SOURCES_PREFIX
  const storage = new MemoryStorage('r2', 'planisfy-artifacts', {
    'accounts/account/tilesets/tileset/v4/tiles.pmtiles': 'pmtiles-fixture',
  })

  try {
    delete process.env.TILE_ALIAS_STORAGE_PREFIX
    process.env.MARTIN_SOURCES_PREFIX = 'tiles/martin-sources'

    const registration = await registerPublishedTileAliases({
      storageObject: {
        provider: 'r2',
        bucket: 'planisfy-artifacts',
        storageKey: 'accounts/account/tilesets/tileset/v4/tiles.pmtiles',
      },
      artifactFormat: 'PMTILES',
      ownerHandle: 'owner',
      tilesetHandle: 'roads',
      version: 4,
      storage,
    })

    assert.ok(registration)
    assert.equal(registration.provider, 'r2')
    assert.equal(registration.delivery, 'object-storage')
    assert.equal(registration.aliasMode, 'object_copy')
    assert.equal(registration.versionedAlias, 'owner.roads.v4')
    assert.equal(registration.versionedStorageKey, 'tiles/martin-sources/owner.roads.v4.pmtiles')
    assert.equal(storage.objects.has('tiles/martin-sources/owner.roads.pmtiles'), false)
    assert.equal(
      storage.objects.get('tiles/martin-sources/owner.roads.v4.pmtiles'),
      'pmtiles-fixture'
    )
  } finally {
    if (previousTileAliasPrefix === undefined) {
      delete process.env.TILE_ALIAS_STORAGE_PREFIX
    } else {
      process.env.TILE_ALIAS_STORAGE_PREFIX = previousTileAliasPrefix
    }

    if (previousPrefix === undefined) {
      delete process.env.MARTIN_SOURCES_PREFIX
    } else {
      process.env.MARTIN_SOURCES_PREFIX = previousPrefix
    }
  }
})

test('registerPublishedTileAliases verifies remote copy size before publication', async () => {
  const sourceKey = 'accounts/account/tilesets/tileset/v4/tiles.pmtiles'
  const storage = new MemoryStorage('r2', 'planisfy-artifacts', {
    [sourceKey]: 'complete-pmtiles-fixture',
  })
  storage.copy = async (_sourceKey, targetKey) => {
    storage.objects.set(targetKey, 'truncated')
  }

  await assert.rejects(
    registerPublishedTileAliases({
      storageObject: {
        provider: 'r2',
        bucket: 'planisfy-artifacts',
        storageKey: sourceKey,
      },
      artifactFormat: 'PMTILES',
      ownerHandle: 'owner',
      tilesetHandle: 'roads',
      version: 4,
      storage,
    }),
    /alias verification failed/
  )
})

test('registerPublishedTileAliases defaults remote aliases to tile-aliases', async () => {
  const previousTileAliasPrefix = process.env.TILE_ALIAS_STORAGE_PREFIX
  const previousPrefix = process.env.MARTIN_SOURCES_PREFIX
  const storage = new MemoryStorage('s3', 'planisfy-artifacts', {
    'accounts/account/tilesets/tileset/v1/tiles.pmtiles': 'pmtiles-fixture',
  })

  try {
    process.env.TILE_ALIAS_STORAGE_PREFIX = ''
    delete process.env.MARTIN_SOURCES_PREFIX

    const registration = await registerPublishedTileAliases({
      storageObject: {
        provider: 's3',
        bucket: 'planisfy-artifacts',
        storageKey: 'accounts/account/tilesets/tileset/v1/tiles.pmtiles',
      },
      artifactFormat: 'PMTILES',
      ownerHandle: 'owner',
      tilesetHandle: 'roads',
      version: 1,
      storage,
    })

    assert.ok(registration)
    assert.equal(registration.aliasMode, 'object_copy')
    assert.equal(registration.versionedStorageKey, 'tile-aliases/owner.roads.v1.pmtiles')
    assert.equal(storage.objects.has('tile-aliases/owner.roads.pmtiles'), false)
  } finally {
    if (previousTileAliasPrefix === undefined) {
      delete process.env.TILE_ALIAS_STORAGE_PREFIX
    } else {
      process.env.TILE_ALIAS_STORAGE_PREFIX = previousTileAliasPrefix
    }

    if (previousPrefix === undefined) {
      delete process.env.MARTIN_SOURCES_PREFIX
    } else {
      process.env.MARTIN_SOURCES_PREFIX = previousPrefix
    }
  }
})

test('registerPublishedTileAliases skips unsupported providers and raw artifacts', async () => {
  const remoteRegistration = await registerPublishedTileAliases({
    storageObject: { provider: 'memory', storageKey: 'tiles.pmtiles' },
    artifactFormat: 'PMTILES',
    ownerHandle: 'owner',
    tilesetHandle: 'roads',
    version: 1,
  })
  const directoryRegistration = await registerPublishedTileAliases({
    storageObject: { provider: 'local', storageKey: 'tiles.directory' },
    artifactFormat: 'DIRECTORY',
    ownerHandle: 'owner',
    tilesetHandle: 'roads',
    version: 1,
  })

  assert.equal(remoteRegistration, null)
  assert.equal(directoryRegistration, null)
})

async function assertSameFile(left: string, right: string) {
  const leftStat = await stat(left)
  const rightStat = await stat(right)
  assert.equal(rightStat.dev, leftStat.dev)
  assert.equal(rightStat.ino, leftStat.ino)
  assert.ok(leftStat.nlink >= 2)
  assert.ok(rightStat.nlink >= 2)
}

class MemoryStorage implements StorageProvider {
  objects: Map<string, string>

  constructor(
    private provider: 's3' | 'r2',
    private bucket: string,
    initialObjects: Record<string, string>
  ) {
    this.objects = new Map(Object.entries(initialObjects))
  }

  async upload(key: string, data: Buffer | Readable, contentType = 'application/octet-stream') {
    const body = Buffer.isBuffer(data) ? data : Buffer.alloc(0)
    this.objects.set(key, body.toString('utf8'))
    return { key, url: this.getUrl(key), size: body.length, contentType }
  }

  async download(key: string) {
    return Buffer.from(this.objects.get(key) ?? '', 'utf8')
  }

  async readRange(key: string, offset: number, length: number) {
    return Buffer.from(this.objects.get(key) ?? '', 'utf8').subarray(offset, offset + length)
  }

  async createDownloadUrl(key: string) {
    return this.getUrl(key)
  }

  async copy(sourceKey: string, targetKey: string) {
    const value = this.objects.get(sourceKey)
    if (value === undefined) throw new Error(`Missing ${sourceKey}`)
    this.objects.set(targetKey, value)
  }

  async delete(key: string) {
    this.objects.delete(key)
  }

  async exists(key: string) {
    return this.objects.has(key)
  }

  async getMetadata(key: string) {
    const value = this.objects.get(key)
    if (value === undefined) return null
    return {
      key,
      size: Buffer.byteLength(value),
      contentType: 'application/octet-stream',
    }
  }

  getUrl(key: string) {
    return `https://artifacts.example.com/${key}`
  }

  getInfo() {
    return { provider: this.provider, bucket: this.bucket }
  }
}
