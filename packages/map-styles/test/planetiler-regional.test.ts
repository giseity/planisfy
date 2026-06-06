import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";
import {
  buildPlanetilerRegionalCommand,
  PLANETILER_IMAGE,
  regionalOutputPath,
} from "../scripts/planetiler-regional.mjs";

const root = join(import.meta.dirname, "..");
const repoRoot = resolve(root, "../..");

describe("Planetiler regional build harness", () => {
  test("builds deterministic docker command arguments", () => {
    const output = regionalOutputPath(root, "stuttgart", "v1");
    const command = buildPlanetilerRegionalCommand({
      repoRoot,
      cwd: root,
      schema: join(root, "planetiler/planisfy-streets-regional.yml"),
      output,
      javaOptions: "-Xmx1g",
    });

    expect(command.file).toBe("docker");
    expect(command.image).toBe(PLANETILER_IMAGE);
    expect(command.args).toEqual([
      "run",
      "--rm",
      "-e",
      "JAVA_TOOL_OPTIONS=-Xmx1g",
      "-v",
      `${repoRoot}:/data`,
      PLANETILER_IMAGE,
      "generate-custom",
      "--schema=/data/packages/map-styles/planetiler/planisfy-streets-regional.yml",
      "--output=/data/packages/map-styles/dist/regional/stuttgart/v1/planisfy-streets.pmtiles",
      "--force",
    ]);
  });
});
