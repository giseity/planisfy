import { Hono } from "hono";
import { access, open, readFile, statfs } from "node:fs/promises";
import { join } from "node:path";
import {
  type UpgradeReleaseManifest,
  missingRequiredEnv,
  safeParseUpgradeReleaseManifest,
} from "@planisfy/upgrade-manifest";
import {
  type CapabilityId,
  type CapabilityPolicy,
  type DeploymentMode,
  getDeploymentPolicy,
  parseDeploymentMode,
} from "@planisfy/platform-policy";
import type { AuthEnv } from "../middleware/auth";
import { env } from "../env";
import { probeValhallaReadiness } from "../lib/valhalla-readiness";

export const setupRoute = new Hono<AuthEnv>();

type PreflightStatus = "pass" | "warn" | "fail";
type PreflightSeverity = "required" | "recommended" | "optional";
type PlatformCapabilityStatus =
  | "configured"
  | "degraded"
  | "unavailable"
  | "hidden";

interface PreflightCheck {
  id: string;
  label: string;
  group: string;
  status: PreflightStatus;
  severity: PreflightSeverity;
  message: string;
  action?: string;
  value?: string | number | boolean | null;
}

interface PlatformCapability extends CapabilityPolicy {
  status: PlatformCapabilityStatus;
  message: string;
  action?: string;
  value?: string | number | boolean | null;
}

const LOCAL_DEMO_STYLE_FIXTURES = [
  "styles/planisfy-streets-v1.json",
  "styles/planisfy-streets-light-v1.json",
  "styles/planisfy-streets-dark-v1.json",
];

setupRoute.get("/setup/preflight", async (c) => {
  const deploymentMode = activeDeploymentMode();
  const checks = await buildPreflightChecks(deploymentMode);
  const capabilities = buildCapabilityStates(deploymentMode, checks);
  const summary = checks.reduce(
    (acc, check) => {
      acc[check.status] += 1;
      if (check.status === "fail" && check.severity === "required") {
        acc.blocking += 1;
      }
      return acc;
    },
    { pass: 0, warn: 0, fail: 0, blocking: 0 },
  );

  return c.json({
    data: {
      generatedAt: new Date().toISOString(),
      environment: env.NODE_ENV,
      appVersion: env.APP_VERSION,
      deploymentMode,
      capabilities,
      summary,
      groups: groupChecks(checks),
      checks,
    },
  });
});

async function buildPreflightChecks(
  deploymentMode = activeDeploymentMode(),
): Promise<PreflightCheck[]> {
  const managed = deploymentMode === "managed";
  const storage = await storageCheck(deploymentMode);
  const productLoopChecks = await buildProductLoopChecks(deploymentMode);
  const upgradeChecks = await buildUpgradeReadinessChecks(storage);
  const valhalla = await valhallaReadinessCheck();

  return [
    check({
      id: "auth-secret",
      group: "Identity",
      label: "Auth secret",
      severity: "required",
      ok: Boolean(env.BETTER_AUTH_SECRET),
      message: env.BETTER_AUTH_SECRET
        ? "BETTER_AUTH_SECRET is configured."
        : "BETTER_AUTH_SECRET is missing.",
      action: "Set a strong BETTER_AUTH_SECRET before production use.",
    }),
    check({
      id: "internal-secret",
      group: "Identity",
      label: "Internal API secret",
      severity: "required",
      ok: Boolean(env.INTERNAL_API_SECRET),
      message: env.INTERNAL_API_SECRET
        ? "INTERNAL_API_SECRET is configured."
        : "INTERNAL_API_SECRET is missing.",
      action: "Set INTERNAL_API_SECRET and restrict /internal traffic.",
    }),
    check({
      id: "credential-encryption",
      group: "Identity",
      label: "Credential encryption key",
      severity: "recommended",
      ok: Boolean(env.SOURCE_CREDENTIAL_ENCRYPTION_KEY),
      warnWhenMissing: true,
      message: env.SOURCE_CREDENTIAL_ENCRYPTION_KEY
        ? "A dedicated source credential key is configured."
        : "Source credentials will fall back to auth/internal secrets.",
      action:
        "Set SOURCE_CREDENTIAL_ENCRYPTION_KEY to a base64: 32-byte key in production.",
    }),
    check({
      id: "api-url",
      group: "Routing",
      label: "Public API URL",
      severity: "required",
      ok: isPublicUrl(env.NEXT_PUBLIC_API_URL),
      message: `API root is ${env.NEXT_PUBLIC_API_URL}.`,
      action: "Use the externally reachable API URL for managed deployments.",
      value: env.NEXT_PUBLIC_API_URL,
    }),
    check({
      id: "console-url",
      group: "Routing",
      label: "Console URL",
      severity: "required",
      ok: isPublicUrl(env.NEXT_PUBLIC_CONSOLE_URL),
      message: `Console root is ${env.NEXT_PUBLIC_CONSOLE_URL}.`,
      action:
        "Set NEXT_PUBLIC_CONSOLE_URL to the user-facing Console origin for auth and billing redirects.",
      value: env.NEXT_PUBLIC_CONSOLE_URL,
    }),
    storage,
    ...productLoopChecks,
    ...upgradeChecks,
    check({
      id: "martin",
      group: "Geospatial engines",
      label: "Martin tile server",
      severity: "required",
      ok: Boolean(env.MARTIN_URL),
      message: `Martin URL is ${env.MARTIN_URL}.`,
      action: "Configure MARTIN_URL and publish matching source aliases.",
      value: env.MARTIN_URL,
    }),
    valhalla,
    check({
      id: "geocoding",
      group: "Geospatial engines",
      label: "Geocoding provider",
      severity: "optional",
      ok: !env.PELIAS_URL.includes("api.planisfy.localhost/geocoding"),
      warnWhenMissing: true,
      message: env.PELIAS_URL.includes("api.planisfy.localhost/geocoding")
        ? "Geocoding is using the development fallback URL."
        : `Geocoding provider is ${env.PELIAS_URL}.`,
      action: "Set PELIAS_URL for production-quality geocoding.",
      value: env.PELIAS_URL,
    }),
    check({
      id: "static-maps",
      group: "Geospatial engines",
      label: "Static map renderer",
      severity: "optional",
      ok: Boolean(env.STATIC_MAP_URL),
      warnWhenMissing: true,
      message: env.STATIC_MAP_URL
        ? `Static maps renderer is ${env.STATIC_MAP_URL}.`
        : "Static maps will return a placeholder.",
      action: "Set STATIC_MAP_URL to enable real static image rendering.",
      value: env.STATIC_MAP_URL ?? null,
    }),
    check({
      id: "overture",
      group: "Data imports",
      label: "Overture release",
      severity: "recommended",
      ok: Boolean(env.OVERTURE_RELEASE),
      warnWhenMissing: true,
      message: env.OVERTURE_RELEASE
        ? `Overture release is ${env.OVERTURE_RELEASE}.`
        : "Overture imports will fail until a release is configured.",
      action: "Set OVERTURE_RELEASE for DuckDB-backed Overture imports.",
      value: env.OVERTURE_RELEASE ?? null,
    }),
    check({
      id: "worker-toolchain",
      group: "Data imports",
      label: "Worker toolchain",
      severity: "recommended",
      ok: Boolean(
        process.env.DUCKDB_PATH &&
          process.env.TIPPECANOE_PATH &&
          process.env.OGR2OGR_PATH,
      ),
      warnWhenMissing: true,
      message:
        process.env.DUCKDB_PATH &&
        process.env.TIPPECANOE_PATH &&
        process.env.OGR2OGR_PATH
          ? `Worker toolchain paths are ${process.env.DUCKDB_PATH}, ${process.env.TIPPECANOE_PATH}, and ${process.env.OGR2OGR_PATH}.`
          : "Worker toolchain path hints are not visible to the API runtime.",
      action:
        "Set DUCKDB_PATH, TIPPECANOE_PATH, and OGR2OGR_PATH on worker deployments and confirm /health/detailed workerGeodata before imports.",
      value:
        process.env.DUCKDB_PATH &&
        process.env.TIPPECANOE_PATH &&
        process.env.OGR2OGR_PATH
          ? "configured"
          : null,
    }),
    check({
      id: "source-egress",
      group: "Data imports",
      label: "Private source URL policy",
      severity: "recommended",
      ok: !env.ALLOW_PRIVATE_SOURCE_URLS,
      warnWhenMissing: true,
      message: env.ALLOW_PRIVATE_SOURCE_URLS
        ? "Private source URLs are allowed."
        : "Private and local source URLs are blocked.",
      action:
        "Keep ALLOW_PRIVATE_SOURCE_URLS=false unless the deployment has explicit egress controls.",
      value: env.ALLOW_PRIVATE_SOURCE_URLS,
    }),
    check({
      id: "email",
      group: "Communications",
      label: "Transactional email",
      severity: managed ? "required" : "optional",
      ok: Boolean(env.RESEND_API_KEY),
      warnWhenMissing: !managed,
      message: env.RESEND_API_KEY
        ? "Resend email delivery is configured."
        : "Email delivery is disabled.",
      action: managed
        ? "Set RESEND_API_KEY before enabling managed mode."
        : "Set RESEND_API_KEY for production email delivery.",
    }),
    check({
      id: "billing",
      group: "Billing",
      label: "Billing checkout",
      severity: managed ? "required" : "optional",
      ok: Boolean(
        env.DODO_PAYMENTS_API_KEY &&
          env.DODO_PAYMENTS_WEBHOOK_SECRET &&
          env.DODO_PRO_PRODUCT_ID,
      ),
      warnWhenMissing: !managed,
      message:
        env.DODO_PAYMENTS_API_KEY &&
        env.DODO_PAYMENTS_WEBHOOK_SECRET &&
        env.DODO_PRO_PRODUCT_ID
          ? "Dodo Payments checkout and webhooks are configured."
          : env.DODO_PAYMENTS_API_KEY || env.DODO_PRO_PRODUCT_ID
            ? "Dodo Payments checkout is partially configured."
          : "Billing checkout is disabled.",
      action:
        "Set Dodo API key, webhook secret, and product IDs to enable managed billing.",
    }),
  ];
}

async function buildUpgradeReadinessChecks(
  storage: PreflightCheck,
): Promise<PreflightCheck[]> {
  const manifestPath = process.env.PLANISFY_RELEASE_MANIFEST;
  const manifestCheck = await upgradeManifestCheck(manifestPath);
  const manifest =
    manifestCheck.manifest && manifestCheck.status === "pass"
      ? manifestCheck.manifest
      : null;
  const missingEnv = manifest ? missingRequiredEnv(manifest, process.env) : [];

  return [
    check({
      id: "upgrade-current-version",
      group: "Upgrade readiness",
      label: "Current version",
      severity: "required",
      ok: Boolean(env.APP_VERSION),
      message: `Current app version is ${env.APP_VERSION}.`,
      action: "Set APP_VERSION to a release version before managed upgrades.",
      value: env.APP_VERSION,
    }),
    manifestCheck.check,
    check({
      id: "upgrade-required-env",
      group: "Upgrade readiness",
      label: "Target release environment",
      severity: manifest ? "required" : "recommended",
      ok: missingEnv.length === 0,
      warnWhenMissing: !manifest,
      message: manifest
        ? missingEnv.length === 0
          ? "Required target release environment variables are present."
          : `Missing target release env vars: ${missingEnv.join(", ")}.`
        : "No release manifest configured; target release env requirements are unavailable.",
      action:
        "Set PLANISFY_RELEASE_MANIFEST to a pinned release manifest before upgrading.",
      value: missingEnv.length,
    }),
    await backupScriptCheck(),
    await migrationMetadataCheck(),
    check({
      id: "upgrade-storage-access",
      group: "Upgrade readiness",
      label: "Storage access",
      severity: "required",
      ok: storage.status !== "fail",
      message:
        storage.status !== "fail"
          ? "Storage is reachable for backup and post-upgrade verification."
          : "Storage is not reachable.",
      action: storage.action,
      value: storage.value,
    }),
    check({
      id: "upgrade-worker-heartbeat",
      group: "Upgrade readiness",
      label: "Worker heartbeat",
      severity: "recommended",
      ok: false,
      warnWhenMissing: true,
      message:
        "Worker heartbeat is verified by /health/detailed when Redis is reachable.",
      action:
        "Check /health/detailed before upgrade and confirm workerGeodata is ok or intentionally unavailable.",
    }),
    check({
      id: "upgrade-martin-url",
      group: "Upgrade readiness",
      label: "Martin URL",
      severity: "required",
      ok: Boolean(env.MARTIN_URL),
      message: env.MARTIN_URL
        ? `Martin URL is configured: ${env.MARTIN_URL}.`
        : "MARTIN_URL is missing.",
      action: "Configure MARTIN_URL before upgrading map delivery services.",
      value: env.MARTIN_URL,
    }),
    await freeDiskCheck(),
  ];
}

async function valhallaReadinessCheck(): Promise<PreflightCheck> {
  if (!env.VALHALLA_URL) {
    return check({
      id: "valhalla",
      group: "Geospatial engines",
      label: "Valhalla routing",
      severity: "recommended",
      ok: false,
      warnWhenMissing: true,
      message: "Valhalla URL is not configured.",
      action: "Configure VALHALLA_URL when routing APIs should be available.",
      value: null,
    });
  }

  const readiness = await probeValhallaReadiness(env.VALHALLA_URL);
  return check({
    id: "valhalla",
    group: "Geospatial engines",
    label: "Valhalla routing",
    severity: "recommended",
    ok: readiness.status === "ok",
    warnWhenMissing: true,
    message:
      readiness.status === "ok"
        ? "Valhalla is reachable and can answer the route readiness probe."
        : readiness.message,
    action:
      readiness.status === "ok"
        ? undefined
        : "Build or mount a Valhalla routing graph for the configured readiness route, or set VALHALLA_READINESS_ROUTE to coordinates covered by the graph.",
    value: env.VALHALLA_URL,
  });
}

async function upgradeManifestCheck(path: string | undefined): Promise<{
  check: PreflightCheck;
  status: PreflightStatus;
  manifest?: UpgradeReleaseManifest;
}> {
  if (!path) {
    return {
      status: "warn",
      check: check({
        id: "upgrade-release-manifest",
        group: "Upgrade readiness",
        label: "Target release manifest",
        severity: "recommended",
        ok: false,
        warnWhenMissing: true,
        message: "No target release manifest is configured.",
        action:
          "Set PLANISFY_RELEASE_MANIFEST to a pinned release manifest before upgrade.",
      }),
    };
  }

  try {
    const raw = await readFile(path, "utf8");
    const parsed = safeParseUpgradeReleaseManifest(JSON.parse(raw));
    if (!parsed.success) {
      return {
        status: "fail",
        check: check({
          id: "upgrade-release-manifest",
          group: "Upgrade readiness",
          label: "Target release manifest",
          severity: "required",
          ok: false,
          message: "Target release manifest is invalid.",
          action: parsed.error.issues
            .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
            .join("; "),
          value: path,
        }),
      };
    }

    return {
      status: "pass",
      manifest: parsed.data,
      check: check({
        id: "upgrade-release-manifest",
        group: "Upgrade readiness",
        label: "Target release manifest",
        severity: "required",
        ok: true,
        message: `Target release manifest ${parsed.data.version} is valid.`,
        value: path,
      }),
    };
  } catch (err) {
    return {
      status: "fail",
      check: check({
        id: "upgrade-release-manifest",
        group: "Upgrade readiness",
        label: "Target release manifest",
        severity: "required",
        ok: false,
        message: `Target release manifest cannot be read: ${errorMessage(err)}.`,
        action: "Check PLANISFY_RELEASE_MANIFEST and file permissions.",
        value: path,
      }),
    };
  }
}

async function backupScriptCheck() {
  const backupScript = await findRepoFile("scripts/self-host-backup.sh");
  return check({
    id: "upgrade-backup-script",
    group: "Upgrade readiness",
    label: "Backup script",
    severity: "required",
    ok: Boolean(backupScript),
    message: backupScript
      ? `Backup script is available: ${backupScript}.`
      : "Backup script is not available to this runtime.",
    action:
      "Mount scripts/self-host-backup.sh or run upgrades through the self-host supervisor.",
    value: backupScript,
  });
}

async function migrationMetadataCheck() {
  const journal = await findRepoFile("packages/database/drizzle/meta/_journal.json");
  return check({
    id: "upgrade-migration-metadata",
    group: "Upgrade readiness",
    label: "Migration metadata",
    severity: "recommended",
    ok: Boolean(journal),
    warnWhenMissing: true,
    message: journal
      ? `Drizzle migration metadata is available: ${journal}.`
      : "Drizzle migration metadata is not available to this runtime.",
    action: "Ensure migrations are bundled or available to the supervisor.",
    value: journal,
  });
}

async function freeDiskCheck(): Promise<PreflightCheck> {
  const storagePath =
    process.env.LOCAL_STORAGE_PATH ?? join(process.cwd(), ".storage");
  try {
    const stats = await statfs(storagePath);
    const freeBytes = Number(stats.bavail) * Number(stats.bsize);
    const minimum = 1024 * 1024 * 1024;
    return check({
      id: "upgrade-free-disk",
      group: "Upgrade readiness",
      label: "Free disk",
      severity: "recommended",
      ok: freeBytes >= minimum,
      warnWhenMissing: true,
      message: `${Math.round(freeBytes / 1024 / 1024)} MB free at ${storagePath}.`,
      action: "Keep at least 1 GB free before backup and upgrade.",
      value: freeBytes,
    });
  } catch (err) {
    return check({
      id: "upgrade-free-disk",
      group: "Upgrade readiness",
      label: "Free disk",
      severity: "optional",
      ok: false,
      warnWhenMissing: true,
      message: `Free disk could not be checked: ${errorMessage(err)}.`,
      action: "Check disk space manually before upgrade.",
    });
  }
}

async function findRepoFile(relativePath: string) {
  const roots = [
    process.cwd(),
    join(process.cwd(), ".."),
    join(process.cwd(), "..", ".."),
  ];
  for (const root of roots) {
    const candidate = join(root, relativePath);
    if (await canAccess(candidate)) return candidate;
  }
  return null;
}

async function buildProductLoopChecks(
  deploymentMode = activeDeploymentMode(),
): Promise<PreflightCheck[]> {
  if (deploymentMode !== "self_host") {
    return [];
  }

  if ((process.env.STORAGE_PROVIDER ?? "local") !== "local") {
    return [];
  }

  const storagePath =
    process.env.LOCAL_STORAGE_PATH ?? join(process.cwd(), ".storage");
  const demoPmtilesPath =
    process.env.DEMO_PMTILES_PATH === undefined
      ? "/data/pmtiles/stuttgart.pmtiles"
      : process.env.DEMO_PMTILES_PATH.trim();
  const martinSourcesPath =
    process.env.MARTIN_SOURCES_PATH ?? join(storagePath, "martin-sources");

  return [
    await pathAccessCheck({
      id: "upload-storage",
      group: "Self-host product loop",
      label: "Upload artifact storage",
      severity: "required",
      path: join(storagePath, "uploads"),
      okMessage: "Upload artifact storage is ready for local source data.",
      missingMessage: "Upload artifact storage is missing.",
      action:
        "Run scripts/self-host-setup.sh to create local storage directories.",
    }),
    await styleFixtureCheck(storagePath),
    await pathAccessCheck({
      id: "martin-source-aliases",
      group: "Self-host product loop",
      label: "Published tile aliases",
      severity: "required",
      path: martinSourcesPath,
      okMessage: "Published tile alias storage is ready.",
      missingMessage: "Published tile alias storage is missing.",
      action:
        "Run scripts/self-host-setup.sh so published local PMTiles/MBTiles aliases have a directory.",
    }),
    await pmtilesFixtureCheck(demoPmtilesPath),
  ];
}

async function styleFixtureCheck(storagePath: string): Promise<PreflightCheck> {
  const missing: string[] = [];
  for (const fixture of LOCAL_DEMO_STYLE_FIXTURES) {
    const fixturePath = join(storagePath, fixture);
    if (!(await canAccess(fixturePath))) {
      missing.push(fixture);
    }
  }

  return check({
    id: "demo-style-fixtures",
    group: "Self-host product loop",
    label: "Seeded demo styles",
    severity: "required",
    ok: missing.length === 0,
    message:
      missing.length === 0
        ? "Planisfy Streets demo styles are seeded in local storage."
        : `Missing demo style fixtures: ${missing.join(", ")}.`,
    action:
      "Run scripts/self-host-setup.sh to seed the local demo style fixtures.",
    value: LOCAL_DEMO_STYLE_FIXTURES.length - missing.length,
  });
}

async function pmtilesFixtureCheck(path: string): Promise<PreflightCheck> {
  if (!path.trim()) {
    return check({
      id: "demo-pmtiles",
      group: "Self-host product loop",
      label: "Default PMTiles fixture",
      severity: "recommended",
      ok: false,
      warnWhenMissing: true,
      message: "Default PMTiles fixture path is not configured.",
      action:
        "Set DEMO_PMTILES_PATH to a compatible PMTiles file or configure DEMO_PMTILES_URL and run scripts/self-host-setup.sh --demo-data.",
      value: null,
    });
  }

  if (!(await canAccess(path))) {
    return check({
      id: "demo-pmtiles",
      group: "Self-host product loop",
      label: "Default PMTiles fixture",
      severity: "recommended",
      ok: false,
      warnWhenMissing: true,
      message: `Default PMTiles fixture is missing: ${path}.`,
      action:
        "Place a compatible PMTiles file there or configure DEMO_PMTILES_URL and run scripts/self-host-setup.sh --demo-data.",
      value: path,
    });
  }

  const file = await open(path, "r");
  const buffer = Buffer.alloc(7);
  await file.read(buffer, 0, 7, 0);
  await file.close();
  const header = buffer.toString("utf8");

  return check({
    id: "demo-pmtiles",
    group: "Self-host product loop",
    label: "Default PMTiles fixture",
    severity: "recommended",
    ok: header === "PMTiles",
    warnWhenMissing: true,
    message:
      header === "PMTiles"
        ? "Default PMTiles fixture is present and has a valid PMTiles header."
        : `Default fixture does not look like PMTiles: ${path}.`,
    action:
      "Replace the file with a compatible PMTiles archive or rerun scripts/self-host-setup.sh --demo-data.",
    value: path,
  });
}

async function pathAccessCheck(params: {
  id: string;
  group: string;
  label: string;
  severity: PreflightSeverity;
  path: string;
  okMessage: string;
  missingMessage: string;
  action: string;
}): Promise<PreflightCheck> {
  const ok = await canAccess(params.path);
  return check({
    id: params.id,
    group: params.group,
    label: params.label,
    severity: params.severity,
    ok,
    message: ok
      ? `${params.okMessage} (${params.path})`
      : `${params.missingMessage} (${params.path})`,
    action: params.action,
    value: params.path,
  });
}

async function canAccess(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function check(params: {
  id: string;
  label: string;
  group: string;
  severity: PreflightSeverity;
  ok: boolean;
  warnWhenMissing?: boolean;
  message: string;
  action?: string;
  value?: string | number | boolean | null;
}): PreflightCheck {
  return {
    id: params.id,
    label: params.label,
    group: params.group,
    severity: params.severity,
    status: params.ok ? "pass" : params.warnWhenMissing ? "warn" : "fail",
    message: params.message,
    action: params.action,
    value: params.value,
  };
}

function buildCapabilityStates(
  deploymentMode: DeploymentMode,
  checks: PreflightCheck[],
): PlatformCapability[] {
  return getDeploymentPolicy(deploymentMode).capabilities.map((capability) => {
    const mapped = capabilityChecks(capability.id, checks);
    if (capability.policy === "hidden") {
      return {
        ...capability,
        status: "hidden",
        message: `${capability.label} is hidden in ${deploymentModeLabel(deploymentMode)} mode.`,
      };
    }

    if (capability.policy === "unavailable") {
      return {
        ...capability,
        status: "unavailable",
        message: `${capability.label} is unavailable in ${deploymentModeLabel(deploymentMode)} mode.`,
      };
    }

    if (mapped.length === 0) {
      return fallbackCapabilityState(deploymentMode, capability);
    }

    const primary =
      mapped.find(
        (item) => item.status === "fail" && item.severity === "required",
      ) ??
      mapped.find((item) => item.status !== "pass") ??
      mapped[0]!;
    const requiredFailure = mapped.some(
      (item) => item.status === "fail" && item.severity === "required",
    );
    const anyPass = mapped.some((item) => item.status === "pass");
    const anyWarnOrFail = mapped.some((item) => item.status !== "pass");
    const status: PlatformCapabilityStatus = requiredFailure
      ? "unavailable"
      : anyWarnOrFail
        ? "degraded"
        : anyPass
          ? "configured"
          : "degraded";

    return {
      ...capability,
      status,
      message: primary.message,
      action:
        status === "configured"
          ? undefined
          : primary.action ?? capability.description,
      value: primary.value,
    };
  });
}

function capabilityChecks(
  id: CapabilityId,
  checks: PreflightCheck[],
): PreflightCheck[] {
  const ids: Record<CapabilityId, string[]> = {
    billing: ["billing"],
    transactionalEmail: ["email"],
    managedStorage: ["storage"],
    localStorage: ["storage", "upload-storage", "martin-source-aliases"],
    selfHostSupervisor: [],
    customExecutionTargets: [],
    publicSignup: ["auth-secret", "console-url"],
    apiKeyCreation: ["auth-secret"],
    usageBilling: ["billing"],
    supportBundles: ["upgrade-backup-script"],
    releaseUpgrades: [
      "upgrade-current-version",
      "upgrade-release-manifest",
      "upgrade-required-env",
      "upgrade-backup-script",
      "upgrade-migration-metadata",
      "upgrade-storage-access",
    ],
    platformWorkerRuntime: ["worker-toolchain", "upgrade-worker-heartbeat"],
  };

  const checkIds = ids[id] ?? [];
  return checkIds
    .map((checkId) => checks.find((check) => check.id === checkId))
    .filter((check): check is PreflightCheck => Boolean(check));
}

function fallbackCapabilityState(
  deploymentMode: DeploymentMode,
  capability: CapabilityPolicy,
): PlatformCapability {
  if (capability.id === "selfHostSupervisor") {
    const configured = Boolean(
      process.env.SUPERVISOR_URL && process.env.SUPERVISOR_TOKEN,
    );
    return {
      ...capability,
      status: configured ? "configured" : "degraded",
      message: configured
        ? "Self-host supervisor is configured."
        : "Self-host supervisor is optional and not configured.",
      action: configured
        ? undefined
        : "Start the with-supervisor Compose profile and set SUPERVISOR_URL/SUPERVISOR_TOKEN when upgrade automation is desired.",
      value: process.env.SUPERVISOR_URL ?? null,
    };
  }

  if (capability.id === "customExecutionTargets") {
    return {
      ...capability,
      status: "configured",
      message:
        deploymentMode === "self_host"
          ? "Customer-managed execution targets and worker profiles are available."
          : "Managed compute is platform-operated for v1.",
    };
  }

  if (capability.id === "apiKeyCreation") {
    return {
      ...capability,
      status: "configured",
      message:
        deploymentMode === "managed"
          ? "API key creation is available after the user verifies email."
          : "API key creation is available in self-host mode.",
      action:
        deploymentMode === "managed"
          ? "Verify account email before creating or rotating API keys."
          : undefined,
    };
  }

  return {
    ...capability,
    status: "configured",
    message: capability.description,
  };
}

async function storageCheck(
  deploymentMode = activeDeploymentMode(),
): Promise<PreflightCheck> {
  const provider = process.env.STORAGE_PROVIDER ?? "local";
  if (provider === "local") {
    if (deploymentMode === "managed") {
      return check({
        id: "storage",
        group: "Storage",
        label: "Managed R2 storage",
        severity: "required",
        ok: false,
        message: "Managed mode cannot use local artifact storage.",
        action:
          "Set STORAGE_PROVIDER=r2 with R2 bucket, endpoint/account, credentials, and public URL.",
        value: provider,
      });
    }

    const storagePath =
      process.env.LOCAL_STORAGE_PATH ?? join(process.cwd(), ".storage");
    try {
      await access(storagePath);
      return check({
        id: "storage",
        group: "Storage",
        label: "Local storage",
        severity: "required",
        ok: true,
        message: `Local storage path is reachable: ${storagePath}.`,
        value: storagePath,
      });
    } catch {
      return check({
        id: "storage",
        group: "Storage",
        label: "Local storage",
        severity: "required",
        ok: false,
        message: `Local storage path is not reachable: ${storagePath}.`,
        action: "Create the local storage directory or set LOCAL_STORAGE_PATH.",
        value: storagePath,
      });
    }
  }

  if (provider === "s3") {
    if (deploymentMode === "managed") {
      return check({
        id: "storage",
        group: "Storage",
        label: "Managed R2 storage",
        severity: "required",
        ok: false,
        message: "Managed v1 requires R2-compatible storage.",
        action:
          "Set STORAGE_PROVIDER=r2 for managed v1; keep S3 customer storage for self-host or later hybrid modes.",
        value: provider,
      });
    }

    return check({
      id: "storage",
      group: "Storage",
      label: "S3 storage",
      severity: "required",
      ok: Boolean(process.env.S3_BUCKET),
      message: process.env.S3_BUCKET
        ? `S3 bucket is ${process.env.S3_BUCKET}.`
        : "S3_BUCKET is missing.",
      action: "Set S3 bucket, region, optional endpoint, and credentials.",
      value: process.env.S3_BUCKET ?? null,
    });
  }

  const configured =
    Boolean(process.env.R2_BUCKET || process.env.S3_BUCKET) &&
    Boolean(process.env.R2_ENDPOINT || process.env.R2_ACCOUNT_ID) &&
    Boolean(
      (process.env.R2_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID) &&
      (process.env.R2_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY),
    );
  return check({
    id: "storage",
    group: "Storage",
    label: "R2 storage",
    severity: "required",
    ok: configured,
    message: configured
      ? `R2 bucket is ${process.env.R2_BUCKET ?? process.env.S3_BUCKET}.`
      : "R2 bucket, endpoint/account, or credentials are missing.",
    action:
      "Set R2 bucket, endpoint or account ID, access key, secret, and public URL.",
    value: process.env.R2_BUCKET ?? process.env.S3_BUCKET ?? null,
  });
}

function groupChecks(checks: PreflightCheck[]) {
  const groups = new Map<string, PreflightCheck[]>();
  for (const item of checks) {
    groups.set(item.group, [...(groups.get(item.group) ?? []), item]);
  }
  return [...groups.entries()].map(([name, items]) => ({
    name,
    pass: items.filter((item) => item.status === "pass").length,
    warn: items.filter((item) => item.status === "warn").length,
    fail: items.filter((item) => item.status === "fail").length,
    checks: items,
  }));
}

function activeDeploymentMode(): DeploymentMode {
  return parseDeploymentMode(process.env.DEPLOYMENT_MODE ?? env.DEPLOYMENT_MODE);
}

function deploymentModeLabel(mode: DeploymentMode) {
  return mode === "managed" ? "managed" : "self-host";
}

function isPublicUrl(value: string) {
  try {
    const url = new URL(value);
    return Boolean(url.protocol && url.host);
  } catch {
    return false;
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
