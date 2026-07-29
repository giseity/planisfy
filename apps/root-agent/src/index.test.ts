import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  __rootAgentTest,
  buildBuilderDockerArgs,
  validateBuildAgentConfiguration,
} from './index'

const VALHALLA_IMAGE = `ghcr.io/planisfy/valhalla@sha256:${'a'.repeat(64)}`
const PLANETILER_IMAGE = `ghcr.io/planisfy/planetiler@sha256:${'b'.repeat(64)}`

test('build agents require non-root execution and complete sandbox policy', () => {
  const base = {
    capabilities: ['valhalla_graph_build'],
    uid: 1000,
    gid: 1000,
    valhallaImages: VALHALLA_IMAGE,
    planetilerImages: '',
    cpus: 4,
    memory: '16g',
    pidsLimit: 512,
  }
  const policy = validateBuildAgentConfiguration(base)
  assert.deepEqual([...policy.valhallaImages], [VALHALLA_IMAGE])

  assert.throws(() => validateBuildAgentConfiguration({ ...base, uid: 0 }), /non-root/)
  assert.throws(
    () => validateBuildAgentConfiguration({ ...base, memory: undefined }),
    /ROOT_AGENT_BUILD_MEMORY/
  )
  assert.throws(
    () =>
      validateBuildAgentConfiguration({
        ...base,
        capabilities: ['basemap_build'],
        valhallaImages: '',
        planetilerImages: PLANETILER_IMAGE,
      }),
    /ROOT_AGENT_PLANETILER_NETWORK/
  )
})

test('activation-only agents do not require builder privileges or policy', () => {
  assert.deepEqual(
    validateBuildAgentConfiguration({
      capabilities: ['self_host_activation'],
      uid: 0,
      gid: 0,
      valhallaImages: '',
      planetilerImages: '',
    }),
    {
      valhallaImages: new Set(),
      planetilerImages: new Set(),
    }
  )
})

test('builder Docker arguments enforce the complete sandbox command shape', () => {
  const args = buildBuilderDockerArgs({
    image: VALHALLA_IMAGE,
    buildDir: '/var/lib/planisfy/root-agent/work/job-1',
    mountTarget: '/work',
    network: 'none',
    sandbox: { uid: 1000, gid: 1000, cpus: 4, memory: '16g', pidsLimit: 512 },
    command: ['valhalla_build_tiles', '-c', '/work/valhalla.json'],
  })

  assert.deepEqual(args, [
    'run',
    '--rm',
    '--user',
    '1000:1000',
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges',
    '--read-only',
    '--pids-limit',
    '512',
    '--cpus',
    '4',
    '--memory',
    '16g',
    '--memory-swap',
    '16g',
    '--tmpfs',
    '/tmp:rw,noexec,nosuid,nodev,size=1g',
    '--network',
    'none',
    '--mount',
    'type=bind,src=/var/lib/planisfy/root-agent/work/job-1,dst=/work',
    '--workdir',
    '/work',
    VALHALLA_IMAGE,
    'valhalla_build_tiles',
    '-c',
    '/work/valhalla.json',
  ])
})

test('Planetiler arguments ignore persisted raw command arguments', () => {
  assert.deepEqual(
    __rootAgentTest.planetilerExtraArgs({
      minZoom: 2,
      maxZoom: 12,
      planetilerArgs: ['--download-wikidata', '--arbitrary-option'],
    }),
    ['--minzoom=2', '--maxzoom=12']
  )
})

test('persisted legacy images cannot bypass the root-agent allowlist', () => {
  assert.doesNotThrow(() => __rootAgentTest.assertAllowedBuilderImage('valhalla', VALHALLA_IMAGE))
  assert.throws(
    () => __rootAgentTest.assertAllowedBuilderImage('valhalla', 'ghcr.io/valhalla/valhalla:3.7.0'),
    /not in this root agent's digest allowlist/
  )
  assert.throws(
    () =>
      __rootAgentTest.assertAllowedBuilderImage(
        'planetiler',
        `ghcr.io/planisfy/planetiler@sha256:${'c'.repeat(64)}`
      ),
    /not in this root agent's digest allowlist/
  )
})

test('external downloads pin the validated host and resume valid ranges', async () => {
  const root = await mkdtemp(join(tmpdir(), 'planisfy-root-agent-download-'))
  const target = join(root, 'source.bin')
  const server = createServer((request, response) => {
    assert.equal(request.headers.range, 'bytes=4-')
    response.writeHead(206, {
      'content-range': 'bytes 4-9/10',
      'content-length': '6',
    })
    response.end('efghij')
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  try {
    await writeFile(target, 'abcd')
    await __rootAgentTest.downloadExternalFile(
      `http://source.test:${address.port}/data`,
      target,
      {
        maxBytes: 10,
        resume: true,
        privateAllowlist: 'source.test',
        lookup: async () => [{ address: '127.0.0.1', family: 4 }],
      }
    )
    assert.equal(await readFile(target, 'utf8'), 'abcdefghij')
  } finally {
    server.close()
    await rm(root, { recursive: true, force: true })
  }
})

test('external downloads remove files that exceed the byte budget', async () => {
  const root = await mkdtemp(join(tmpdir(), 'planisfy-root-agent-download-limit-'))
  const target = join(root, 'source.bin')
  const server = createServer((_request, response) => response.end('oversized'))
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  try {
    await assert.rejects(
      __rootAgentTest.downloadExternalFile(
        `http://source.test:${address.port}/data`,
        target,
        {
          maxBytes: 3,
          resume: false,
          privateAllowlist: 'source.test',
          lookup: async () => [{ address: '127.0.0.1', family: 4 }],
        }
      ),
      /exceeds/
    )
    await assert.rejects(stat(target), { code: 'ENOENT' })
  } finally {
    server.close()
    await rm(root, { recursive: true, force: true })
  }
})

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

test('agent state is owner-only even under a permissive umask', async () => {
  const root = await mkdtemp(join(tmpdir(), 'planisfy-root-agent-state-'))
  const stateDir = join(root, 'state')
  const stateFile = join(stateDir, 'agent.json')
  const previousUmask = process.umask(0o022)
  try {
    await __rootAgentTest.secureStateDirectory(stateDir)
    await __rootAgentTest.writeAgentState(stateFile, { agentToken: 'secret' })

    assert.equal((await stat(stateDir)).mode & 0o777, 0o700)
    assert.equal((await stat(stateFile)).mode & 0o777, 0o600)
  } finally {
    process.umask(previousUmask)
    await rm(root, { recursive: true, force: true })
  }
})

test('agent state repairs permissive existing permissions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'planisfy-root-agent-state-repair-'))
  const stateDir = join(root, 'state')
  const stateFile = join(stateDir, 'agent.json')
  try {
    await mkdir(stateDir, { recursive: true, mode: 0o755 })
    await writeFile(stateFile, '{"agentToken":"old"}\n', { mode: 0o644 })
    await __rootAgentTest.secureStateDirectory(stateDir)
    await __rootAgentTest.writeAgentState(stateFile, { agentToken: 'new' })

    assert.equal((await stat(stateDir)).mode & 0o777, 0o700)
    assert.equal((await stat(stateFile)).mode & 0o777, 0o600)
    assert.match(await readFile(stateFile, 'utf8'), /new/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
