import { createMiddleware } from "hono/factory";
import type { AuthEnv } from "../middleware/auth";

const durationBucketsSeconds = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
];

type RequestKey = `${string}\u0000${string}\u0000${number}`;

interface RequestMetric {
  method: string;
  route: string;
  status: number;
  count: number;
  durationSumSeconds: number;
  buckets: number[];
}

const requests = new Map<RequestKey, RequestMetric>();
const startedAt = Date.now();

export function metricsMiddleware() {
  return createMiddleware<AuthEnv>(async (c, next) => {
    const start = performance.now();
    await next();

    recordRequest({
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationSeconds: (performance.now() - start) / 1000,
    });
  });
}

export function recordRequest(params: {
  method: string;
  path: string;
  status: number;
  durationSeconds: number;
}) {
  const route = normalizeRoute(params.path);
  const key: RequestKey = `${params.method}\u0000${route}\u0000${params.status}`;
  let metric = requests.get(key);

  if (!metric) {
    metric = {
      method: params.method,
      route,
      status: params.status,
      count: 0,
      durationSumSeconds: 0,
      buckets: durationBucketsSeconds.map(() => 0),
    };
    requests.set(key, metric);
  }

  metric.count += 1;
  metric.durationSumSeconds += Math.max(0, params.durationSeconds);
  for (let index = 0; index < durationBucketsSeconds.length; index += 1) {
    const bucket = durationBucketsSeconds[index]!;
    if (params.durationSeconds <= bucket) {
      metric.buckets[index] = (metric.buckets[index] ?? 0) + 1;
    }
  }
}

export function renderPrometheusMetrics(params: {
  service: string;
  version: string;
}) {
  const lines = [
    "# HELP planisfy_api_info Planisfy API build information.",
    "# TYPE planisfy_api_info gauge",
    `planisfy_api_info{service="${escapeLabel(params.service)}",version="${escapeLabel(params.version)}"} 1`,
    "# HELP planisfy_api_uptime_seconds Process uptime in seconds.",
    "# TYPE planisfy_api_uptime_seconds gauge",
    `planisfy_api_uptime_seconds ${((Date.now() - startedAt) / 1000).toFixed(3)}`,
    "# HELP planisfy_http_requests_total HTTP requests handled by the API.",
    "# TYPE planisfy_http_requests_total counter",
  ];

  for (const metric of requests.values()) {
    const labels = requestLabels(metric);
    lines.push(`planisfy_http_requests_total{${labels}} ${metric.count}`);
  }

  lines.push(
    "# HELP planisfy_http_request_duration_seconds HTTP request duration in seconds.",
    "# TYPE planisfy_http_request_duration_seconds histogram",
  );

  for (const metric of requests.values()) {
    const labels = requestLabels(metric);
    metric.buckets.forEach((count, index) => {
      lines.push(
        `planisfy_http_request_duration_seconds_bucket{${labels},le="${durationBucketsSeconds[index]}"} ${count}`,
      );
    });
    lines.push(
      `planisfy_http_request_duration_seconds_bucket{${labels},le="+Inf"} ${metric.count}`,
      `planisfy_http_request_duration_seconds_sum{${labels}} ${metric.durationSumSeconds.toFixed(6)}`,
      `planisfy_http_request_duration_seconds_count{${labels}} ${metric.count}`,
    );
  }

  return `${lines.join("\n")}\n`;
}

export function normalizeRoute(path: string): string {
  const pathname = path.split("?")[0] || "/";
  return pathname
    .replace(
      /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=\/|$)/gi,
      "/:uuid",
    )
    .replace(/\/pk_[a-f0-9]{16}(?=\/|$)/gi, "/:apiKey")
    .replace(/\/\d+(?=\/|$)/g, "/:number")
    .replace(/\/[^/]+\.(pbf|pmtiles|json|png|jpg|jpeg|webp)(?=\/|$)/gi, "/:file");
}

function requestLabels(metric: RequestMetric): string {
  return [
    `method="${escapeLabel(metric.method)}"`,
    `route="${escapeLabel(metric.route)}"`,
    `status="${metric.status}"`,
  ].join(",");
}

function escapeLabel(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
