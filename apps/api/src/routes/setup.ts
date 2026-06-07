import { Hono } from "hono";
import { access } from "node:fs/promises";
import { join } from "node:path";
import type { AuthEnv } from "../middleware/auth";
import { env } from "../env";

export const setupRoute = new Hono<AuthEnv>();

type PreflightStatus = "pass" | "warn" | "fail";
type PreflightSeverity = "required" | "recommended" | "optional";

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

setupRoute.get("/setup/preflight", async (c) => {
  const checks = await buildPreflightChecks();
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
      summary,
      groups: groupChecks(checks),
      checks,
    },
  });
});

async function buildPreflightChecks(): Promise<PreflightCheck[]> {
  const storage = await storageCheck();

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
      ok: isPublicUrl(env.INTERNAL_API_URL),
      message: `API root is ${env.INTERNAL_API_URL}.`,
      action: "Use the externally reachable API URL for managed deployments.",
      value: env.INTERNAL_API_URL,
    }),
    check({
      id: "console-url",
      group: "Routing",
      label: "Console URL",
      severity: "required",
      ok: isPublicUrl(env.CONSOLE_URL),
      message: `Console root is ${env.CONSOLE_URL}.`,
      action:
        "Set CONSOLE_URL to the user-facing Console origin for auth and billing redirects.",
      value: env.CONSOLE_URL,
    }),
    storage,
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
    check({
      id: "valhalla",
      group: "Geospatial engines",
      label: "Valhalla routing",
      severity: "recommended",
      ok: Boolean(env.VALHALLA_URL),
      warnWhenMissing: true,
      message: `Valhalla URL is ${env.VALHALLA_URL}.`,
      action: "Configure VALHALLA_URL when routing APIs should be available.",
      value: env.VALHALLA_URL,
    }),
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
      ok: Boolean(process.env.OVERTURE_RELEASE),
      warnWhenMissing: true,
      message: process.env.OVERTURE_RELEASE
        ? `Overture release is ${process.env.OVERTURE_RELEASE}.`
        : "Overture imports will fail until a release is configured.",
      action: "Set OVERTURE_RELEASE for DuckDB-backed Overture imports.",
      value: process.env.OVERTURE_RELEASE ?? null,
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
      severity: "optional",
      ok: Boolean(env.RESEND_API_KEY),
      warnWhenMissing: true,
      message: env.RESEND_API_KEY
        ? "Resend email delivery is configured."
        : "Email delivery is disabled.",
      action: "Set RESEND_API_KEY for production email delivery.",
    }),
    check({
      id: "billing",
      group: "Billing",
      label: "Billing checkout",
      severity: "optional",
      ok: Boolean(
        env.DODO_PAYMENTS_API_KEY &&
          env.DODO_PAYMENTS_WEBHOOK_SECRET &&
          env.DODO_PRO_PRODUCT_ID,
      ),
      warnWhenMissing: true,
      message:
        env.DODO_PAYMENTS_API_KEY && env.DODO_PRO_PRODUCT_ID
          ? "Dodo Payments checkout is partially or fully configured."
          : "Billing checkout is disabled.",
      action:
        "Set Dodo API, webhook secret, and product IDs to enable managed billing.",
    }),
  ];
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

async function storageCheck(): Promise<PreflightCheck> {
  const provider = process.env.STORAGE_PROVIDER ?? "local";
  if (provider === "local") {
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

function isPublicUrl(value: string) {
  try {
    const url = new URL(value);
    return Boolean(url.protocol && url.host);
  } catch {
    return false;
  }
}
