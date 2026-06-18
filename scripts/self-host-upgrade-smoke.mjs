#!/usr/bin/env node

const supervisorUrl = requiredEnv("SUPERVISOR_URL").replace(/\/$/, "");
const token = requiredEnv("SUPERVISOR_TOKEN");
const manifestPath = requiredEnv("PLANISFY_RELEASE_MANIFEST");
const flags = new Set(process.argv.slice(2));

const confirmBackup = flags.has("--confirm-backup") || flags.has("--confirm-apply");
const confirmApply = flags.has("--confirm-apply");
const confirmRollback = flags.has("--confirm-rollback");

await expectOk(`${supervisorUrl}/health`, "supervisor health");
const version = await expectJson(`${supervisorUrl}/version`, "supervisor version");
console.log(`supervisorVersion=${version.data?.version ?? "unknown"}`);

const preflight = await postOperation("/preflight", undefined, "supervisor preflight");
console.log(`preflight=${preflight.status}`);

let backup;
if (confirmBackup) {
  backup = await postOperation("/backup", undefined, "supervisor backup");
  console.log(`backup=${backup.status}`);
  console.log(`backupDir=${backup.backupDir ?? ""}`);
} else {
  console.log("backup=skipped; pass --confirm-backup to exercise backup");
}

let apply;
if (confirmApply) {
  if (!backup?.id) {
    throw new Error("Upgrade apply requires a successful backup operation");
  }
  apply = await postOperation(
    "/upgrade/apply",
    {
      manifestPath,
      backupOperationId: backup.id,
    },
    "supervisor upgrade apply",
  );
  console.log(`apply=${apply.status}`);
  console.log(`targetVersion=${apply.targetVersion ?? ""}`);
} else {
  console.log("apply=skipped; pass --confirm-apply to exercise upgrade apply");
}

if (confirmRollback) {
  const backupDir = backup?.backupDir ?? process.env.SUPERVISOR_ROLLBACK_BACKUP_DIR;
  if (!backupDir) {
    throw new Error(
      "Rollback smoke requires a backup from this run or SUPERVISOR_ROLLBACK_BACKUP_DIR",
    );
  }
  const rollback = await postOperation(
    "/upgrade/rollback",
    {
      manifestPath,
      backupDir,
    },
    "supervisor rollback",
  );
  console.log(`rollback=${rollback.status}`);
} else {
  console.log("rollback=skipped; pass --confirm-rollback to exercise rollback");
}

console.log("Self-host upgrade smoke passed");

async function postOperation(path, body, label) {
  const response = await expectJson(`${supervisorUrl}${path}`, label, {
    method: "POST",
    headers: authedHeaders(body),
    body: body ? JSON.stringify(body) : undefined,
  });
  const operation = response.data;
  if (operation?.status !== "SUCCEEDED") {
    throw new Error(`${label} did not succeed: ${JSON.stringify(operation)}`);
  }
  return operation;
}

async function expectOk(url, label, init = {}) {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`${label} failed: ${response.status} ${await response.text()}`);
  }
  return response;
}

async function expectJson(url, label, init = {}) {
  const response = await expectOk(url, label, {
    ...init,
    headers: {
      ...authedHeaders(),
      ...(init.headers ?? {}),
    },
  });
  return response.json();
}

function authedHeaders(body) {
  return {
    authorization: `Bearer ${token}`,
    ...(body ? { "content-type": "application/json" } : {}),
  };
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}
