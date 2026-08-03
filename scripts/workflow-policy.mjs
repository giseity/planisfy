import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const workflowsDirectory = resolve(repositoryRoot, '.github/workflows')
const workflowNames = (await readdir(workflowsDirectory))
  .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
  .sort()

const allowedSecrets = new Set([
  'GITHUB_TOKEN',
  'DOKPLOY_API_TOKEN',
  'MANAGED_STAGING_E2E_EMAIL',
  'MANAGED_STAGING_E2E_PASSWORD',
  'MANAGED_STAGING_INTERNAL_API_SECRET',
])
const errors = []

for (const name of workflowNames) {
  const contents = await readFile(resolve(workflowsDirectory, name), 'utf8')
  const lines = contents.split(/\r?\n/)
  let checkoutCount = 0
  let persistedCredentialDisables = 0

  if (!/^permissions:\n  contents: read$/m.test(contents)) {
    errors.push(`${name}: top-level permissions must grant only contents: read`)
  }

  for (const [index, line] of lines.entries()) {
    const action = line.match(/^\s*(?:-\s*)?uses:\s+([^@\s]+)@([^\s#]+)(?:\s+#\s*(v\d+))?\s*$/)
    if (action && !action[1]?.startsWith('./')) {
      if (!/^[a-f0-9]{40}$/.test(action[2] ?? '')) {
        errors.push(`${name}:${index + 1}: action reference must use a full commit SHA`)
      }
      if (!action[3]) {
        errors.push(`${name}:${index + 1}: pinned action must retain its major-version comment`)
      }
      if (action[1] === 'actions/checkout') checkoutCount += 1
    }
    if (/^\s+persist-credentials:\s+false\s*$/.test(line)) {
      persistedCredentialDisables += 1
    }
  }

  if (checkoutCount !== persistedCredentialDisables) {
    errors.push(`${name}: every checkout must disable persisted credentials`)
  }

  for (const match of contents.matchAll(/\bsecrets\.([A-Z0-9_]+)/g)) {
    const secret = match[1]
    if (secret && !allowedSecrets.has(secret)) {
      errors.push(`${name}: secret ${secret} is not approved for workflow use`)
    }
  }
}

const managedWorkflow = await readFile(
  resolve(workflowsDirectory, 'managed-staging-proof.yml'),
  'utf8'
)
for (const forbidden of [
  'MANAGED_STAGING_DATABASE_URL',
  'MANAGED_STAGING_REDIS_URL',
  'MANAGED_STAGING_BETTER_AUTH_SECRET',
  'MANAGED_STAGING_SOURCE_CREDENTIAL_ENCRYPTION_KEY',
  'MANAGED_STAGING_R2_',
  'MANAGED_STAGING_DODO_',
  'MANAGED_STAGING_ZEPTOMAIL_',
]) {
  if (managedWorkflow.includes(forbidden)) {
    errors.push(`managed-staging-proof.yml: backend credential ${forbidden} is forbidden`)
  }
}

const ciWorkflow = await readFile(resolve(workflowsDirectory, 'ci.yml'), 'utf8')
const dockerBuildJob = jobBlock(ciWorkflow, 'docker-build')
const dockerPublishJob = jobBlock(ciWorkflow, 'docker-publish')
if (
  !dockerBuildJob ||
  /packages:\s+write|docker\/login-action|secrets\.GITHUB_TOKEN/.test(dockerBuildJob)
) {
  errors.push('ci.yml: pull-request Docker builds must remain read-only and logged out')
}
if (
  !dockerPublishJob ||
  !/packages:\s+write/.test(dockerPublishJob) ||
  !/docker\/login-action/.test(dockerPublishJob)
) {
  errors.push('ci.yml: main Docker publication must own the package-write login')
}

if (errors.length > 0) {
  console.error(`Workflow policy failed:\n${errors.map((error) => `- ${error}`).join('\n')}`)
  process.exitCode = 1
} else {
  console.log(`Workflow policy passed for ${workflowNames.length} workflows`)
}

function jobBlock(contents, jobName) {
  const marker = `  ${jobName}:\n`
  const start = contents.indexOf(marker)
  if (start < 0) return null
  const remainder = contents.slice(start + marker.length)
  const nextJob = remainder.search(/^  [a-zA-Z0-9_-]+:\n/m)
  return nextJob < 0
    ? contents.slice(start)
    : contents.slice(start, start + marker.length + nextJob)
}
