import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const vitestPackages = [
  'packages/api-contracts',
  'packages/auth',
  'packages/credential-envelopes',
  'packages/events',
  'packages/geodata-contracts',
  'packages/map-styles',
  'packages/platform-policy',
  'packages/storage-paths',
  'packages/style-spec',
  'packages/tile-runtime',
  'packages/upgrade-manifest',
]

const repoRoot = dirname(fileURLToPath(import.meta.url))
const isRootRun = process.cwd() === repoRoot

export default defineConfig(
  isRootRun
    ? {
        test: {
          projects: [
            ...vitestPackages.map((root) => ({
              test: {
                name: root,
                root,
                environment: 'node' as const,
                include: ['**/*.test.ts'],
              },
            })),
            'apps/console/vitest.config.ts',
          ],
        },
      }
    : {}
)
