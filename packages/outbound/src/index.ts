import type { LookupAddress } from "node:dns";
import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpRequest, type IncomingMessage, type RequestOptions } from "node:http";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP, type LookupFunction } from "node:net";

const blockedAddresses = new BlockList();

for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blockedAddresses.addSubnet(network, prefix, "ipv4");
}

for (const [network, prefix] of [
  ["::", 96],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 32],
  ["2001:2::", 48],
  ["2001:10::", 28],
  ["2001:20::", 28],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["3fff::", 20],
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8],
] as const) {
  blockedAddresses.addSubnet(network, prefix, "ipv6");
}

export class OutboundRequestError extends Error {
  constructor(
    readonly code:
      | "INVALID_URL"
      | "HOST_NOT_ALLOWED"
      | "PRIVATE_ADDRESS"
      | "DNS_FAILED"
      | "TOO_MANY_REDIRECTS"
      | "TIMEOUT"
      | "RESPONSE_TOO_LARGE",
    message: string,
  ) {
    super(message);
    this.name = "OutboundRequestError";
  }
}

export type OutboundLookup = (
  hostname: string,
) => Promise<readonly LookupAddress[]>;

export interface OutboundPolicy {
  allowedHosts?: readonly string[];
  privateAllowlist?: string | readonly string[];
  lookup?: OutboundLookup;
}

export interface OutboundRequestOptions extends OutboundPolicy {
  method?: string;
  headers?: Record<string, string>;
  body?: string | Uint8Array;
  maxRedirects?: number;
  timeoutMs?: number;
  bodyIdleTimeoutMs?: number;
}

export interface ResolvedOutboundTarget {
  url: URL;
  addresses: readonly LookupAddress[];
}

export async function resolveOutboundTarget(
  value: string | URL,
  policy: OutboundPolicy = {},
): Promise<ResolvedOutboundTarget> {
  const url = normalizeOutboundUrl(value);
  const hostname = normalizedHostname(url);

  if (
    policy.allowedHosts &&
    !policy.allowedHosts.some((allowed) => normalizeHost(allowed) === hostname)
  ) {
    throw new OutboundRequestError(
      "HOST_NOT_ALLOWED",
      "Outbound URL host is not allowed",
    );
  }

  let addresses: readonly LookupAddress[];
  if (isIP(hostname)) {
    addresses = [{ address: hostname, family: isIP(hostname) }];
  } else {
    try {
      addresses = await (policy.lookup ?? defaultLookup)(hostname);
    } catch {
      throw new OutboundRequestError(
        "DNS_FAILED",
        "Outbound URL hostname could not be resolved",
      );
    }
  }
  if (addresses.length === 0) {
    throw new OutboundRequestError(
      "DNS_FAILED",
      "Outbound URL hostname did not resolve",
    );
  }

  const allowlist = parsePrivateAllowlist(policy.privateAllowlist);
  for (const answer of addresses) {
    if (
      isBlockedAddress(answer.address) &&
      !allowlist.hosts.has(hostname) &&
      !allowlist.addresses.check(
        normalizeMappedIpv4(answer.address),
        addressFamily(normalizeMappedIpv4(answer.address)),
      )
    ) {
      throw new OutboundRequestError(
        "PRIVATE_ADDRESS",
        "Outbound URL resolves to a private or reserved address",
      );
    }
  }

  return { url, addresses };
}

export async function withOutboundResponse<T>(
  value: string | URL,
  options: OutboundRequestOptions,
  consume: (response: IncomingMessage, finalUrl: URL) => Promise<T>,
): Promise<T> {
  return requestWithRedirects(value, options, consume, 0);
}

export async function readResponseBody(
  response: IncomingMessage,
  maxBytes: number,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of response) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.byteLength;
    if (total > maxBytes) {
      response.destroy();
      throw new OutboundRequestError(
        "RESPONSE_TOO_LARGE",
        `Outbound response exceeds ${maxBytes} bytes`,
      );
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks, total);
}

export function normalizeOutboundUrl(value: string | URL) {
  let url: URL;
  try {
    url = value instanceof URL ? new URL(value) : new URL(value);
  } catch {
    throw new OutboundRequestError("INVALID_URL", "Outbound URL is invalid");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new OutboundRequestError(
      "INVALID_URL",
      "Outbound URL must use http or https",
    );
  }
  if (url.username || url.password) {
    throw new OutboundRequestError(
      "INVALID_URL",
      "Outbound URL must not include credentials",
    );
  }
  return url;
}

export function parsePrivateAllowlist(
  value: string | readonly string[] | undefined,
) {
  const entries = (typeof value === "string" ? value.split(",") : value ?? [])
    .map((entry) => entry.trim())
    .filter(Boolean);
  const hosts = new Set<string>();
  const addresses = new BlockList();

  for (const entry of entries) {
    const [address, rawPrefix] = entry.split("/");
    const version = address ? isIP(normalizeMappedIpv4(address)) : 0;
    if (version) {
      const normalized = normalizeMappedIpv4(address!);
      const family = addressFamily(normalized);
      if (rawPrefix === undefined) {
        addresses.addAddress(normalized, family);
      } else {
        const prefix = Number(rawPrefix);
        const maximum = family === "ipv4" ? 32 : 128;
        if (!Number.isInteger(prefix) || prefix < 0 || prefix > maximum) {
          throw new OutboundRequestError(
            "INVALID_URL",
            `Invalid private allowlist CIDR: ${entry}`,
          );
        }
        addresses.addSubnet(normalized, prefix, family);
      }
      continue;
    }
    if (rawPrefix !== undefined || !isValidHostname(entry)) {
      throw new OutboundRequestError(
        "INVALID_URL",
        `Invalid private allowlist entry: ${entry}`,
      );
    }
    hosts.add(normalizeHost(entry));
  }
  return { hosts, addresses };
}

async function requestWithRedirects<T>(
  value: string | URL,
  options: OutboundRequestOptions,
  consume: (response: IncomingMessage, finalUrl: URL) => Promise<T>,
  redirectCount: number,
): Promise<T> {
  const target = await resolveOutboundTarget(value, options);
  const response = await makePinnedRequest(target, options);
  const location = response.headers.location;
  if (location && isRedirect(response.statusCode)) {
    response.resume();
    if (redirectCount >= (options.maxRedirects ?? 0)) {
      throw new OutboundRequestError(
        "TOO_MANY_REDIRECTS",
        "Outbound request exceeded its redirect limit",
      );
    }
    const redirectUrl = new URL(location, target.url);
    const sameOrigin = redirectUrl.origin === target.url.origin;
    return requestWithRedirects(
      redirectUrl,
      {
        ...options,
        method: response.statusCode === 303 ? "GET" : options.method,
        body: response.statusCode === 303 ? undefined : options.body,
        headers: sameOrigin
          ? options.headers
          : stripSensitiveHeaders(options.headers),
      },
      consume,
      redirectCount + 1,
    );
  }

  return consume(response, target.url);
}

function makePinnedRequest(
  target: ResolvedOutboundTarget,
  options: OutboundRequestOptions,
) {
  return new Promise<IncomingMessage>((resolve, reject) => {
    const request = target.url.protocol === "https:" ? httpsRequest : httpRequest;
    const requestOptions: RequestOptions = {
      method: options.method ?? "GET",
      headers: options.headers,
      agent: false,
      lookup: ((_hostname, lookupOptions, callback) => {
        const requestedFamily =
          typeof lookupOptions === "object" ? lookupOptions.family : 0;
        const matches = requestedFamily
          ? target.addresses.filter(
              (answer) => answer.family === requestedFamily,
            )
          : target.addresses;
        if (lookupOptions.all) {
          callback(null, [...matches]);
          return;
        }
        const selected = matches[0] ?? target.addresses[0]!;
        callback(null, selected.address, selected.family);
      }) satisfies LookupFunction,
    };
    const req = request(target.url, requestOptions, (response) => {
      clearTimeout(headerTimer);
      if (options.bodyIdleTimeoutMs) {
        response.setTimeout(options.bodyIdleTimeoutMs, () => {
          response.destroy(
            new OutboundRequestError(
              "TIMEOUT",
              "Outbound response body timed out",
            ),
          );
        });
      }
      resolve(response);
    });
    const headerTimer = setTimeout(() => {
      req.destroy(
        new OutboundRequestError(
          "TIMEOUT",
          "Outbound request timed out before receiving headers",
        ),
      );
    }, options.timeoutMs ?? 10_000);
    req.once("error", (error) => {
      clearTimeout(headerTimer);
      reject(error);
    });
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function defaultLookup(hostname: string) {
  return dnsLookup(hostname, { all: true, verbatim: true });
}

function isBlockedAddress(address: string) {
  const normalized = normalizeMappedIpv4(address);
  return blockedAddresses.check(normalized, addressFamily(normalized));
}

function normalizeMappedIpv4(address: string) {
  const match = address.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return match?.[1] ?? address;
}

function addressFamily(address: string): "ipv4" | "ipv6" {
  return isIP(address) === 4 ? "ipv4" : "ipv6";
}

function normalizedHostname(url: URL) {
  return normalizeHost(url.hostname);
}

function normalizeHost(host: string) {
  return host.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
}

function isValidHostname(value: string) {
  const host = normalizeHost(value);
  return (
    host.length > 0 &&
    host.length <= 253 &&
    host.split(".").every(
      (label) =>
        label.length > 0 &&
        label.length <= 63 &&
        /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label),
    )
  );
}

function isRedirect(status: number | undefined) {
  return status === 301 || status === 302 || status === 303 ||
    status === 307 || status === 308;
}

function stripSensitiveHeaders(headers: Record<string, string> | undefined) {
  if (!headers) return undefined;
  return Object.fromEntries(
    Object.entries(headers).filter(
      ([name]) =>
        !["authorization", "cookie", "proxy-authorization", "x-api-key"].includes(
          name.toLowerCase(),
        ),
    ),
  );
}
