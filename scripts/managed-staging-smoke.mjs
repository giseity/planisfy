#!/usr/bin/env node

const apiUrl = requiredEnv("MANAGED_STAGING_API_URL").replace(/\/$/, "");
const internalSecret = requiredEnv("INTERNAL_API_SECRET");

await expectOk(`${apiUrl}/health`, "health");

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

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}
