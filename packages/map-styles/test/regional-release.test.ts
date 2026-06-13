import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, test } from "vitest";

const execFileAsync = promisify(execFile);
const root = join(import.meta.dirname, "..");

describe("regional basemap release builder", () => {
  test("generates manifest and style metadata without copying PMTiles", async () => {
    const dir = await mkdtemp(join(tmpdir(), "planisfy-regional-release-"));
    const pmtilesPath = join(dir, "region.pmtiles");
    const outDir = join(dir, "out");
    const pmtiles = Buffer.from("PMTiles fixture bytes");
    await writeFile(pmtilesPath, pmtiles);

    await execFileAsync(
      process.execPath,
      [
        join(root, "scripts/build-regional-release.mjs"),
        "--name",
        "test-region",
        "--version",
        "v0",
        "--pmtiles",
        pmtilesPath,
        "--out",
        outDir,
        "--tilejson-url",
        "https://tiles.example.com/test-region",
        "--source-version",
        "planetiler=0.10.2",
        "--source-version",
        "fixture=planisfy-streets-regional-v1",
      ],
      { cwd: root },
    );

    const manifest = JSON.parse(
      await readFile(join(outDir, "manifest.json"), "utf8"),
    ) as {
      release: string;
      attribution: string;
      sourceDataVersions: Record<string, string>;
      sourceLayers: string[];
      source: { sha256: string; size: number; binaryCommitted: boolean };
      style: { tilejsonUrl: string };
    };
    const style = JSON.parse(await readFile(join(outDir, "style.json"), "utf8")) as {
      sources: Record<string, { url: string }>;
      metadata: Record<string, string>;
    };

    expect(manifest.release).toBe("test-region-v0");
    expect(manifest.source.binaryCommitted).toBe(false);
    expect(manifest.source.size).toBe(pmtiles.length);
    expect(manifest.source.sha256).toBe(
      createHash("sha256").update(pmtiles).digest("hex"),
    );
    expect(manifest.style.tilejsonUrl).toBe(
      "https://tiles.example.com/test-region",
    );
    expect(manifest.attribution).toContain("OpenStreetMap");
    expect(manifest.sourceDataVersions).toEqual({
      fixture: "planisfy-streets-regional-v1",
      planetiler: "0.10.2",
    });
    expect(manifest.sourceLayers).toEqual(
      expect.arrayContaining(["land", "land_cover", "land_use", "water"]),
    );
    expect(style.sources["planisfy-streets"]?.url).toBe(
      "https://tiles.example.com/test-region",
    );
    expect(style.metadata["planisfy:regionalRelease"]).toBe("test-region-v0");
  });
});
