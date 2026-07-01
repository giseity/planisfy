import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import {
  copyFile,
  link,
  lstat,
  mkdir,
  readFile,
  rename,
  rm,
  symlink,
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
    .default("valhalla_graph_build,basemap_build,dem_hydration"),
  ROOT_AGENT_POLL_INTERVAL_MS: z.coerce.number().int().min(1000).default(5000),
  ROOT_AGENT_WORK_DIR: z.string().default("/var/lib/planisfy/root-agent/work"),
  ROOT_AGENT_VALHALLA_DATA_DIR: z
    .string()
    .default("/opt/planisfy/infra/docker/data/valhalla_data"),
  ROOT_AGENT_ELEVATION_DATA_DIR: z
    .string()
    .default("/opt/planisfy/infra/docker/data/elevation"),
  ROOT_AGENT_MARTIN_SOURCES_DIR: z
    .string()
    .default("/opt/planisfy/infra/docker/data/martin-sources"),
  ROOT_AGENT_DEM_BASE_URL: z
    .string()
    .url()
    .default("https://s3.amazonaws.com/elevation-tiles-prod/skadi"),
  ROOT_AGENT_COMPOSE_FILE: z.string().optional(),
  ROOT_AGENT_COMPOSE_ENV_FILE: z.string().optional(),
  ROOT_AGENT_COMPOSE_CWD: z.string().optional(),
  ROOT_AGENT_RUNTIME_SUPERVISOR_URL: z.string().url().optional(),
  ROOT_AGENT_RUNTIME_SUPERVISOR_TOKEN: z.string().optional(),
  ROOT_AGENT_UPLOAD_RETRIES: z.coerce.number().int().min(1).default(5),
  ROOT_AGENT_UPLOAD_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(4),
  ROOT_AGENT_DOWNLOAD_PART_SIZE_BYTES: z.coerce
    .number()
    .int()
    .min(5 * 1024 * 1024)
    .default(64 * 1024 * 1024),
});

const config = envSchema.parse(process.env);
const apiBase = config.PLANISFY_API_URL.replace(/\/$/, "");
const runtimeServiceAttempts = Math.max(10, config.ROOT_AGENT_UPLOAD_RETRIES);
const capabilities = config.ROOT_AGENT_CAPABILITIES.split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const activationCapable =
  capabilities.includes("self_host_activation") ||
  capabilities.includes("managed_runtime_activation");

if (
  activationCapable &&
  (!config.ROOT_AGENT_RUNTIME_SUPERVISOR_URL || !config.ROOT_AGENT_RUNTIME_SUPERVISOR_TOKEN)
) {
  throw new Error(
    "Activation-capable root agents require ROOT_AGENT_RUNTIME_SUPERVISOR_URL and ROOT_AGENT_RUNTIME_SUPERVISOR_TOKEN",
  );
}

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
  size: number | null;
  checksumSha256: string | null;
};

type BasemapBuild = {
  id: string;
  name: string;
  engine: string;
  sourceKind: string;
  sourceUrl: string;
  sourcePreset: string | null;
  planetilerImage: string;
  profile: string;
  outputFormat: string;
  areaOfInterest: unknown;
  config: Record<string, unknown>;
};

type BasemapArtifact = {
  id: string;
  kind: string;
  fileName: string;
  size: number | null;
  checksumSha256: string | null;
};

type BuildArtifactTarget = {
  id: string;
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
    }
  | { kind: "basemap_build"; build: BasemapBuild }
  | { kind: "basemap_activation"; build: BasemapBuild; artifacts: BasemapArtifact[] };

type ArtifactUploadSession =
  | {
      data: {
        strategy: "legacy_proxy";
        reason?: string;
        uploadUrl: string;
      };
    }
  | {
      data: {
        strategy: "multipart";
        storage: {
          provider: "s3" | "r2";
          bucket: string;
          key: string;
        };
        multipart: {
          uploadId: string;
          partSize: number;
          expiresAt: string;
          parts: Array<{
            partNumber: number;
            url: string;
            method: "PUT";
          }>;
        };
      };
    };

type UploadedPart = {
  partNumber: number;
  eTag: string;
};

let activeChild: ChildProcessWithoutNullStreams | null = null;

async function main() {
  await mkdir(config.ROOT_AGENT_STATE_DIR, { recursive: true });
  await mkdir(config.ROOT_AGENT_WORK_DIR, { recursive: true });
  const token = await resolveAgentToken();
  await post(token, "/root-agent/heartbeat", {
    hostname: hostname(),
    capabilities,
    activation: activationMetadata(),
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
        await post(token, "/root-agent/heartbeat", {
          hostname: hostname(),
          capabilities,
          activation: activationMetadata(),
        });
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
    metadata: { installedBy: "root-agent", activation: activationMetadata() },
  });
  const agentToken = response.data?.agentToken;
  if (typeof agentToken !== "string") {
    throw new Error("Registration did not return an agent token");
  }
  await writeJson(stateFile, { agentToken, registeredAt: new Date().toISOString() });
  return agentToken;
}

function activationMetadata() {
  return {
    valhallaDataDir: config.ROOT_AGENT_VALHALLA_DATA_DIR,
    elevationDataDir: config.ROOT_AGENT_ELEVATION_DATA_DIR,
    martinSourcesDir: config.ROOT_AGENT_MARTIN_SOURCES_DIR,
    runtimeSupervisorConfigured: Boolean(config.ROOT_AGENT_RUNTIME_SUPERVISOR_URL),
    runtimeSupervisorUrl: config.ROOT_AGENT_RUNTIME_SUPERVISOR_URL ?? null,
    composeFileConfigured: Boolean(config.ROOT_AGENT_COMPOSE_FILE),
    composeCwd: config.ROOT_AGENT_COMPOSE_CWD ?? null,
  };
}

async function handleJob(token: string, job: AgentJob) {
  if (job.kind === "routing_graph_build") {
    await buildRoutingGraph(token, job.build);
    return;
  }
  if (job.kind === "routing_graph_activation") {
    await activateRoutingGraph(token, job.build, job.artifacts);
    return;
  }
  if (job.kind === "basemap_build") {
    await buildBasemap(token, job.build);
    return;
  }
  await activateBasemap(token, job.build, job.artifacts);
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
    const localArtifacts = await existingLocalArtifacts([graphTarPath]);
    await updateBuild(token, build.id, "failed", 100, "Routing graph build failed", {
      errorCode: "ROOT_AGENT_BUILD_FAILED",
      errorMessage: err instanceof Error ? err.message : String(err),
      ...(localArtifacts.length ? { output: { localArtifacts } } : {}),
    });
  }
}

async function buildBasemap(token: string, build: BasemapBuild) {
  const buildDir = join(config.ROOT_AGENT_WORK_DIR, build.id);
  await rm(buildDir, { recursive: true, force: true });
  await mkdir(buildDir, { recursive: true });
  const pbfPath = join(buildDir, "source.osm.pbf");
  const extension = build.outputFormat === "mbtiles" ? "mbtiles" : "pmtiles";
  const outputPath = join(buildDir, `basemap.${extension}`);

  try {
    if (build.engine !== "planetiler_osm" || build.sourceKind !== "osm_pbf") {
      throw new Error(
        "Only planetiler_osm builds from OSM PBF sources are enabled in this root-agent version.",
      );
    }
    await updateBuild(token, build.id, "preparing", 5, "Preparing basemap build workspace");
    await updateBuild(token, build.id, "downloading_source", 10, "Downloading OSM PBF source");
    await runLogged(token, build.id, "curl", [
      "-LfsS",
      "--continue-at",
      "-",
      "-o",
      pbfPath,
      build.sourceUrl,
    ]);

    await updateBuild(token, build.id, "building_tiles", 35, "Building basemap tiles with Planetiler");
    const planetilerArgs = [
      "--osm-path=/data/source.osm.pbf",
      `--output=/data/basemap.${extension}`,
      "--force",
      "--download",
      ...planetilerExtraArgs(build.config),
    ];
    await runLogged(token, build.id, "docker", [
      "run",
      "--rm",
      "-v",
      `${buildDir}:/data`,
      build.planetilerImage,
      ...planetilerArgs,
    ]);

    await updateBuild(token, build.id, "packaging", 85, "Validating basemap artifact");
    const checksumSha256 = await sha256File(outputPath);
    await updateBuild(token, build.id, "uploading", 92, "Uploading basemap artifact");
    await uploadArtifact(token, build, outputPath, {
      kind: "basemap_tiles",
      fileName: `${build.name.replace(/[^A-Za-z0-9._-]/g, "_")}-${build.id}.${extension}`,
      checksumSha256,
      contentType:
        extension === "pmtiles"
          ? "application/vnd.pmtiles"
          : "application/vnd.mapbox-vector-tile",
      manifest: {
        buildId: build.id,
        sourceUrl: build.sourceUrl,
        sourcePreset: build.sourcePreset,
        engine: build.engine,
        sourceKind: build.sourceKind,
        profile: build.profile,
        outputFormat: build.outputFormat,
        minZoom: numberFromConfig(build.config, "minZoom", 0),
        maxZoom: numberFromConfig(build.config, "maxZoom", 14),
        attribution:
          typeof build.config.attribution === "string"
            ? build.config.attribution
            : "© OpenStreetMap contributors",
      },
    });
    await updateBuild(token, build.id, "succeeded", 100, "Basemap build completed");
  } catch (err) {
    if (await cancelRequested(token, build.id)) {
      await updateBuild(token, build.id, "canceled", 100, "Basemap build canceled");
      return;
    }
    const localArtifacts = await existingLocalArtifacts([outputPath]);
    await updateBuild(token, build.id, "failed", 100, "Basemap build failed", {
      errorCode: "ROOT_AGENT_BASEMAP_BUILD_FAILED",
      errorMessage: err instanceof Error ? err.message : String(err),
      ...(localArtifacts.length ? { output: { localArtifacts } } : {}),
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
  const legacyExtractDir = join(activationDir, "extract");
  const extractDir = join(dirname(config.ROOT_AGENT_VALHALLA_DATA_DIR), ".incoming", build.id);
  try {
    await rm(legacyExtractDir, { recursive: true, force: true });
    await rm(extractDir, { recursive: true, force: true });
    await mkdir(extractDir, { recursive: true });
    await downloadArtifact(token, graph.id, artifactPath, graph.size ?? undefined);
    if (graph.checksumSha256) {
      const actual = await sha256File(artifactPath);
      if (actual !== graph.checksumSha256) {
        await rm(artifactPath, { force: true });
        throw new Error("Routing graph artifact checksum mismatch");
      }
    }
    await runLogged(token, build.id, "tar", ["-xzf", artifactPath, "-C", extractDir]);
    const releaseDir = await installReleaseDirectory(
      extractDir,
      config.ROOT_AGENT_VALHALLA_DATA_DIR,
      build.id,
    );
    if (dem) {
      await activateDemCompanion(token, build.id, dem);
    }
    await restartRuntimeServices(token, build.id, [
      "valhalla",
      ...(dem ? ["elevation"] : []),
    ]);
    await updateActivation(token, build.id, "active", "Routing graph artifact activated", {
      output: {
        valhallaDataDir: config.ROOT_AGENT_VALHALLA_DATA_DIR,
        valhallaReleaseDir: releaseDir,
      },
    });
    await cleanupActivationWork(token, build.id, activationDir);
  } catch (err) {
    await updateActivation(token, build.id, "failed", "Routing graph activation failed", {
      errorMessage: err instanceof Error ? err.message : String(err),
    });
  }
}

async function activateBasemap(
  token: string,
  build: BasemapBuild,
  artifacts: BasemapArtifact[],
) {
  const tiles = artifacts.find((artifact) => artifact.kind === "basemap_tiles");
  if (!tiles) {
    await updateActivation(token, build.id, "failed", "No basemap tile artifact is available");
    return;
  }
  const activationDir = join(config.ROOT_AGENT_WORK_DIR, "activation", build.id, "basemap");
  const artifactPath = join(activationDir, tiles.fileName);
  const extension = tiles.fileName.toLowerCase().endsWith(".mbtiles") ? "mbtiles" : "pmtiles";
  const stableSource = safeMartinSource(build.name);
  const versionedSource = `${stableSource}.${build.id.slice(0, 8)}`;
  const stablePath = join(config.ROOT_AGENT_MARTIN_SOURCES_DIR, `${stableSource}.${extension}`);
  const versionedPath = join(
    config.ROOT_AGENT_MARTIN_SOURCES_DIR,
    `${versionedSource}.${extension}`,
  );
  try {
    await rm(join(activationDir, "extract"), { recursive: true, force: true });
    await mkdir(activationDir, { recursive: true });
    await mkdir(config.ROOT_AGENT_MARTIN_SOURCES_DIR, { recursive: true });
    await downloadArtifact(token, tiles.id, artifactPath, tiles.size ?? undefined);
    if (tiles.checksumSha256) {
      const actual = await sha256File(artifactPath);
      if (actual !== tiles.checksumSha256) {
        await rm(artifactPath, { force: true });
        throw new Error("Basemap artifact checksum mismatch");
      }
    }
    await copyFileAtomic(artifactPath, versionedPath);
    await linkFileAtomic(versionedPath, stablePath);
    await restartRuntimeServices(token, build.id, ["martin"]);
    await updateActivation(token, build.id, "active", "Basemap artifact activated", {
      output: {
        martinSource: stableSource,
        martinSourceVersioned: versionedSource,
        martinSourcesDir: config.ROOT_AGENT_MARTIN_SOURCES_DIR,
        martinPath: stablePath,
        martinPathVersioned: versionedPath,
      },
    });
    await cleanupActivationWork(token, build.id, activationDir);
  } catch (err) {
    await updateActivation(token, build.id, "failed", "Basemap activation failed", {
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
  await downloadArtifact(token, artifact.id, artifactPath, artifact.size ?? undefined);
  if (artifact.checksumSha256) {
    const actual = await sha256File(artifactPath);
    if (actual !== artifact.checksumSha256) {
      throw new Error("DEM companion artifact checksum mismatch");
    }
  }
  await runLogged(token, buildId, "tar", ["-xzf", artifactPath, "-C", extractDir]);
  await installReleaseDirectory(extractDir, config.ROOT_AGENT_ELEVATION_DATA_DIR, buildId);
}

async function restartRuntimeServices(
  token: string,
  buildId: string,
  services: string[],
) {
  if (!config.ROOT_AGENT_RUNTIME_SUPERVISOR_URL || !config.ROOT_AGENT_RUNTIME_SUPERVISOR_TOKEN) {
    await sendLogs(token, buildId, [
      {
        level: "error",
        message: "Runtime supervisor is not configured; activated files were not made live.",
      },
    ]);
    throw new Error("Runtime supervisor is required for activation");
  }
  for (const service of services) {
    const restarted = await withRetry(
      () => supervisorPost(service, "restart"),
      `restart ${service} runtime service`,
      runtimeServiceAttempts,
    );
    const health = await withRetry(
      () => supervisorPost(service, "health"),
      `check ${service} runtime service health`,
      runtimeServiceAttempts,
    );
    if (isSupervisorUnhealthy(health)) {
      throw new Error(`Runtime supervisor reported ${service} unhealthy after restart`);
    }
    await sendLogs(token, buildId, [
      {
        level: "info",
        message: `Runtime supervisor restarted ${service}`,
        metadata: { restart: restarted, health },
      },
    ]);
  }
}

async function supervisorPost(service: string, action: "restart" | "health") {
  const response = await fetch(
    `${config.ROOT_AGENT_RUNTIME_SUPERVISOR_URL}/services/${service}/${action}`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.ROOT_AGENT_RUNTIME_SUPERVISOR_TOKEN}`,
      },
    },
  );
  const body = (await response.json().catch(() => ({}))) as { data?: unknown; error?: unknown };
  if (!response.ok) {
    throw new Error(`Runtime supervisor ${service}/${action} failed: ${response.status}`);
  }
  return body.data ?? body;
}

function isSupervisorUnhealthy(value: unknown) {
  return (
    typeof value === "object" &&
    value !== null &&
    "healthy" in value &&
    (value as { healthy?: unknown }).healthy === false
  );
}

async function installReleaseDirectory(from: string, activePath: string, releaseId: string) {
  const releasesRoot = join(dirname(activePath), ".releases");
  const releaseDir = join(releasesRoot, releaseId);
  const previousPath = `${activePath}.previous`;
  await mkdir(releasesRoot, { recursive: true });
  await rm(releaseDir, { recursive: true, force: true });
  await rename(from, releaseDir);
  await rm(previousPath, { recursive: true, force: true });
  await movePathIfExists(activePath, previousPath);
  await symlink(join(".releases", releaseId), activePath, "dir");
  return releaseDir;
}

async function cleanupActivationWork(token: string, buildId: string, activationDir: string) {
  void token;
  void buildId;
  try {
    await rm(activationDir, { recursive: true, force: true });
    console.log(`[root-agent] cleaned activation work directory ${activationDir}`);
  } catch (err) {
    console.warn(
      `[root-agent] activation work directory cleanup failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
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
  build: BuildArtifactTarget,
  path: string,
  metadata: {
    kind: string;
    fileName: string;
    checksumSha256: string;
    contentType?: string;
    manifest: Record<string, unknown>;
  },
) {
  const fileSize = (await stat(path)).size;
  const contentType = metadata.contentType ?? "application/gzip";
  const session = await withRetry(
    () =>
      post<ArtifactUploadSession>(token, `/root-agent/jobs/${build.id}/artifacts/upload-session`, {
        kind: metadata.kind,
        fileName: metadata.fileName,
        checksumSha256: metadata.checksumSha256,
        manifest: metadata.manifest,
        size: fileSize,
        contentType,
      }),
    `create upload session for ${metadata.fileName}`,
  );

  if (session.data.strategy === "multipart") {
    const multipartSession = session.data;
    await sendLogs(token, build.id, [
      {
        level: "info",
        message: `Uploading ${metadata.fileName} directly to ${multipartSession.storage.provider} in ${multipartSession.multipart.parts.length} part(s)`,
      },
    ]);
    const uploadedParts = await uploadMultipartArtifact(
      path,
      fileSize,
      multipartSession.multipart.partSize,
      multipartSession.multipart.parts,
    );
    await withRetry(
      () =>
        post(token, `/root-agent/jobs/${build.id}/artifacts/finalize`, {
          kind: metadata.kind,
          fileName: metadata.fileName,
          checksumSha256: metadata.checksumSha256,
          manifest: metadata.manifest,
          size: fileSize,
          contentType,
          storage: {
            ...multipartSession.storage,
            uploadId: multipartSession.multipart.uploadId,
            parts: uploadedParts,
          },
        }),
      `finalize upload for ${metadata.fileName}`,
    );
    return;
  }

  await sendLogs(token, build.id, [
    {
      level: "warn",
      message: `Using legacy proxied artifact upload for ${metadata.fileName}: ${
        session.data.reason ?? "direct upload is unavailable"
      }`,
    },
  ]);
  await uploadArtifactViaApi(token, build, path, metadata, fileSize, contentType);
}

async function uploadArtifactViaApi(
  token: string,
  build: BuildArtifactTarget,
  path: string,
  metadata: {
    kind: string;
    fileName: string;
    checksumSha256: string;
    contentType?: string;
    manifest: Record<string, unknown>;
  },
  fileSize: number,
  contentType: string,
) {
  const init = {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": contentType,
      "x-artifact-kind": metadata.kind,
      "x-artifact-filename": metadata.fileName,
      "x-artifact-sha256": metadata.checksumSha256,
      "x-artifact-manifest": JSON.stringify(metadata.manifest),
      "x-artifact-size": String(fileSize),
    },
    duplex: "half",
  } as unknown as RequestInit & { duplex: "half" };
  await withRetry(async () => {
    const uploadInit = {
      ...init,
      body: createReadStream(path),
    } as unknown as RequestInit & { duplex: "half" };
    const response = await fetch(
      `${apiBase}/root-agent/jobs/${build.id}/artifacts`,
      uploadInit,
    );
    if (!response.ok) throw new Error(`Artifact upload failed: ${response.status}`);
  }, `legacy upload for ${metadata.fileName}`);
}

async function uploadMultipartArtifact(
  path: string,
  fileSize: number,
  partSize: number,
  parts: Array<{ partNumber: number; url: string; method: "PUT" }>,
): Promise<UploadedPart[]> {
  const uploaded: UploadedPart[] = [];
  let nextPartIndex = 0;
  async function uploadNextPart() {
    for (;;) {
      const part = parts[nextPartIndex];
      nextPartIndex += 1;
      if (!part) return;
      uploaded.push(await uploadMultipartPart(path, fileSize, partSize, part));
    }
  }
  await Promise.all(
    Array.from(
      { length: Math.min(config.ROOT_AGENT_UPLOAD_CONCURRENCY, parts.length) },
      () => uploadNextPart(),
    ),
  );
  return uploaded.sort((a, b) => a.partNumber - b.partNumber);
}

async function uploadMultipartPart(
  path: string,
  fileSize: number,
  partSize: number,
  part: { partNumber: number; url: string; method: "PUT" },
) {
  const start = (part.partNumber - 1) * partSize;
  const end = Math.min(start + partSize, fileSize) - 1;
  const contentLength = end - start + 1;
  const eTag = await withRetry(async () => {
    const response = await fetch(part.url, {
      method: part.method,
      headers: { "content-length": String(contentLength) },
      body: createReadStream(path, { start, end }),
      duplex: "half",
    } as unknown as RequestInit & { duplex: "half" });
    if (!response.ok) {
      throw new Error(`Part ${part.partNumber} upload failed: ${response.status}`);
    }
    const responseETag = response.headers.get("etag");
    if (!responseETag) {
      throw new Error(`Part ${part.partNumber} upload did not return an ETag`);
    }
    return responseETag;
  }, `upload part ${part.partNumber}`);
  return { partNumber: part.partNumber, eTag };
}

async function downloadArtifact(
  token: string,
  artifactId: string,
  target: string,
  expectedSize?: number,
) {
  await mkdir(dirname(target), { recursive: true });
  if (!expectedSize || expectedSize <= 0) {
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
    return;
  }

  const existingSize = await fileSize(target);
  if (existingSize > expectedSize) {
    await rm(target, { force: true });
  }

  for (;;) {
    const start = await fileSize(target);
    if (start === expectedSize) return;
    const end = Math.min(start + config.ROOT_AGENT_DOWNLOAD_PART_SIZE_BYTES, expectedSize) - 1;
    await withRetry(async () => {
      const currentStart = await fileSize(target);
      if (currentStart >= expectedSize) return;
      const currentEnd =
        Math.min(currentStart + config.ROOT_AGENT_DOWNLOAD_PART_SIZE_BYTES, expectedSize) - 1;
      const response = await fetch(`${apiBase}/root-agent/artifacts/${artifactId}/download`, {
        headers: {
          authorization: `Bearer ${token}`,
          range: `bytes=${currentStart}-${currentEnd}`,
        },
      });
      if (response.status !== 206 || !response.body) {
        throw new Error(`Artifact range download failed: ${response.status}`);
      }
      await pipeline(
        Readable.fromWeb(response.body as unknown as import("node:stream/web").ReadableStream),
        createWriteStream(target, { flags: "a" }),
      );
      const downloaded = await fileSize(target);
      if (downloaded <= currentStart) {
        throw new Error(`Artifact range download made no progress at byte ${currentStart}`);
      }
    }, `download artifact ${artifactId} bytes ${start}-${end}`);
  }
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
  entries: Array<{ level: string; message: string; metadata?: unknown }>,
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

async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  attempts = config.ROOT_AGENT_UPLOAD_RETRIES,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === attempts || !isTransientError(err)) break;
      await delay(Math.min(30_000, 1000 * 2 ** (attempt - 1)));
    }
  }
  throw new Error(
    `${label} failed after ${attempts} attempt(s): ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

async function existingLocalArtifacts(paths: string[]) {
  const existing: Array<{ path: string; size: number }> = [];
  for (const path of paths) {
    try {
      existing.push({ path, size: (await stat(path)).size });
    } catch {
      // Missing artifacts are expected when a build fails before packaging.
    }
  }
  return existing;
}

function isTransientError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  if (/\b(408|409|425|429|500|502|503|504)\b/.test(message)) return true;
  return /ECONNRESET|ETIMEDOUT|EAI_AGAIN|fetch failed|network|timeout/i.test(message);
}

async function sha256File(path: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

async function fileSize(path: string) {
  try {
    return (await stat(path)).size;
  } catch {
    return 0;
  }
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

async function movePathIfExists(from: string, to: string) {
  try {
    await lstat(from);
    await rename(from, to);
  } catch {
    // Missing active runtime data is acceptable for first activation.
  }
}

async function copyFileAtomic(from: string, to: string) {
  const tmp = `${to}.tmp-${Date.now()}`;
  await copyFile(from, tmp);
  await rename(tmp, to);
}

async function linkFileAtomic(from: string, to: string) {
  const tmp = `${to}.tmp-${Date.now()}`;
  try {
    await rm(tmp, { force: true });
    await link(from, tmp);
    await rename(tmp, to);
  } catch (err) {
    await rm(tmp, { force: true });
    throw err;
  }
}

function planetilerExtraArgs(configValue: Record<string, unknown>) {
  const args = Array.isArray(configValue.planetilerArgs)
    ? configValue.planetilerArgs.filter((item): item is string => typeof item === "string")
    : [];
  const minZoom = numberFromConfig(configValue, "minZoom", NaN);
  const maxZoom = numberFromConfig(configValue, "maxZoom", NaN);
  return [
    ...(Number.isFinite(minZoom) ? [`--minzoom=${minZoom}`] : []),
    ...(Number.isFinite(maxZoom) ? [`--maxzoom=${maxZoom}`] : []),
    ...args,
  ];
}

function numberFromConfig(configValue: Record<string, unknown>, key: string, fallback: number) {
  const value = Number(configValue[key]);
  return Number.isFinite(value) ? value : fallback;
}

function safeMartinSource(name: string) {
  return name.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^_+|_+$/g, "").slice(0, 96) || "basemap";
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
