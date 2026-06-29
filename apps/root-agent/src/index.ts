import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import {
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { hostname } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { loadWorkspaceEnv } from "@planisfy/env/node";
import { z } from "zod";

loadWorkspaceEnv();

const envSchema = z.object({
  PLANISFY_API_URL: z.string().url().default("http://localhost:4000"),
  ROOT_AGENT_STATE_DIR: z.string().default("/var/lib/planisfy/root-agent"),
  ROOT_AGENT_TOKEN: z.string().optional(),
  ROOT_AGENT_REGISTRATION_TOKEN: z.string().optional(),
  ROOT_AGENT_NAME: z.string().default(hostname()),
  ROOT_AGENT_KIND: z.enum(["local", "remote", "cloud"]).default("remote"),
  ROOT_AGENT_CAPABILITIES: z
    .string()
    .default("valhalla_graph_build,dem_hydration,self_host_activation"),
  ROOT_AGENT_POLL_INTERVAL_MS: z.coerce.number().int().min(1000).default(5000),
  ROOT_AGENT_WORK_DIR: z.string().default("/var/lib/planisfy/root-agent/work"),
  ROOT_AGENT_VALHALLA_DATA_DIR: z
    .string()
    .default("/opt/planisfy/infra/docker/data/valhalla_data"),
  ROOT_AGENT_ELEVATION_DATA_DIR: z
    .string()
    .default("/opt/planisfy/infra/docker/data/elevation"),
  ROOT_AGENT_DEM_BASE_URL: z
    .string()
    .url()
    .default("https://s3.amazonaws.com/elevation-tiles-prod/skadi"),
  ROOT_AGENT_COMPOSE_FILE: z.string().optional(),
  ROOT_AGENT_COMPOSE_ENV_FILE: z.string().optional(),
  ROOT_AGENT_COMPOSE_CWD: z.string().optional(),
});

const config = envSchema.parse(process.env);
const apiBase = config.PLANISFY_API_URL.replace(/\/$/, "");
const capabilities = config.ROOT_AGENT_CAPABILITIES.split(",")
  .map((item) => item.trim())
  .filter(Boolean);

type RoutingGraphBuild = {
  id: string;
  name: string;
  sourceUrl: string;
  sourcePreset: string | null;
  valhallaImage: string;
  includeAdmins: boolean;
  includeTimezones: boolean;
  elevationMode: string;
  config: Record<string, unknown>;
};

type RoutingGraphArtifact = {
  id: string;
  kind: string;
  fileName: string;
  checksumSha256: string | null;
};

type DemConfig = {
  bounds?: {
    minLon: number;
    minLat: number;
    maxLon: number;
    maxLat: number;
  };
  hgtTiles?: string[];
  baseUrl?: string;
};

type AgentJob =
  | { kind: "routing_graph_build"; build: RoutingGraphBuild }
  | {
      kind: "routing_graph_activation";
      build: RoutingGraphBuild;
      artifacts: RoutingGraphArtifact[];
    };

let activeChild: ChildProcessWithoutNullStreams | null = null;

async function main() {
  await mkdir(config.ROOT_AGENT_STATE_DIR, { recursive: true });
  await mkdir(config.ROOT_AGENT_WORK_DIR, { recursive: true });
  const token = await resolveAgentToken();
  await post(token, "/root-agent/heartbeat", {
    hostname: hostname(),
    capabilities,
    startedAt: new Date().toISOString(),
  });

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  for (;;) {
    try {
      const next = await get<{ data: AgentJob | null }>(token, "/root-agent/jobs/next");
      if (next.data) {
        await handleJob(token, next.data);
      } else {
        await post(token, "/root-agent/heartbeat", { hostname: hostname(), capabilities });
        await delay(config.ROOT_AGENT_POLL_INTERVAL_MS);
      }
    } catch (err) {
      console.error("[root-agent]", err);
      await delay(config.ROOT_AGENT_POLL_INTERVAL_MS);
    }
  }
}

async function resolveAgentToken() {
  if (config.ROOT_AGENT_TOKEN) return config.ROOT_AGENT_TOKEN;
  const stateFile = join(config.ROOT_AGENT_STATE_DIR, "agent.json");
  const existing = await readOptionalJson<{ agentToken?: string }>(stateFile);
  if (existing?.agentToken) return existing.agentToken;
  if (!config.ROOT_AGENT_REGISTRATION_TOKEN) {
    throw new Error("Set ROOT_AGENT_TOKEN or ROOT_AGENT_REGISTRATION_TOKEN");
  }
  const response = await rawPost("/root-agent/register", {
    registrationToken: config.ROOT_AGENT_REGISTRATION_TOKEN,
    hostname: hostname(),
    capabilities,
    metadata: { installedBy: "root-agent" },
  });
  const agentToken = response.data?.agentToken;
  if (typeof agentToken !== "string") {
    throw new Error("Registration did not return an agent token");
  }
  await writeJson(stateFile, { agentToken, registeredAt: new Date().toISOString() });
  return agentToken;
}

async function handleJob(token: string, job: AgentJob) {
  if (job.kind === "routing_graph_build") {
    await buildRoutingGraph(token, job.build);
    return;
  }
  await activateRoutingGraph(token, job.build, job.artifacts);
}

async function buildRoutingGraph(token: string, build: RoutingGraphBuild) {
  const buildDir = join(config.ROOT_AGENT_WORK_DIR, build.id);
  await rm(buildDir, { recursive: true, force: true });
  await mkdir(buildDir, { recursive: true });
  const pbfPath = join(buildDir, "source.osm.pbf");
  const graphTarPath = join(buildDir, "routing-graph.tar.gz");

  try {
    await updateBuild(token, build.id, "preparing", 5, "Preparing build workspace");
    await writeValhallaConfig(buildDir);
    await updateBuild(token, build.id, "downloading_source", 10, "Downloading OSM PBF source");
    await runLogged(token, build.id, "curl", [
      "-LfsS",
      "--continue-at",
      "-",
      "-o",
      pbfPath,
      build.sourceUrl,
    ]);

    if (build.includeAdmins) {
      await updateBuild(token, build.id, "building_admins", 25, "Building Valhalla admin database");
      await dockerRun(token, build.id, build.valhallaImage, buildDir, [
        "valhalla_build_admins",
        "-c",
        "/work/valhalla.json",
        "/work/source.osm.pbf",
      ]);
    }

    if (build.includeTimezones) {
      await updateBuild(token, build.id, "building_admins", 32, "Building Valhalla timezone database");
      await dockerShell(token, build.id, build.valhallaImage, buildDir, [
        "valhalla_build_timezones > /work/valhalla_tz.sqlite",
      ]);
    }

    await updateBuild(token, build.id, "building_tiles", 40, "Building Valhalla routing tiles");
    await dockerRun(token, build.id, build.valhallaImage, buildDir, [
      "valhalla_build_tiles",
      "-c",
      "/work/valhalla.json",
      "/work/source.osm.pbf",
    ]);

    await updateBuild(token, build.id, "packaging", 85, "Creating Valhalla tile extract");
    await dockerRun(token, build.id, build.valhallaImage, buildDir, [
      "valhalla_build_extract",
      "-c",
      "/work/valhalla.json",
      "-v",
    ]);
    await runLogged(token, build.id, "tar", [
      "-czf",
      graphTarPath,
      "-C",
      buildDir,
      "valhalla.json",
      "valhalla_tiles",
      "valhalla_tiles.tar",
      ...(build.includeAdmins ? ["valhalla_admins.sqlite"] : []),
      ...(build.includeTimezones ? ["valhalla_tz.sqlite"] : []),
    ]);

    await updateBuild(token, build.id, "uploading", 92, "Uploading routing graph artifact");
    const checksumSha256 = await sha256File(graphTarPath);
    await uploadArtifact(token, build, graphTarPath, {
      kind: "valhalla_graph",
      fileName: `${build.name.replace(/[^A-Za-z0-9._-]/g, "_")}-${build.id}.tar.gz`,
      checksumSha256,
      manifest: {
        buildId: build.id,
        sourceUrl: build.sourceUrl,
        sourcePreset: build.sourcePreset,
        valhallaImage: build.valhallaImage,
        includeAdmins: build.includeAdmins,
        includeTimezones: build.includeTimezones,
        elevationMode: build.elevationMode,
      },
    });
    if (build.elevationMode === "dem_companion") {
      await buildDemCompanion(token, build, buildDir);
    }
    await updateBuild(token, build.id, "succeeded", 100, "Routing graph build completed");
  } catch (err) {
    if (await cancelRequested(token, build.id)) {
      await updateBuild(token, build.id, "canceled", 100, "Routing graph build canceled");
      return;
    }
    await updateBuild(token, build.id, "failed", 100, "Routing graph build failed", {
      errorCode: "ROOT_AGENT_BUILD_FAILED",
      errorMessage: err instanceof Error ? err.message : String(err),
    });
  }
}

async function buildDemCompanion(
  token: string,
  build: RoutingGraphBuild,
  buildDir: string,
) {
  const demDir = join(buildDir, "dem");
  const demTarPath = join(buildDir, "dem-companion.tar.gz");
  const demConfig = parseDemConfig(build.config.dem);
  const tileNames = resolveDemTileNames(demConfig);
  if (!tileNames.length) {
    await sendLogs(token, build.id, [
      {
        level: "warn",
        message:
          "DEM companion requested but no DEM bounds or HGT tile names were configured.",
      },
    ]);
    return;
  }
  await mkdir(demDir, { recursive: true });
  await sendLogs(token, build.id, [
    { level: "info", message: `Downloading ${tileNames.length} DEM tile(s)` },
  ]);
  const downloadedTiles: string[] = [];
  const skippedTiles: string[] = [];
  for (const tileName of tileNames) {
    const gzPath = join(demDir, `${tileName}.hgt.gz`);
    const hgtPath = join(demDir, `${tileName}.hgt`);
    const url = demTileUrl(demConfig.baseUrl ?? config.ROOT_AGENT_DEM_BASE_URL, tileName);
    try {
      await runLogged(token, build.id, "curl", ["-LfsS", "-o", gzPath, url]);
      await runLogged(token, build.id, "sh", [
        "-lc",
        `gzip -cd ${shellQuote(gzPath)} > ${shellQuote(hgtPath)}`,
      ]);
      downloadedTiles.push(tileName);
    } catch (err) {
      skippedTiles.push(tileName);
      await rm(hgtPath, { force: true });
      await sendLogs(token, build.id, [
        {
          level: "warn",
          message: `Skipped DEM tile ${tileName}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        },
      ]);
    } finally {
      await rm(gzPath, { force: true });
    }
  }
  if (!downloadedTiles.length) {
    throw new Error("DEM companion requested but no DEM tiles could be downloaded.");
  }
  if (skippedTiles.length) {
    await sendLogs(token, build.id, [
      {
        level: "warn",
        message: `Skipped ${skippedTiles.length} missing DEM tile(s)`,
      },
    ]);
  }
  await runLogged(token, build.id, "tar", ["-czf", demTarPath, "-C", demDir, "."]);
  const checksumSha256 = await sha256File(demTarPath);
  await uploadArtifact(token, build, demTarPath, {
    kind: "dem_companion",
    fileName: `${build.name.replace(/[^A-Za-z0-9._-]/g, "_")}-${build.id}-dem.tar.gz`,
    checksumSha256,
    manifest: {
      buildId: build.id,
      kind: "dem_companion",
      tiles: downloadedTiles,
      skippedTiles,
      baseUrl: demConfig.baseUrl ?? config.ROOT_AGENT_DEM_BASE_URL,
    },
  });
}

async function activateRoutingGraph(
  token: string,
  build: RoutingGraphBuild,
  artifacts: RoutingGraphArtifact[],
) {
  const graph = artifacts.find((artifact) => artifact.kind === "valhalla_graph");
  const dem = artifacts.find((artifact) => artifact.kind === "dem_companion");
  if (!graph) {
    await updateActivation(token, build.id, "failed", "No Valhalla graph artifact is available");
    return;
  }
  const activationDir = join(config.ROOT_AGENT_WORK_DIR, "activation", build.id);
  const artifactPath = join(activationDir, graph.fileName);
  const extractDir = join(activationDir, "extract");
  try {
    await rm(activationDir, { recursive: true, force: true });
    await mkdir(extractDir, { recursive: true });
    await downloadArtifact(token, graph.id, artifactPath);
    if (graph.checksumSha256) {
      const actual = await sha256File(artifactPath);
      if (actual !== graph.checksumSha256) {
        throw new Error("Routing graph artifact checksum mismatch");
      }
    }
    await runLogged(token, build.id, "tar", ["-xzf", artifactPath, "-C", extractDir]);
    await mkdir(dirname(config.ROOT_AGENT_VALHALLA_DATA_DIR), { recursive: true });
    const previousDir = `${config.ROOT_AGENT_VALHALLA_DATA_DIR}.previous`;
    await rm(previousDir, { recursive: true, force: true });
    await renameIfExists(config.ROOT_AGENT_VALHALLA_DATA_DIR, previousDir);
    await rename(extractDir, config.ROOT_AGENT_VALHALLA_DATA_DIR);
    if (dem) {
      await activateDemCompanion(token, build.id, dem);
    }
    await restartComposeServicesIfConfigured(token, build.id, [
      "valhalla",
      ...(dem ? ["elevation"] : []),
    ]);
    await updateActivation(token, build.id, "active", "Routing graph artifact activated");
  } catch (err) {
    await updateActivation(token, build.id, "failed", "Routing graph activation failed", {
      errorMessage: err instanceof Error ? err.message : String(err),
    });
  }
}

async function activateDemCompanion(
  token: string,
  buildId: string,
  artifact: RoutingGraphArtifact,
) {
  const activationDir = join(config.ROOT_AGENT_WORK_DIR, "activation", buildId, "dem");
  const artifactPath = join(activationDir, artifact.fileName);
  const extractDir = join(activationDir, "extract");
  await mkdir(extractDir, { recursive: true });
  await downloadArtifact(token, artifact.id, artifactPath);
  if (artifact.checksumSha256) {
    const actual = await sha256File(artifactPath);
    if (actual !== artifact.checksumSha256) {
      throw new Error("DEM companion artifact checksum mismatch");
    }
  }
  await runLogged(token, buildId, "tar", ["-xzf", artifactPath, "-C", extractDir]);
  await mkdir(dirname(config.ROOT_AGENT_ELEVATION_DATA_DIR), { recursive: true });
  const previousDir = `${config.ROOT_AGENT_ELEVATION_DATA_DIR}.previous`;
  await rm(previousDir, { recursive: true, force: true });
  await renameIfExists(config.ROOT_AGENT_ELEVATION_DATA_DIR, previousDir);
  await rename(extractDir, config.ROOT_AGENT_ELEVATION_DATA_DIR);
}

async function restartComposeServicesIfConfigured(
  token: string,
  buildId: string,
  services: string[],
) {
  if (!config.ROOT_AGENT_COMPOSE_FILE) {
    await sendLogs(token, buildId, [
      {
        level: "warn",
        message:
          "ROOT_AGENT_COMPOSE_FILE is not set; activated files but did not restart services.",
      },
    ]);
    return;
  }
  const args = [
    "compose",
    ...(config.ROOT_AGENT_COMPOSE_ENV_FILE
      ? ["--env-file", config.ROOT_AGENT_COMPOSE_ENV_FILE]
      : []),
    "-f",
    config.ROOT_AGENT_COMPOSE_FILE,
    "restart",
    ...services,
  ];
  await runLogged(token, buildId, "docker", args);
}

async function writeValhallaConfig(buildDir: string) {
  const configPath = join(buildDir, "valhalla.json");
  await writeJson(configPath, {
    mjolnir: {
      tile_dir: "/work/valhalla_tiles",
      tile_extract: "/work/valhalla_tiles.tar",
      admin: "/work/valhalla_admins.sqlite",
      timezone: "/work/valhalla_tz.sqlite",
      hierarchy: true,
      shortcuts: true,
      include_bicycle: true,
      include_pedestrian: true,
      include_driving: true,
      data_processing: { use_admin_db: true },
      logging: { type: "std_out" },
    },
    additional_data: { elevation: "/work/elevation/" },
    loki: { actions: ["route", "isochrone", "trace_route", "sources_to_targets", "optimized_route", "status"] },
    service_limits: {},
  });
}

async function dockerRun(
  token: string,
  buildId: string,
  image: string,
  buildDir: string,
  args: string[],
) {
  await runLogged(token, buildId, "docker", [
    "run",
    "--rm",
    "-v",
    `${buildDir}:/work`,
    image,
    ...args,
  ]);
}

async function dockerShell(
  token: string,
  buildId: string,
  image: string,
  buildDir: string,
  commands: string[],
) {
  await dockerRun(token, buildId, image, buildDir, ["sh", "-lc", commands.join(" && ")]);
}

async function runLogged(
  token: string,
  buildId: string,
  command: string,
  args: string[],
) {
  await sendLogs(token, buildId, [{ level: "info", message: `$ ${command} ${args.join(" ")}` }]);
  await new Promise<void>((resolve, reject) => {
    activeChild = spawn(command, args, {
      cwd: config.ROOT_AGENT_COMPOSE_CWD,
      stdio: "pipe",
    });
    activeChild.stdout.on("data", (chunk) => {
      void sendLogs(token, buildId, [{ level: "info", message: String(chunk).trimEnd() }]);
    });
    activeChild.stderr.on("data", (chunk) => {
      void sendLogs(token, buildId, [{ level: "warn", message: String(chunk).trimEnd() }]);
    });
    activeChild.on("error", reject);
    activeChild.on("exit", (code) => {
      activeChild = null;
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with ${code}`));
      }
    });
  });
}

async function uploadArtifact(
  token: string,
  build: RoutingGraphBuild,
  path: string,
  metadata: {
    kind: string;
    fileName: string;
    checksumSha256: string;
    manifest: Record<string, unknown>;
  },
) {
  const stream = createReadStream(path);
  const fileSize = (await stat(path)).size;
  const init = {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/gzip",
      "x-artifact-kind": metadata.kind,
      "x-artifact-filename": metadata.fileName,
      "x-artifact-sha256": metadata.checksumSha256,
      "x-artifact-manifest": JSON.stringify(metadata.manifest),
      "x-artifact-size": String(fileSize),
    },
    body: stream,
    duplex: "half",
  } as unknown as RequestInit & { duplex: "half" };
  const response = await fetch(`${apiBase}/root-agent/jobs/${build.id}/artifacts`, init);
  if (!response.ok) throw new Error(`Artifact upload failed: ${response.status}`);
}

async function downloadArtifact(token: string, artifactId: string, target: string) {
  await mkdir(dirname(target), { recursive: true });
  const response = await fetch(`${apiBase}/root-agent/artifacts/${artifactId}/download`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok || !response.body) {
    throw new Error(`Artifact download failed: ${response.status}`);
  }
  await pipeline(
    Readable.fromWeb(response.body as unknown as import("node:stream/web").ReadableStream),
    createWriteStream(target),
  );
}

async function updateBuild(
  token: string,
  id: string,
  status: string,
  progress: number,
  message: string,
  extra: Record<string, unknown> = {},
) {
  await post(token, `/root-agent/jobs/${id}/state`, {
    status,
    progress,
    message,
    ...extra,
  });
}

async function updateActivation(
  token: string,
  id: string,
  activationStatus: "active" | "failed",
  message: string,
  extra: Record<string, unknown> = {},
) {
  await post(token, `/root-agent/activations/${id}/state`, {
    activationStatus,
    message,
    ...extra,
  });
}

async function cancelRequested(token: string, id: string) {
  const response = await get<{ data: { cancelRequested: boolean } }>(
    token,
    `/root-agent/jobs/${id}/cancel`,
  );
  return response.data.cancelRequested;
}

async function sendLogs(
  token: string,
  buildId: string,
  entries: Array<{ level: string; message: string }>,
) {
  const filtered = entries.filter((entry) => entry.message.trim());
  if (!filtered.length) return;
  await post(token, `/root-agent/jobs/${buildId}/logs`, { entries: filtered });
}

async function get<T>(token: string, path: string): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`${path} failed: ${response.status}`);
  return (await response.json()) as T;
}

async function post<T = unknown>(token: string, path: string, body: unknown): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${path} failed: ${response.status}`);
  return (await response.json()) as T;
}

async function rawPost(path: string, body: unknown) {
  const response = await fetch(`${apiBase}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${path} failed: ${response.status}`);
  return (await response.json()) as { data?: { agentToken?: string } };
}

async function sha256File(path: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

async function readOptionalJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return null;
  }
}

async function writeJson(path: string, data: unknown) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`);
}

async function renameIfExists(from: string, to: string) {
  try {
    await stat(from);
    await rename(from, to);
  } catch {
    // Missing active graph is acceptable for first activation.
  }
}

function parseDemConfig(value: unknown): DemConfig {
  if (!isRecord(value)) return {};
  const bounds = isRecord(value.bounds)
    ? {
        minLon: Number(value.bounds.minLon),
        minLat: Number(value.bounds.minLat),
        maxLon: Number(value.bounds.maxLon),
        maxLat: Number(value.bounds.maxLat),
      }
    : undefined;
  return {
    bounds:
      bounds &&
      [bounds.minLon, bounds.minLat, bounds.maxLon, bounds.maxLat].every(Number.isFinite)
        ? bounds
        : undefined,
    hgtTiles: Array.isArray(value.hgtTiles)
      ? value.hgtTiles.filter((tile): tile is string => typeof tile === "string")
      : undefined,
    baseUrl: typeof value.baseUrl === "string" && value.baseUrl ? value.baseUrl : undefined,
  };
}

export function resolveDemTileNames(config: DemConfig) {
  const explicit = (config.hgtTiles ?? [])
    .map((tile) => tile.replace(/\.hgt(?:\.gz)?$/i, "").toUpperCase())
    .filter((tile) => /^[NS]\d{2}[EW]\d{3}$/.test(tile));
  if (explicit.length) return Array.from(new Set(explicit)).sort();
  if (!config.bounds) return [];
  const minLat = Math.floor(Math.max(-90, Math.min(89, config.bounds.minLat)));
  const maxLat = Math.max(-90, Math.min(89, Math.ceil(config.bounds.maxLat) - 1));
  const minLon = Math.floor(Math.max(-180, Math.min(179, config.bounds.minLon)));
  const maxLon = Math.max(-180, Math.min(179, Math.ceil(config.bounds.maxLon) - 1));
  const tiles: string[] = [];
  for (let lat = minLat; lat <= maxLat; lat += 1) {
    for (let lon = minLon; lon <= maxLon; lon += 1) {
      tiles.push(hgtTileName(lat, lon));
    }
  }
  return Array.from(new Set(tiles)).sort();
}

export function hgtTileName(lat: number, lon: number) {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${ns}${String(Math.abs(lat)).padStart(2, "0")}${ew}${String(Math.abs(lon)).padStart(3, "0")}`;
}

function demTileUrl(baseUrl: string, tileName: string) {
  return `${baseUrl.replace(/\/$/, "")}/${tileName.slice(0, 3)}/${tileName}.hgt.gz`;
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function shutdown(signal: string) {
  console.log(`[root-agent] received ${signal}`);
  activeChild?.kill("SIGTERM");
  process.exit(0);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((err) => {
    console.error("[root-agent] fatal", err);
    process.exit(1);
  });
}
