import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type ExecFileLike = (
  file: string,
  args: string[],
  options?: { timeout?: number },
) => Promise<{ stdout: string; stderr: string }>;

export type ToolName = "duckdb" | "tippecanoe" | "ogr2ogr";

export type ToolCapability = {
  name: ToolName;
  path: string;
  available: boolean;
  version?: string;
  error?: string;
};

export type ToolchainCapabilities = {
  duckdb: ToolCapability;
  tippecanoe: ToolCapability;
  ogr2ogr: ToolCapability;
};

export type ToolchainPaths = {
  duckdbPath: string;
  tippecanoePath: string;
  ogr2ogrPath: string;
};

const VERSION_ARGS: Record<ToolName, string[]> = {
  duckdb: ["--version"],
  tippecanoe: ["--version"],
  ogr2ogr: ["--version"],
};

export async function getToolchainCapabilities(
  paths: ToolchainPaths,
  execFileImpl: ExecFileLike = execFileAsync,
): Promise<ToolchainCapabilities> {
  const [duckdb, tippecanoe, ogr2ogr] = await Promise.all([
    checkTool("duckdb", paths.duckdbPath, execFileImpl),
    checkTool("tippecanoe", paths.tippecanoePath, execFileImpl),
    checkTool("ogr2ogr", paths.ogr2ogrPath, execFileImpl),
  ]);

  return { duckdb, tippecanoe, ogr2ogr };
}

export function summarizeToolchainCapabilities(
  capabilities: ToolchainCapabilities,
): string {
  return Object.values(capabilities)
    .map((tool) => {
      if (!tool.available) return `${tool.name}=missing`;
      return `${tool.name}=${tool.version ?? "available"}`;
    })
    .join(", ");
}

async function checkTool(
  name: ToolName,
  path: string,
  execFileImpl: ExecFileLike,
): Promise<ToolCapability> {
  try {
    const result = await execFileImpl(path, VERSION_ARGS[name], {
      timeout: 10_000,
    });
    return {
      name,
      path,
      available: true,
      version: parseToolVersion(name, `${result.stdout}\n${result.stderr}`),
    };
  } catch (err) {
    return {
      name,
      path,
      available: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function parseToolVersion(
  name: ToolName,
  output: string,
): string | undefined {
  const text = output.trim();
  if (!text) return undefined;

  if (name === "duckdb") {
    const match = text.match(/v?(\d+\.\d+\.\d+)/);
    return match?.[1] ?? firstLine(text);
  }

  if (name === "tippecanoe") {
    const match = text.match(/tippecanoe\s+v?(\d+\.\d+\.\d+)/i);
    return match?.[1] ?? firstLine(text);
  }

  const match = text.match(/GDAL\s+(\d+\.\d+\.\d+)/i);
  return match?.[1] ?? firstLine(text);
}

function firstLine(text: string): string {
  return text.split(/\r?\n/, 1)[0]!;
}
