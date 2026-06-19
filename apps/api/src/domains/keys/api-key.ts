import { createHash, randomBytes } from "node:crypto";

/**
 * API key format:
 *   id      = "pk_" + 16 hex chars (public identifier, used as PK)
 *   secret  = 64 hex chars
 *   fullKey = "{id}_{secret}" — returned to user once on creation
 *
 * Storage: SHA-256(fullKey) → keyHash column
 * Validation: receive fullKey → SHA-256 → lookup by keyHash
 */

export function generateApiKey(): {
  id: string;
  fullKey: string;
  keyHash: string;
} {
  const id = `pk_${randomBytes(8).toString("hex")}`;
  const secret = randomBytes(32).toString("hex");
  const fullKey = `${id}_${secret}`;
  const keyHash = hashKey(fullKey);
  return { id, fullKey, keyHash };
}

export function hashKey(fullKey: string): string {
  return createHash("sha256").update(fullKey).digest("hex");
}

/**
 * Cost of each API endpoint category.
 * Used for usage tracking and quota enforcement.
 */
export const ENDPOINT_COSTS: Record<string, number> = {
  "tiles": 1,
  "tilequery": 10,
  "styles": 1,
  "fonts": 1,
  "geocoding": 5,
  "directions": 10,
  "isochrone": 10,
  "matching": 5,
  "matrix": 10,
  "optimized-trips": 15,
  "elevation": 5,
  "static": 20,
};

/**
 * Extract the endpoint category from a request path.
 * e.g. "/tiles/v1/source/0/0/0.pbf" → "tiles"
 */
export function getEndpointCategory(path: string): string {
  if (/^\/v4\/[^/]+\/tilequery\//.test(path)) return "tilequery";
  const match = path.match(/^\/([a-z-]+)\/v1/);
  return match?.[1] ?? "unknown";
}

export function getEndpointCost(path: string): number {
  const category = getEndpointCategory(path);
  const baseCost = ENDPOINT_COSTS[category] ?? 1;
  const coordinates = routeCoordinateCount(path);
  if (!coordinates) return baseCost;

  if (category === "directions") {
    return baseCost + Math.max(0, coordinates - 2);
  }
  if (category === "matching") {
    return baseCost + Math.max(0, Math.ceil(coordinates / 10) - 1);
  }
  if (category === "matrix") {
    return baseCost + Math.ceil(Math.max(0, coordinates * coordinates - 4) / 10);
  }
  if (category === "optimized-trips") {
    return baseCost + Math.max(0, coordinates - 3) * 2;
  }

  return baseCost;
}

/** All available API key scopes */
export const ALL_SCOPES = [
  "tiles:read",
  "styles:read",
  "styles:write",
  "geocoding",
  "directions",
  "elevation",
  "static",
  "sources:read",
  "sources:write",
  "usage:read",
] as const;

export type ApiKeyScope = (typeof ALL_SCOPES)[number];

export const USER_API_KEY_CONFIG_ID = "user-keys";
export const ORG_API_KEY_CONFIG_ID = "org-keys";

export type ApiKeyPermissions = {
  scopes?: string[];
};

export type ApiKeyMetadata = {
  allowedDomains?: string[];
};

export function scopesToPermissions(
  scopes: readonly ApiKeyScope[],
): ApiKeyPermissions {
  return { scopes: [...scopes] };
}

export function permissionsToScopes(value: unknown): string[] {
  const parsed = parseJsonValue(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return [];
  }

  const scopes = (parsed as ApiKeyPermissions).scopes;
  return Array.isArray(scopes)
    ? scopes.filter((scope): scope is string => typeof scope === "string")
    : [];
}

export function metadataAllowedDomains(value: unknown): string[] {
  const parsed = parseJsonValue(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return [];
  }

  const allowedDomains = (parsed as ApiKeyMetadata).allowedDomains;
  return Array.isArray(allowedDomains)
    ? allowedDomains.filter((domain): domain is string => typeof domain === "string")
    : [];
}

export function metadataWithAllowedDomains(
  allowedDomains: readonly string[],
): ApiKeyMetadata {
  return { allowedDomains: [...allowedDomains] };
}

/**
 * Map endpoint categories to required scopes.
 */
const SCOPE_MAP: Record<string, ApiKeyScope> = {
  "tiles": "tiles:read",
  "tilequery": "tiles:read",
  "styles": "styles:read",
  "fonts": "tiles:read",      // fonts are part of tile serving
  "geocoding": "geocoding",
  "directions": "directions",
  "isochrone": "directions",
  "matching": "directions",
  "matrix": "directions",
  "optimized-trips": "directions",
  "elevation": "elevation",
  "static": "static",
};

export function requiredScopeForPath(path: string): ApiKeyScope | null {
  const category = getEndpointCategory(path);
  return SCOPE_MAP[category] ?? null;
}

export function normalizeAllowedDomains(values: string[]): {
  domains: string[];
  errors: string[];
} {
  const domains = new Set<string>();
  const errors: string[] = [];

  for (const value of values) {
    const normalized = normalizeAllowedDomain(value);
    if (normalized) {
      domains.add(normalized);
    } else {
      errors.push(value);
    }
  }

  return { domains: [...domains], errors };
}

export function isRequestOriginAllowed(
  originOrReferer: string | undefined,
  allowedDomains: string[],
) {
  if (allowedDomains.length === 0) return true;
  const requestHost = hostFromOrigin(originOrReferer);
  if (!requestHost) return false;

  return allowedDomains.some((pattern) => {
    if (pattern.startsWith("*.")) {
      const suffix = pattern.slice(2);
      return requestHost === suffix || requestHost.endsWith(`.${suffix}`);
    }
    return requestHost === pattern;
  });
}

function normalizeAllowedDomain(value: string): string | null {
  const trimmed = value.trim().toLowerCase().replace(/\.$/, "");
  if (!trimmed) return null;

  const host = trimmed.startsWith("http://") || trimmed.startsWith("https://")
    ? hostFromUrl(trimmed)
    : trimmed;
  if (!host) return null;

  if (host.startsWith("*.")) {
    const suffix = host.slice(2);
    return isValidHostname(suffix) ? `*.${suffix}` : null;
  }

  return isValidHostname(host) ? host : null;
}

function hostFromOrigin(value: string | undefined) {
  if (!value) return null;
  return hostFromUrl(value.trim()) ?? normalizeAllowedDomain(value);
}

function hostFromUrl(value: string) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return null;
  }
}

function routeCoordinateCount(path: string): number | null {
  const match = path.match(
    /^\/(?:directions|matching|matrix|optimized-trips)\/v1\/[^/]+\/([^/?]+)/,
  );
  if (!match) return null;
  const coords = decodeURIComponent(match[1]!);
  return coords.split(";").filter(Boolean).length;
}

function isValidHostname(host: string) {
  if (host === "localhost") return true;
  if (host.length > 253 || host.includes("*")) return false;
  return host.split(".").every((label) => {
    return (
      label.length > 0 &&
      label.length <= 63 &&
      /^[a-z0-9-]+$/.test(label) &&
      !label.startsWith("-") &&
      !label.endsWith("-")
    );
  });
}

function parseJsonValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
