import assert from "node:assert/strict";
import test from "node:test";
import { apiCorsOrigins } from "./cors-origins";

test("apiCorsOrigins includes configured public ingress origins", () => {
  const origins = apiCorsOrigins({
    apiUrl: "https://api.staging.planisfy.example",
    consoleUrl: "https://console.staging.planisfy.example",
  });

  assert.ok(origins.includes("https://api.staging.planisfy.example"));
  assert.ok(origins.includes("https://console.staging.planisfy.example"));
});
