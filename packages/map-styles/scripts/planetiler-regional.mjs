import { isAbsolute, join, relative, resolve } from "node:path";

export const PLANETILER_IMAGE = "ghcr.io/onthegomap/planetiler:0.10.2";
export const DEFAULT_JAVA_OPTIONS = "-Xmx2g";

export function buildPlanetilerRegionalCommand(options) {
  const repoRoot = resolve(options.repoRoot);
  const image = options.image ?? PLANETILER_IMAGE;
  const javaOptions = options.javaOptions ?? DEFAULT_JAVA_OPTIONS;
  const schemaPath = resolvePath(options.schema, options.cwd);
  const outputPath = resolvePath(options.output, options.cwd);

  return {
    file: "docker",
    args: [
      "run",
      "--rm",
      "-e",
      `JAVA_TOOL_OPTIONS=${javaOptions}`,
      "-v",
      `${repoRoot}:/data`,
      image,
      "generate-custom",
      `--schema=${toContainerPath(repoRoot, schemaPath)}`,
      `--output=${toContainerPath(repoRoot, outputPath)}`,
      "--force",
    ],
    image,
    outputPath,
    schemaPath,
  };
}

export function regionalOutputPath(root, name, version) {
  return join(root, "dist/regional", safeId(name), safeId(version), "planisfy-streets.pmtiles");
}

export function safeId(value) {
  if (!/^[A-Za-z0-9._-]+$/.test(value)) {
    throw new Error(`Unsafe release identifier: ${value}`);
  }
  return value;
}

function resolvePath(value, cwd) {
  return isAbsolute(value) ? value : resolve(cwd, value);
}

function toContainerPath(repoRoot, hostPath) {
  const relativePath = relative(repoRoot, hostPath).replaceAll("\\", "/");
  if (relativePath.startsWith("../")) {
    throw new Error(`Path must be inside repository root: ${hostPath}`);
  }
  return `/data/${relativePath}`;
}
