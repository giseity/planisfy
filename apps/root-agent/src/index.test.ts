import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { __rootAgentTest } from './index'

test('linkFileAtomic creates a hardlink alias without copying', async () => {
  const root = await mkdtemp(join(tmpdir(), 'planisfy-root-agent-link-'))
  try {
    const source = join(root, 'source.pmtiles')
    const alias = join(root, 'alias.pmtiles')
    await writeFile(source, 'pmtiles-fixture')
    await __rootAgentTest.linkFileAtomic(source, alias)

    assert.equal(await readFile(alias, 'utf8'), 'pmtiles-fixture')
    const sourceStat = await stat(source)
    const aliasStat = await stat(alias)
    assert.equal(aliasStat.dev, sourceStat.dev)
    assert.equal(aliasStat.ino, sourceStat.ino)
    assert.ok(sourceStat.nlink >= 2)
    assert.ok(aliasStat.nlink >= 2)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('validateBasemapRuntimeTarget rejects path-like Martin sources', () => {
  assert.throws(
    () =>
      __rootAgentTest.validateBasemapRuntimeTarget({
        releaseId: 'release',
        artifactId: 'artifact',
        martinSource: '../bad',
        martinSourceVersioned: 'basemap_artifact_abc',
        martinPrimarySource: 'basemap_account_abc_primary',
        extension: 'pmtiles',
      }),
    /Unsafe basemap runtime target martinSource/
  )
})

test('linkFileAtomic creates parent-independent hardlink aliases', async () => {
  const root = await mkdtemp(join(tmpdir(), 'planisfy-root-agent-link-parent-'))
  try {
    const sourceDir = join(root, 'source')
    const aliasDir = join(root, 'aliases')
    await mkdir(sourceDir, { recursive: true })
    await mkdir(aliasDir, { recursive: true })
    const source = join(sourceDir, 'source.pmtiles')
    const alias = join(aliasDir, 'alias.pmtiles')
    await writeFile(source, 'pmtiles-fixture')
    await __rootAgentTest.linkFileAtomic(source, alias)

    const sourceStat = await stat(source)
    const aliasStat = await stat(alias)
    assert.equal(aliasStat.ino, sourceStat.ino)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
