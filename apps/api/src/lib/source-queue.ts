import { Queue, Worker } from "bullmq";
import { db, tilesetSources } from "@planisfy/database";
import { eq } from "drizzle-orm";
import { getStorage } from "./storage";
import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, unlink, readFile, mkdtemp } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

const execFileAsync = promisify(execFile);

const REDIS_CONNECTION = {
  host: process.env.REDIS_HOST || "localhost",
  port: Number(process.env.REDIS_PORT) || 6379,
};

const QUEUE_NAME = "source-processing";

export interface SourceProcessingJob {
  sourceId: string;
  ownerId: string;
  uploadKey: string; // Storage key for the raw upload
  format: "geojson" | "csv" | "shapefile" | "pmtiles";
  options?: {
    minZoom?: number;
    maxZoom?: number;
    dropDensest?: boolean;
    simplification?: number;
  };
}

// ── Queue (producer) ────────────────────────────────────────────────────────

export const sourceQueue = new Queue<SourceProcessingJob>(QUEUE_NAME, {
  connection: REDIS_CONNECTION,
  defaultJobOptions: {
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 1000 },
    attempts: 2,
    backoff: { type: "exponential", delay: 5000 },
  },
});

export function enqueueSourceProcessing(job: SourceProcessingJob): void {
  sourceQueue.add("process", job).catch((err) => {
    console.error("[source-queue] Failed to enqueue:", err);
  });
}

// ── Worker (consumer) ───────────────────────────────────────────────────────

export const sourceWorker = new Worker<SourceProcessingJob>(
  QUEUE_NAME,
  async (job) => {
    const { sourceId, ownerId, uploadKey, format, options } = job.data;
    const storage = getStorage();

    console.log(`[source-worker] Processing source ${sourceId} (format: ${format})`);

    // Mark as PROCESSING
    await db
      .update(tilesetSources)
      .set({ status: "PROCESSING" })
      .where(eq(tilesetSources.id, sourceId));

    const tmpDir = await mkdtemp(join(tmpdir(), "planisfy-source-"));

    try {
      // 1. Download raw upload
      const rawData = await storage.download(uploadKey);

      // 2. If already PMTiles, just move to final location
      if (format === "pmtiles") {
        const finalKey = `sources/${ownerId}/${sourceId}/data.pmtiles`;
        await storage.upload(finalKey, rawData, "application/x-protobuf");

        await db
          .update(tilesetSources)
          .set({
            status: "READY",
            url: storage.getUrl(finalKey),
          })
          .where(eq(tilesetSources.id, sourceId));

        console.log(`[source-worker] Source ${sourceId} ready (PMTiles passthrough)`);
        return;
      }

      // 3. Write to temp file
      const inputPath = join(tmpDir, `input.${format === "geojson" ? "geojson" : format}`);
      await writeFile(inputPath, rawData);

      // 4. Validate GeoJSON if applicable
      if (format === "geojson") {
        const geojson = JSON.parse(rawData.toString("utf-8"));
        const featureCount = geojson.features?.length ?? 0;

        if (!geojson.type || !["FeatureCollection", "Feature", "GeometryCollection"].includes(geojson.type)) {
          throw new Error("Invalid GeoJSON: missing or invalid 'type' property");
        }

        if (featureCount === 0 && geojson.type === "FeatureCollection") {
          throw new Error("GeoJSON FeatureCollection has no features");
        }

        // Calculate bounds
        const bounds = calculateBounds(geojson);
        if (bounds) {
          await db
            .update(tilesetSources)
            .set({ bounds })
            .where(eq(tilesetSources.id, sourceId));
        }
      }

      // 5. Convert to PMTiles using tippecanoe
      const outputPath = join(tmpDir, "output.pmtiles");
      const minZoom = options?.minZoom ?? 0;
      const maxZoom = options?.maxZoom ?? 14;

      const tippecanoeArgs = [
        "-o", outputPath,
        `-z${maxZoom}`,
        `-Z${minZoom}`,
        "--force",
        "--no-tile-compression",
      ];

      if (options?.dropDensest) {
        tippecanoeArgs.push("--drop-densest-as-needed");
      } else {
        tippecanoeArgs.push("--coalesce-densest-as-needed");
      }

      if (options?.simplification) {
        tippecanoeArgs.push(`--simplification=${options.simplification}`);
      }

      tippecanoeArgs.push(inputPath);

      try {
        await execFileAsync("tippecanoe", tippecanoeArgs, { timeout: 300_000 });
      } catch (err: any) {
        // If tippecanoe is not available, store the raw GeoJSON as-is
        if (err.code === "ENOENT") {
          console.warn("[source-worker] tippecanoe not found, storing raw file");
          const finalKey = `sources/${ownerId}/${sourceId}/data.${format}`;
          await storage.upload(finalKey, rawData, "application/geo+json");

          await db
            .update(tilesetSources)
            .set({
              status: "READY",
              url: storage.getUrl(finalKey),
              type: "GEOJSON",
            })
            .where(eq(tilesetSources.id, sourceId));

          console.log(`[source-worker] Source ${sourceId} ready (raw GeoJSON, no tippecanoe)`);
          return;
        }
        throw err;
      }

      // 6. Upload PMTiles to storage
      const pmtilesData = await readFile(outputPath);
      const finalKey = `sources/${ownerId}/${sourceId}/data.pmtiles`;
      await storage.upload(finalKey, pmtilesData, "application/x-protobuf");

      // 7. Update source record
      await db
        .update(tilesetSources)
        .set({
          status: "READY",
          url: storage.getUrl(finalKey),
          type: "VECTOR",
          minZoom,
          maxZoom,
        })
        .where(eq(tilesetSources.id, sourceId));

      console.log(`[source-worker] Source ${sourceId} ready (PMTiles, ${pmtilesData.length} bytes)`);
    } catch (err: any) {
      console.error(`[source-worker] Source ${sourceId} failed:`, err);

      await db
        .update(tilesetSources)
        .set({ status: "ERROR" })
        .where(eq(tilesetSources.id, sourceId));

      throw err;
    } finally {
      // Cleanup temp directory
      try {
        const { rm } = await import("fs/promises");
        await rm(tmpDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  },
  {
    connection: REDIS_CONNECTION,
    concurrency: 2,
  }
);

sourceWorker.on("error", (err) => {
  console.error("[source-worker] Error:", err);
});

sourceWorker.on("failed", (job, err) => {
  console.error(`[source-worker] Job ${job?.id} failed:`, err);
});

// Shutdown handler
process.on("SIGTERM", async () => {
  await sourceWorker.close();
  await sourceQueue.close();
});

// ── Helpers ─────────────────────────────────────────────────────────────────

function calculateBounds(geojson: any): [number, number, number, number] | null {
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  let hasCoords = false;

  function processCoord(coord: number[]) {
    if (coord.length >= 2) {
      hasCoords = true;
      minLon = Math.min(minLon, coord[0]);
      minLat = Math.min(minLat, coord[1]);
      maxLon = Math.max(maxLon, coord[0]);
      maxLat = Math.max(maxLat, coord[1]);
    }
  }

  function processCoords(coords: any) {
    if (!Array.isArray(coords)) return;
    if (typeof coords[0] === "number") {
      processCoord(coords);
    } else {
      for (const c of coords) processCoords(c);
    }
  }

  function processGeometry(geom: any) {
    if (!geom) return;
    if (geom.coordinates) processCoords(geom.coordinates);
    if (geom.geometries) geom.geometries.forEach(processGeometry);
  }

  if (geojson.type === "FeatureCollection") {
    geojson.features?.forEach((f: any) => processGeometry(f.geometry));
  } else if (geojson.type === "Feature") {
    processGeometry(geojson.geometry);
  } else {
    processGeometry(geojson);
  }

  return hasCoords ? [minLon, minLat, maxLon, maxLat] : null;
}
