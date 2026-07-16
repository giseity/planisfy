/* global process */

import { existsSync, readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { parseEnv } from "node:util"

export function loadWorkspaceEnvForNextConfig(options = {}) {
  const filename = options.filename ?? ".env"
  let envPath = findEnvFile(resolve(options.cwd ?? process.cwd()), filename)
  if (!envPath && filename === ".env") {
    envPath = findEnvFile(resolve(options.cwd ?? process.cwd()), ".env.example")
  }
  if (!envPath) return undefined

  const parsed = parseEnv(readFileSync(envPath, "utf8"))
  for (const [key, value] of Object.entries(parsed)) {
    if (options.override || process.env[key] === undefined) {
      process.env[key] = value
    }
  }

  return envPath
}

function findEnvFile(start, filename) {
  let current = start

  while (true) {
    const envPath = join(current, filename)
    if (existsSync(envPath)) return envPath

    const parent = dirname(current)
    if (parent === current) return undefined
    current = parent
  }
}
