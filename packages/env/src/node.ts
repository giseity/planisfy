import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

export type LoadWorkspaceEnvOptions = {
  cwd?: string;
  filename?: string;
  override?: boolean;
};

const loadedEnvFiles = new Set<string>();

export function loadWorkspaceEnv(options: LoadWorkspaceEnvOptions = {}) {
  const filename = options.filename ?? ".env";
  const starts = [
    resolve(options.cwd ?? process.cwd()),
    dirname(fileURLToPath(import.meta.url)),
  ];

  for (const start of starts) {
    const envPath = findEnvFile(start, filename);
    if (!envPath) continue;

    if (!loadedEnvFiles.has(envPath) || options.override) {
      loadDotenv({ path: envPath, override: options.override ?? false });
      loadedEnvFiles.add(envPath);
    }

    return envPath;
  }

  return undefined;
}

function findEnvFile(start: string, filename: string) {
  let current = start;

  while (true) {
    const envPath = join(current, filename);
    if (existsSync(envPath)) return envPath;

    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}
