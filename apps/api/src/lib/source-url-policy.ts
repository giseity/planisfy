import { isIP } from "node:net";

export class SourceUrlRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourceUrlRejectedError";
  }
}

export function validateRemoteSourceUrl(
  value: string,
  options: { allowPrivateUrls?: boolean } = {},
) {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new SourceUrlRejectedError("Source URL must use http or https");
  }
  if (url.username || url.password) {
    throw new SourceUrlRejectedError("Source URL must not include credentials");
  }

  if (!options.allowPrivateUrls) {
    assertPublicHostname(url.hostname);
  }

  return url.href;
}

function assertPublicHostname(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host === "metadata.google.internal"
  ) {
    throw new SourceUrlRejectedError("Source URL host is private or local");
  }

  const ipVersion = isIP(host);
  if (ipVersion === 4 && isPrivateIpv4(host)) {
    throw new SourceUrlRejectedError("Source URL host is private or reserved");
  }
  if (ipVersion === 6 && isPrivateIpv6(host)) {
    throw new SourceUrlRejectedError("Source URL host is private or reserved");
  }
}

function isPrivateIpv4(host: string) {
  const parts = host.split(".").map(Number);
  const [a, b] = parts;
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return true;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b !== undefined && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b !== undefined && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 198 && b !== undefined && (b === 18 || b === 19)) return true;
  if (a !== undefined && a >= 224) return true;
  return false;
}

function isPrivateIpv6(host: string) {
  const normalized = host.toLowerCase();
  const mappedIpv4 = ipv4MappedIpv6ToIpv4(normalized);
  if (mappedIpv4 && isPrivateIpv4(mappedIpv4)) return true;

  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:") ||
    normalized.startsWith("2001:db8:")
  );
}

function ipv4MappedIpv6ToIpv4(host: string): string | null {
  if (!host.startsWith("::ffff:")) return null;

  const suffix = host.slice("::ffff:".length);
  if (suffix.includes(".")) return suffix;

  const parts = suffix.split(":").map((part) => Number.parseInt(part, 16));
  if (
    parts.length !== 2 ||
    parts.some((part) => Number.isNaN(part) || part < 0 || part > 0xffff)
  ) {
    return null;
  }

  const [high, low] = parts as [number, number];
  return [
    (high >> 8) & 0xff,
    high & 0xff,
    (low >> 8) & 0xff,
    low & 0xff,
  ].join(".");
}
