/* global console, process */

import { spawn } from "node:child_process";
import { dirname, join, relative } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import {
  buildPlanetilerRegionalCommand,
  PLANETILER_IMAGE,
  regionalOutputPath,
  safeId,
} from "./planetiler-regional.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const repoRoot = dirname(dirname(root));

const { values } = parseArgs({
  options: {
    name: { type: "string", default: "fixture" },
    version: { type: "string", default: "dev" },
    schema: {
      type: "string",
      default: join(root, "planetiler/planisfy-streets-regional.yml"),
    },
    out: { type: "string" },
    image: { type: "string", default: PLANETILER_IMAGE },
    "java-options": { type: "string" },
    "tilejson-url": {
      type: "string",
      default: "http://localhost:3005/planisfy.basic",
    },
  },
});

const name = safeId(values.name);
const version = safeId(values.version);
const outputPath =
  values.out ?? regionalOutputPath(root, name, version);

const command = buildPlanetilerRegionalCommand({
  repoRoot,
  cwd: process.cwd(),
  schema: values.schema,
  output: outputPath,
  image: values.image,
  javaOptions: values["java-options"],
});

console.log(
  `[map-styles] running Planetiler ${command.image} -> ${relative(repoRoot, command.outputPath).replaceAll("\\", "/")}`,
);
await run(command.file, command.args);

await run(process.execPath, [
  join(root, "scripts/build-regional-release.mjs"),
  "--name",
  name,
  "--version",
  version,
  "--pmtiles",
  command.outputPath,
  "--tilejson-url",
  values["tilejson-url"],
  "--source-version",
  "planetiler=0.10.2",
  "--source-version",
  "fixture=planisfy-streets-regional-v1",
]);

function run(file, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, {
      cwd: repoRoot,
      stdio: "inherit",
      shell: false,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${file} exited with code ${code}`));
    });
  });
}
