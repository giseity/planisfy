import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeRoute,
  recordRequest,
  renderPrometheusMetrics,
} from "./metrics";

test("normalizeRoute removes high-cardinality path segments", () => {
  assert.equal(
    normalizeRoute("/console/styles/018f32a5-39a3-7bce-9c22-2d5a70ec155b"),
    "/console/styles/:uuid",
  );
  assert.equal(
    normalizeRoute("/tiles/v1/main/12/2048/1365.pbf"),
    "/tiles/v1/main/:number/:number/:file",
  );
  assert.equal(normalizeRoute(`/${"a".repeat(200)}`), "/:other");
  assert.equal(
    normalizeRoute(
      `/${Array.from({ length: 13 }, (_, index) => `segment-${index}`).join("/")}`,
    ),
    "/:other",
  );
});

test("renderPrometheusMetrics includes request counters and histograms", () => {
  recordRequest({
    method: "GET",
    path: "/health",
    status: 200,
    durationSeconds: 0.02,
  });

  const metrics = renderPrometheusMetrics({
    service: "api",
    version: "test",
  });

  assert.match(metrics, /planisfy_api_info\{service="api",version="test"\} 1/);
  assert.match(metrics, /planisfy_http_requests_total\{method="GET",route="\/health",status="200"\} 1/);
  assert.match(metrics, /planisfy_http_request_duration_seconds_bucket/);
});

test("renderPrometheusMetrics collapses unbounded route labels", () => {
  const path = `/${"unbounded".repeat(32)}`;
  recordRequest({
    method: "GET",
    path,
    status: 404,
    durationSeconds: 0.01,
  });

  const metrics = renderPrometheusMetrics({
    service: "api",
    version: "test",
  });

  assert.match(
    metrics,
    /planisfy_http_requests_total\{method="GET",route="\/:other",status="404"\} 1/,
  );
  assert.doesNotMatch(metrics, new RegExp(path.slice(1, 80)));
});
