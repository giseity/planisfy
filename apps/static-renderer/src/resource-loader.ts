import type { IncomingMessage } from "node:http";
import {
  OutboundRequestError,
  withOutboundResponse,
} from "@planisfy/outbound";

const API_ASSET_PATH_PREFIXES = [
  "/styles/v1/",
  "/tiles/",
  "/v4/",
  "/fonts/",
] as const;

const SAFE_REQUEST_HEADERS = new Set([
  "accept",
  "accept-encoding",
  "accept-language",
  "if-modified-since",
  "if-none-match",
  "range",
  "user-agent",
]);

const SAFE_RESPONSE_HEADERS = new Set([
  "accept-ranges",
  "cache-control",
  "content-encoding",
  "content-language",
  "content-type",
  "etag",
  "expires",
  "last-modified",
]);

export type RendererLimits = {
  maxRequests: number;
  maxResourceBytes: number;
  maxTotalBytes: number;
  requestTimeoutMs: number;
};

export type RendererResource = {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
};

export class RendererResourceBudget {
  private requestCount = 0;
  private totalBytes = 0;

  constructor(readonly limits: RendererLimits) {}

  beginRequest() {
    this.requestCount += 1;
    if (this.requestCount > this.limits.maxRequests) {
      throw new RendererPolicyError(
        `Static render exceeded ${this.limits.maxRequests} network requests`,
      );
    }
  }

  consume(resourceBytes: number, chunkBytes: number) {
    const nextResourceBytes = resourceBytes + chunkBytes;
    if (nextResourceBytes > this.limits.maxResourceBytes) {
      throw new RendererPolicyError(
        `Static render resource exceeded ${this.limits.maxResourceBytes} bytes`,
      );
    }

    this.totalBytes += chunkBytes;
    if (this.totalBytes > this.limits.maxTotalBytes) {
      throw new RendererPolicyError(
        `Static render exceeded ${this.limits.maxTotalBytes} response bytes`,
      );
    }
    return nextResourceBytes;
  }
}

export class RendererPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RendererPolicyError";
  }
}

export async function fetchRendererStyle(params: {
  url: URL;
  headers: Record<string, string>;
  budget: RendererResourceBudget;
}) {
  assertAllowedApiAssetUrl(params.url, params.url.origin);
  params.budget.beginRequest();

  const response = await fetch(params.url, {
    headers: sanitizeRequestHeaders(params.headers, params.headers),
    redirect: "manual",
    signal: AbortSignal.timeout(params.budget.limits.requestTimeoutMs),
  });
  if (response.status >= 300 && response.status < 400) {
    throw new RendererPolicyError("Style fetch redirects are not allowed");
  }
  if (!response.ok) {
    throw new RendererPolicyError(
      `Style fetch failed with ${response.status}`,
    );
  }

  const body = await readWebResponse(response, params.budget);
  try {
    return JSON.parse(body.toString("utf8")) as unknown;
  } catch {
    throw new RendererPolicyError("Style response is not valid JSON");
  }
}

export async function loadRendererResource(params: {
  requestUrl: string;
  requestHeaders: Record<string, string>;
  forwardedHeaders: Record<string, string>;
  apiBaseUrl: string;
  budget: RendererResourceBudget;
}): Promise<RendererResource> {
  const url = parseNetworkUrl(params.requestUrl);
  const apiOrigin = new URL(params.apiBaseUrl).origin;
  params.budget.beginRequest();

  if (url.origin === apiOrigin) {
    assertAllowedApiAssetUrl(url, apiOrigin);
    return loadApiResource({
      url,
      requestHeaders: params.requestHeaders,
      forwardedHeaders: params.forwardedHeaders,
      budget: params.budget,
    });
  }

  return withOutboundResponse(
    url,
    {
      headers: sanitizeRequestHeaders(params.requestHeaders),
      maxRedirects: 5,
      timeoutMs: params.budget.limits.requestTimeoutMs,
      bodyIdleTimeoutMs: params.budget.limits.requestTimeoutMs,
    },
    async (response) => {
      const body = await readNodeResponse(response, params.budget);
      return {
        status: response.statusCode ?? 502,
        headers: sanitizeResponseHeaders(response.headers),
        body,
      };
    },
  );
}

export function isAllowedApiAssetUrl(value: string | URL, apiOrigin: string) {
  const url = value instanceof URL ? value : parseNetworkUrl(value);
  return (
    url.origin === apiOrigin &&
    API_ASSET_PATH_PREFIXES.some((prefix) =>
      url.pathname.startsWith(prefix),
    )
  );
}

export function headersForRouteRequest(
  requestUrl: string,
  requestHeaders: Record<string, string>,
  forwardedHeaders: Record<string, string>,
  apiOrigin: string,
) {
  return sanitizeRequestHeaders(
    requestHeaders,
    new URL(requestUrl).origin === apiOrigin ? forwardedHeaders : undefined,
  );
}

async function loadApiResource(params: {
  url: URL;
  requestHeaders: Record<string, string>;
  forwardedHeaders: Record<string, string>;
  budget: RendererResourceBudget;
}): Promise<RendererResource> {
  const response = await fetch(params.url, {
    headers: sanitizeRequestHeaders(
      params.requestHeaders,
      params.forwardedHeaders,
    ),
    redirect: "manual",
    signal: AbortSignal.timeout(params.budget.limits.requestTimeoutMs),
  });
  const body = await readWebResponse(response, params.budget);
  return {
    status: response.status,
    headers: sanitizeResponseHeaders(response.headers),
    body,
  };
}

async function readNodeResponse(
  response: IncomingMessage,
  budget: RendererResourceBudget,
) {
  assertDeclaredLength(response.headers["content-length"], budget);
  const chunks: Buffer[] = [];
  let resourceBytes = 0;

  try {
    for await (const chunk of response) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      resourceBytes = budget.consume(resourceBytes, buffer.byteLength);
      chunks.push(buffer);
    }
  } catch (error) {
    response.destroy();
    throw normalizeReadError(error);
  }
  return Buffer.concat(chunks, resourceBytes);
}

async function readWebResponse(
  response: Response,
  budget: RendererResourceBudget,
) {
  assertDeclaredLength(response.headers.get("content-length"), budget);
  if (!response.body) return Buffer.alloc(0);

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let resourceBytes = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      const buffer = Buffer.from(result.value);
      resourceBytes = budget.consume(resourceBytes, buffer.byteLength);
      chunks.push(buffer);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw normalizeReadError(error);
  }
  return Buffer.concat(chunks, resourceBytes);
}

function assertDeclaredLength(
  rawLength: string | string[] | null | undefined,
  budget: RendererResourceBudget,
) {
  const value = Array.isArray(rawLength) ? rawLength[0] : rawLength;
  if (!value) return;
  const length = Number(value);
  if (
    Number.isFinite(length) &&
    length > budget.limits.maxResourceBytes
  ) {
    throw new RendererPolicyError(
      `Static render resource declared more than ${budget.limits.maxResourceBytes} bytes`,
    );
  }
}

function assertAllowedApiAssetUrl(url: URL, apiOrigin: string) {
  if (!isAllowedApiAssetUrl(url, apiOrigin)) {
    throw new RendererPolicyError(
      "Static render request targeted a non-published API path",
    );
  }
}

function parseNetworkUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new RendererPolicyError("Static render request URL is invalid");
  }
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username ||
    url.password
  ) {
    throw new RendererPolicyError(
      "Static render requests must use credential-free HTTP(S) URLs",
    );
  }
  return url;
}

function sanitizeRequestHeaders(
  headers: Record<string, string>,
  additionalHeaders?: Record<string, string>,
) {
  const sanitized: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (SAFE_REQUEST_HEADERS.has(name.toLowerCase())) {
      sanitized[name.toLowerCase()] = value;
    }
  }
  for (const [name, value] of Object.entries(additionalHeaders ?? {})) {
    if (["authorization", "cookie", "x-api-key"].includes(name.toLowerCase())) {
      sanitized[name.toLowerCase()] = value;
    }
  }
  return sanitized;
}

function sanitizeResponseHeaders(
  headers: Headers | IncomingMessage["headers"],
) {
  const sanitized: Record<string, string> = {};
  if (headers instanceof Headers) {
    for (const [name, value] of headers.entries()) {
      if (SAFE_RESPONSE_HEADERS.has(name.toLowerCase())) {
        sanitized[name.toLowerCase()] = value;
      }
    }
    return sanitized;
  }

  for (const [name, value] of Object.entries(headers)) {
    if (!SAFE_RESPONSE_HEADERS.has(name.toLowerCase()) || value === undefined) {
      continue;
    }
    sanitized[name.toLowerCase()] = Array.isArray(value)
      ? value.join(", ")
      : value;
  }
  return sanitized;
}

function normalizeReadError(error: unknown) {
  if (
    error instanceof RendererPolicyError ||
    error instanceof OutboundRequestError
  ) {
    return error;
  }
  return new RendererPolicyError("Static render resource download failed");
}
