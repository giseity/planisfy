export type ValhallaReadinessStatus = "ok" | "degraded" | "unavailable";

export interface ValhallaReadiness {
  status: ValhallaReadinessStatus;
  latency: number;
  message: string;
  statusCode?: number;
}

export interface ValhallaProbeOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  routeProbe?: {
    locations: Array<{ lon: number; lat: number }>;
    costing?: string;
  };
}

const DEFAULT_ROUTE_PROBE = {
  locations: [
    { lon: 9.1829, lat: 48.7758 },
    { lon: 9.1901, lat: 48.7784 },
  ],
  costing: "auto",
};

export async function probeValhallaReadiness(
  baseUrl: string,
  options: ValhallaProbeOptions = {},
): Promise<ValhallaReadiness> {
  const startedAt = Date.now();
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 3_000;
  const routeProbe = options.routeProbe ?? routeProbeFromEnv();
  const normalizedBase = baseUrl.replace(/\/$/, "");

  try {
    const status = await fetchWithTimeout(
      fetchImpl,
      `${normalizedBase}/status`,
      { method: "GET" },
      timeoutMs,
    );
    if (!status.ok) {
      return {
        status: "degraded",
        latency: Date.now() - startedAt,
        statusCode: status.status,
        message: `Valhalla status endpoint returned HTTP ${status.status}`,
      };
    }

    const route = await fetchWithTimeout(
      fetchImpl,
      `${normalizedBase}/route`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locations: routeProbe.locations,
          costing: routeProbe.costing ?? "auto",
          units: "kilometers",
        }),
      },
      timeoutMs,
    );
    if (route.ok) {
      return {
        status: "ok",
        latency: Date.now() - startedAt,
        statusCode: route.status,
        message: "Valhalla can route the readiness probe.",
      };
    }

    return {
      status: "degraded",
      latency: Date.now() - startedAt,
      statusCode: route.status,
      message: await valhallaFailureMessage(route),
    };
  } catch (error) {
    return {
      status: "unavailable",
      latency: Date.now() - startedAt,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function valhallaFailureMessage(response: Response) {
  const fallback = `Valhalla route probe returned HTTP ${response.status}`;
  try {
    const body = (await response.json()) as unknown;
    if (typeof body === "object" && body !== null) {
      const error = (body as Record<string, unknown>).error;
      if (typeof error === "string" && error.trim()) {
        return `${fallback}: ${error}`;
      }
      if (typeof error === "object" && error !== null) {
        const message = (error as Record<string, unknown>).message;
        if (typeof message === "string" && message.trim()) {
          return `${fallback}: ${message}`;
        }
      }
    }
  } catch {
    // The status code is already enough for health reporting.
  }
  return fallback;
}

function routeProbeFromEnv() {
  const configured = process.env.VALHALLA_READINESS_ROUTE?.trim();
  if (!configured) return DEFAULT_ROUTE_PROBE;

  const locations = configured.split(";").map((pair) => {
    const [lon, lat] = pair.split(",").map(Number);
    return { lon: lon!, lat: lat! };
  });
  const valid =
    locations.length >= 2 &&
    locations.every(
      (point) =>
        Number.isFinite(point.lon) &&
        point.lon >= -180 &&
        point.lon <= 180 &&
        Number.isFinite(point.lat) &&
        point.lat >= -90 &&
        point.lat <= 90,
    );

  return valid ? { ...DEFAULT_ROUTE_PROBE, locations } : DEFAULT_ROUTE_PROBE;
}
