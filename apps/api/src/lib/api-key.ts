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
  const match = path.match(/^\/([a-z-]+)\/v1/);
  return match?.[1] ?? "unknown";
}

export function getEndpointCost(path: string): number {
  return ENDPOINT_COSTS[getEndpointCategory(path)] ?? 1;
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

/**
 * Map endpoint categories to required scopes.
 */
const SCOPE_MAP: Record<string, ApiKeyScope> = {
  "tiles": "tiles:read",
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
