import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Hono, type Context } from "hono";
import { z } from "zod";
import {
  canRollbackRelease,
  manifestServiceCoverage,
  parseUpgradeReleaseManifest,
  type UpgradeReleaseManifest,
} from "@planisfy/upgrade-manifest";

const execFileAsync = promisify(execFile);
const activeOperationLocks = new Set<string>();

export type SupervisorConfig = {
  token: string;
  rootDir: string;
  stateDir: string;
  appVersion: string;
  composeFile: string;
  envFile: string;
  composeProfiles?: string[];
  execute?: CommandExecutor;
};

export type CommandExecutor = (
  command: string,
  args: string[],
  options: { cwd: string },
) => Promise<{ stdout: string; stderr: string }>;

type OperationStatus = "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED";

type OperationRecord = {
  id: string;
  type: "preflight" | "backup" | "upgrade.apply" | "upgrade.rollback";
  status: OperationStatus;
  startedAt: string;
  completedAt?: string;
  logs: string[];
  error?: string;
  backupDir?: string;
  targetVersion?: string;
};

type ManifestLoadResult =
  | { ok: true; manifest: UpgradeReleaseManifest }
  | { ok: false; message: string; details?: unknown };

const applySchema = z.object({
  manifestPath: z.string().min(1),
  backupOperationId: z.string().min(1),
});

const rollbackSchema = z.object({
  manifestPath: z.string().min(1),
  backupDir: z.string().min(1),
});

export function createSupervisorApp(config: SupervisorConfig) {
  const app = new Hono();
  const execute = config.execute ?? defaultExecute;

  app.get("/health", (c) =>
    c.json({
      status: "ok",
      version: config.appVersion,
      timestamp: new Date().toISOString(),
    }),
  );

  app.use("*", async (c, next) => {
    const token =
      c.req.header("x-supervisor-token") ||
      c.req.header("authorization")?.replace(/^Bearer\s+/i, "");
    if (!config.token || token !== config.token) {
      return c.json(
        { error: { code: "UNAUTHORIZED", message: "Supervisor token required" } },
        401,
      );
    }
    await next();
  });

  app.get("/version", (c) =>
    c.json({
      data: {
        version: config.appVersion,
        rootDir: config.rootDir,
        composeFile: config.composeFile,
      },
    }),
  );

  app.post("/preflight", async (c) => {
    const operation = await createOperation(config, "preflight");
    await runOperation(config, operation, async (record) => {
      await runCommand(record, execute, "bash", ["scripts/self-host-setup.sh"], {
        cwd: config.rootDir,
      });
      await runCommand(
        record,
        execute,
        "docker",
        [
          "compose",
          ...composeInvocationArgs(config),
          "config",
          "--quiet",
        ],
        { cwd: config.rootDir },
      );
    });
    return c.json({ data: operation });
  });

  app.post("/backup", async (c) => {
    if (hasActiveOperation(config)) return activeOperationError(c);
    const operation = await createOperation(config, "backup");
    await runOperation(config, operation, async (record) => {
      const backupDir = join(config.stateDir, "backups", operation.id);
      record.backupDir = backupDir;
      await runCommand(
        record,
        execute,
        "bash",
        ["scripts/self-host-backup.sh", "--output", backupDir],
        { cwd: config.rootDir },
      );
    });
    return c.json({ data: operation }, operation.status === "FAILED" ? 500 : 200);
  });

  app.post("/upgrade/apply", async (c) => {
    if (hasActiveOperation(config)) return activeOperationError(c);
    const parsed = applySchema.safeParse(await c.req.json());
    if (!parsed.success) return validationError(c, parsed.error);

    const backup = await readOperation(config, parsed.data.backupOperationId);
    if (!backup || backup.type !== "backup" || backup.status !== "SUCCEEDED") {
      return c.json(
        {
          error: {
            code: "BACKUP_REQUIRED",
            message: "A successful backup operation is required before upgrade.",
          },
        },
        400,
      );
    }

    const manifestResult = await loadManifest(parsed.data.manifestPath);
    if (!manifestResult.ok) {
      return c.json(
        {
          error: {
            code: "INVALID_MANIFEST",
            message: manifestResult.message,
            details: manifestResult.details,
          },
        },
        400,
      );
    }

    const manifest = manifestResult.manifest;
    const coverageError = await validateComposeRelease(config, execute, manifest);
    if (coverageError) return c.json({ error: coverageError }, 400);

    const operation = await createOperation(config, "upgrade.apply");
    operation.targetVersion = manifest.version;
    operation.backupDir = backup.backupDir;

    await runOperation(config, operation, async (record) => {
      const overrideFile = await writeReleaseOverride(config, operation, manifest);
      const composeArgs = composeInvocationArgs(config, overrideFile);
      await verifyReleaseImages(config, execute, manifest, overrideFile);
      record.logs.push(`Validated pinned release ${manifest.version}.`);
      for (const image of manifest.images) {
        record.logs.push(`${image.service}: ${image.image}@${image.digest}`);
      }
      await runCommand(
        record,
        execute,
        "docker",
        ["compose", ...composeArgs, "pull"],
        { cwd: config.rootDir },
      );
      await runCommand(
        record,
        execute,
        "pnpm",
        ["-F", "@planisfy/database", "db:migrate"],
        { cwd: config.rootDir },
      );
      await runCommand(
        record,
        execute,
        "docker",
        [
          "compose",
          ...composeArgs,
          "up",
          "-d",
        ],
        { cwd: config.rootDir },
      );
      await runCommand(
        record,
        execute,
        "curl",
        ["-fsS", "http://localhost:4000/health/detailed"],
        { cwd: config.rootDir },
      );
    });

    return c.json({ data: operation }, operation.status === "FAILED" ? 500 : 200);
  });

  app.post("/upgrade/rollback", async (c) => {
    if (hasActiveOperation(config)) return activeOperationError(c);
    const parsed = rollbackSchema.safeParse(await c.req.json());
    if (!parsed.success) return validationError(c, parsed.error);

    const manifestResult = await loadManifest(parsed.data.manifestPath);
    if (!manifestResult.ok) {
      return c.json(
        {
          error: {
            code: "INVALID_MANIFEST",
            message: manifestResult.message,
            details: manifestResult.details,
          },
        },
        400,
      );
    }

    const manifest = manifestResult.manifest;
    if (!canRollbackRelease(manifest)) {
      return c.json(
        {
          error: {
            code: "ROLLBACK_UNSUPPORTED",
            message: "Target release manifest does not allow rollback.",
          },
        },
        400,
      );
    }
    const coverageError = await validateComposeRelease(config, execute, manifest);
    if (coverageError) return c.json({ error: coverageError }, 400);

    const operation = await createOperation(config, "upgrade.rollback");
    operation.targetVersion = manifest.version;
    operation.backupDir = parsed.data.backupDir;

    await runOperation(config, operation, async (record) => {
      const overrideFile = await writeReleaseOverride(config, operation, manifest);
      const composeArgs = composeInvocationArgs(config, overrideFile);
      await verifyReleaseImages(config, execute, manifest, overrideFile);
      await runCommand(
        record,
        execute,
        "docker",
        ["compose", ...composeArgs, "pull"],
        { cwd: config.rootDir },
      );
      await runCommand(
        record,
        execute,
        "bash",
        ["scripts/self-host-restore.sh", "--backup", parsed.data.backupDir, "--confirm"],
        { cwd: config.rootDir },
      );
      await runCommand(
        record,
        execute,
        "docker",
        [
          "compose",
          ...composeArgs,
          "up",
          "-d",
        ],
        { cwd: config.rootDir },
      );
      await runCommand(
        record,
        execute,
        "curl",
        ["-fsS", "http://localhost:4000/health/detailed"],
        { cwd: config.rootDir },
      );
    });

    return c.json({ data: operation }, operation.status === "FAILED" ? 500 : 200);
  });

  app.get("/operations/:id", async (c) => {
    const operation = await readOperation(config, c.req.param("id"));
    if (!operation) {
      return c.json(
        { error: { code: "NOT_FOUND", message: "Operation not found" } },
        404,
      );
    }
    return c.json({ data: operation });
  });

  app.get("/operations", async (c) => {
    const operations = await listOperations(config);
    return c.json({ data: operations });
  });

  return app;
}

export function supervisorConfigFromEnv(): SupervisorConfig {
  const rootDir = resolve(process.env.PLANISFY_ROOT_DIR ?? process.cwd());
  return {
    token: process.env.SUPERVISOR_TOKEN ?? "",
    rootDir,
    stateDir: resolve(process.env.SUPERVISOR_STATE_DIR ?? join(rootDir, ".supervisor")),
    appVersion: process.env.APP_VERSION ?? "self-host",
    composeFile:
      process.env.SUPERVISOR_COMPOSE_FILE ??
      join(rootDir, "infra/docker/docker-compose.yml"),
    envFile: process.env.SUPERVISOR_ENV_FILE ?? join(rootDir, ".env"),
    composeProfiles: parseComposeProfiles(process.env.SUPERVISOR_COMPOSE_PROFILES),
  };
}

async function loadManifest(path: string): Promise<ManifestLoadResult> {
  try {
    const raw = await readFile(path, "utf8");
    return { ok: true, manifest: parseUpgradeReleaseManifest(JSON.parse(raw)) };
  } catch (error) {
    if (isZodLikeError(error)) {
      return {
        ok: false,
        message: "Release manifest failed validation.",
        details: error.flatten(),
      };
    }
    return { ok: false, message: errorMessage(error) };
  }
}

async function createOperation(
  config: SupervisorConfig,
  type: OperationRecord["type"],
): Promise<OperationRecord> {
  const operation: OperationRecord = {
    id: randomUUID(),
    type,
    status: "PENDING",
    startedAt: new Date().toISOString(),
    logs: [],
  };
  await writeOperation(config, operation);
  return operation;
}

async function runOperation(
  config: SupervisorConfig,
  operation: OperationRecord,
  task: (operation: OperationRecord) => Promise<void>,
) {
  const lockKey = operationLockKey(config);
  if (activeOperationLocks.has(lockKey)) {
    operation.status = "FAILED";
    operation.error = "Another supervisor operation is already running.";
    operation.logs.push(operation.error);
    operation.completedAt = new Date().toISOString();
    await writeOperation(config, operation);
    return;
  }

  activeOperationLocks.add(lockKey);
  operation.status = "RUNNING";
  await writeOperation(config, operation);
  try {
    await task(operation);
    operation.status = "SUCCEEDED";
  } catch (err) {
    operation.status = "FAILED";
    operation.error = redactSensitive(errorMessage(err));
    operation.logs.push(operation.error);
  } finally {
    activeOperationLocks.delete(lockKey);
    operation.completedAt = new Date().toISOString();
    await writeOperation(config, operation);
  }
}

async function runCommand(
  operation: OperationRecord,
  execute: CommandExecutor,
  command: string,
  args: string[],
  options: { cwd: string },
) {
  operation.logs.push(redactSensitive(`$ ${command} ${args.join(" ")}`));
  const result = await execute(command, args, options);
  if (result.stdout.trim()) operation.logs.push(redactSensitive(result.stdout.trim()));
  if (result.stderr.trim()) operation.logs.push(redactSensitive(result.stderr.trim()));
}

async function listComposeServices(
  config: SupervisorConfig,
  execute: CommandExecutor,
) {
  const result = await execute(
    "docker",
    ["compose", ...composeInvocationArgs(config), "config", "--services"],
    { cwd: config.rootDir },
  );
  return parseOutputLines(result.stdout);
}

async function listRunningComposeServices(
  config: SupervisorConfig,
  execute: CommandExecutor,
) {
  const result = await execute(
    "docker",
    [
      "compose",
      ...composeInvocationArgs(config),
      "ps",
      "--services",
      "--status",
      "running",
    ],
    { cwd: config.rootDir },
  );
  return parseOutputLines(result.stdout);
}

async function validateComposeRelease(
  config: SupervisorConfig,
  execute: CommandExecutor,
  manifest: UpgradeReleaseManifest,
) {
  try {
    const services = await listComposeServices(config, execute);
    const runningServices = await listRunningComposeServices(config, execute);
    const coverage = manifestServiceCoverage(manifest, services);
    const runningOutsideTarget = [...runningServices]
      .filter((service) => !services.has(service))
      .sort();
    if (
      services.size === 0 ||
      coverage.missing.length > 0 ||
      coverage.unexpected.length > 0 ||
      runningOutsideTarget.length > 0
    ) {
      return {
        code: "INCOMPLETE_RELEASE_MANIFEST",
        message: "Release manifest must exactly cover the selected Compose stack.",
        details: {
          missingServices: coverage.missing,
          unexpectedServices: coverage.unexpected,
          runningOutsideTarget,
        },
      };
    }
    return null;
  } catch (error) {
    return {
      code: "COMPOSE_VALIDATION_FAILED",
      message: "Unable to enumerate the selected Compose stack.",
      details: { cause: redactSensitive(errorMessage(error)) },
    };
  }
}

async function verifyReleaseImages(
  config: SupervisorConfig,
  execute: CommandExecutor,
  manifest: UpgradeReleaseManifest,
  overrideFile: string,
) {
  const result = await execute(
    "docker",
    [
      "compose",
      ...composeInvocationArgs(config, overrideFile),
      "config",
      "--images",
    ],
    { cwd: config.rootDir },
  );
  const resolved = parseOutputLines(result.stdout);
  const expected = new Set(
    manifest.images.map((image) => `${image.image}@${image.digest}`),
  );
  const missing = [...expected].filter((image) => !resolved.has(image)).sort();
  const unexpected = [...resolved].filter((image) => !expected.has(image)).sort();
  const mutable = [...resolved].filter((image) => !/@sha256:[a-f0-9]{64}$/.test(image));
  if (missing.length > 0 || unexpected.length > 0 || mutable.length > 0) {
    throw new Error(
      `Resolved Compose images do not match the reviewed release manifest: ${JSON.stringify({
        missing,
        unexpected,
        mutable,
      })}`,
    );
  }
}

async function writeReleaseOverride(
  config: SupervisorConfig,
  operation: OperationRecord,
  manifest: UpgradeReleaseManifest,
) {
  await mkdir(join(config.stateDir, "overrides"), { recursive: true });
  const path = join(config.stateDir, "overrides", `${operation.id}.release.yml`);
  const body = [
    "services:",
    ...manifest.images.flatMap((image) => [
      `  ${image.service}:`,
      `    image: ${image.image}@${image.digest}`,
    ]),
    "",
  ].join("\n");
  await writeFile(path, body);
  return path;
}

function composeInvocationArgs(config: SupervisorConfig, overrideFile?: string) {
  return [
    "--env-file",
    config.envFile,
    ...(config.composeProfiles ?? []).flatMap((profile) => ["--profile", profile]),
    "-f",
    config.composeFile,
    ...(overrideFile ? ["-f", overrideFile] : []),
  ];
}

function parseComposeProfiles(value: string | undefined) {
  if (!value?.trim()) return [];
  const profiles = value
    .split(",")
    .map((profile) => profile.trim())
    .filter(Boolean);
  if (
    new Set(profiles).size !== profiles.length ||
    profiles.some((profile) => !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(profile))
  ) {
    throw new Error("SUPERVISOR_COMPOSE_PROFILES must contain unique Compose profile names");
  }
  return profiles;
}

function parseOutputLines(value: string) {
  return new Set(
    value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
  );
}

function hasActiveOperation(config: SupervisorConfig) {
  return activeOperationLocks.has(operationLockKey(config));
}

function operationLockKey(config: SupervisorConfig) {
  return config.stateDir;
}

function activeOperationError(c: Context) {
  return c.json(
    {
      error: {
        code: "OPERATION_IN_PROGRESS",
        message: "Another supervisor operation is already running.",
      },
    },
    409,
  );
}

function redactSensitive(value: string) {
  return value
    .replace(/(BETTER_AUTH_SECRET|INTERNAL_API_SECRET|SUPERVISOR_TOKEN|DATABASE_URL|REDIS_URL|PASSWORD|SECRET|TOKEN|KEY)=([^\s"'\\]+)/gi, "$1=[REDACTED]")
    .replace(/(postgres(?:ql)?:\/\/)([^@\s]+)@/gi, "$1[REDACTED]@")
    .replace(/(redis:\/\/)([^@\s]+)@/gi, "$1[REDACTED]@");
}

async function writeOperation(config: SupervisorConfig, operation: OperationRecord) {
  await mkdir(join(config.stateDir, "operations"), { recursive: true });
  await writeFile(
    join(config.stateDir, "operations", `${operation.id}.json`),
    JSON.stringify(operation, null, 2),
  );
}

async function readOperation(config: SupervisorConfig, id: string) {
  try {
    const raw = await readFile(
      join(config.stateDir, "operations", `${id}.json`),
      "utf8",
    );
    return JSON.parse(raw) as OperationRecord;
  } catch {
    return null;
  }
}

async function listOperations(config: SupervisorConfig) {
  try {
    const dir = join(config.stateDir, "operations");
    const files = await readdir(dir);
    const operations = await Promise.all(
      files
        .filter((file) => file.endsWith(".json"))
        .map((file) => readOperation(config, file.replace(/\.json$/, ""))),
    );
    return operations
      .filter((operation): operation is OperationRecord => operation !== null)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, 20);
  } catch {
    return [];
  }
}

async function defaultExecute(
  command: string,
  args: string[],
  options: { cwd: string },
) {
  const result = await execFileAsync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 10,
  });
  return {
    stdout: String(result.stdout),
    stderr: String(result.stderr),
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function validationError(c: Context, error: z.ZodError) {
  return c.json(
    {
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request data",
        details: error.flatten(),
      },
    },
    400,
  );
}

function isZodLikeError(error: unknown): error is { flatten: () => unknown } {
  return (
    error instanceof z.ZodError ||
    (typeof error === "object" &&
      error !== null &&
      "flatten" in error &&
      typeof error.flatten === "function")
  );
}
