#!/usr/bin/env node

const apiUrl = requiredEnv("MANAGED_STAGING_API_URL").replace(/\/$/, "");
const consoleUrl = requiredEnv("MANAGED_STAGING_CONSOLE_URL").replace(/\/$/, "");
const internalSecret = requiredEnv("INTERNAL_API_SECRET");

validateManagedIngressUrl(apiUrl, "MANAGED_STAGING_API_URL");
validateManagedIngressUrl(consoleUrl, "MANAGED_STAGING_CONSOLE_URL");

await expectOk(`${apiUrl}/health`, "health");
await expectOk(consoleUrl, "console ingress");
await expectCors(`${apiUrl}/health`, new URL(consoleUrl).origin);

const preflight = await expectJson(`${apiUrl}/setup/preflight`, "setup preflight", {
  headers: { "x-internal-secret": internalSecret },
});
const preflightData = preflight.data;
if (preflightData?.deploymentMode !== "managed") {
  throw new Error(
    `Expected managed deployment mode, got ${preflightData?.deploymentMode}`,
  );
}
if ((preflightData?.summary?.blocking ?? 1) > 0) {
  throw new Error(
    `Managed preflight has ${preflightData.summary.blocking} blocking issue(s)`,
  );
}

const smoke = await expectJson(`${apiUrl}/internal/managed-smoke`, "managed smoke", {
  headers: { "x-internal-secret": internalSecret },
});
const data = smoke.data;
if (data?.deploymentMode !== "managed") {
  throw new Error(`Managed smoke reported ${data?.deploymentMode} deployment mode`);
}
if (!data?.storage?.ok) {
  throw new Error("Managed storage write/read smoke failed");
}
if (!data?.billing?.ok) {
  throw new Error("Managed billing checkout availability smoke failed");
}
if (!data?.email?.ok) {
  throw new Error("Managed email adapter availability smoke failed");
}

console.log("Managed staging smoke passed");
console.log(`api=${apiUrl}`);
console.log(`console=${consoleUrl}`);
console.log(`storage=${data.storage.provider}/${data.storage.bucket}`);
console.log(
  `billingPlans=${data.billing.plans
    .filter((plan) => plan.id !== "free")
    .map((plan) => `${plan.id}:${plan.checkoutAvailable}`)
    .join(",")}`,
);
console.log(`emailFrom=${data.email.fromEmail}`);

async function expectOk(url, label, init) {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`${label} failed: ${response.status} ${await response.text()}`);
  }
  return response;
}

async function expectJson(url, label, init) {
  const response = await expectOk(url, label, init);
  return response.json();
}

async function expectCors(url, origin) {
  const response = await fetch(url, { headers: { origin } });
  if (!response.ok) {
    throw new Error(`CORS probe failed: ${response.status} ${await response.text()}`);
  }
  const allowOrigin = response.headers.get("access-control-allow-origin");
  if (allowOrigin !== origin) {
    throw new Error(
      `CORS probe expected access-control-allow-origin=${origin}, got ${allowOrigin}`,
    );
  }
}

function validateManagedIngressUrl(value, name) {
  const url = new URL(value);
  if (url.protocol !== "https:" && process.env.ALLOW_INSECURE_MANAGED_STAGING !== "true") {
    throw new Error(`${name} must use https for managed staging`);
  }
  const allowLocal = process.env.ALLOW_LOCAL_MANAGED_SMOKE === "true";
  if (
    !allowLocal &&
    (["localhost", "127.0.0.1", "0.0.0.0"].includes(url.hostname) ||
      url.hostname.endsWith(".localhost"))
  ) {
    throw new Error(`${name} must be a public staging ingress URL, not ${url.hostname}`);
  }
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}
