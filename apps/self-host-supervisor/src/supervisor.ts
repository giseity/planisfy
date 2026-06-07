import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Hono, type Context } from "hono";
import { z } from "zod";
import {
  canRollbackRelease,
  hasPinnedImageDigests,
  parseUpgradeReleaseManifest,
  type UpgradeReleaseManifest,
} from "@planisfy/upgrade-manifest";

const execFileAsync = promisify(execFile);

export type SupervisorConfig = {
  token: string;
  rootDir: string;
  stateDir: string;
  appVersion: string;
  composeFile: string;
  envFile: string;
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
        ["compose", "--env-file", config.envFile, "-f", config.composeFile, "config"],
        { cwd: config.rootDir },
      );
    });
    return c.json({ data: operation });
  });

  app.post("/backup", async (c) => {
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
    if (!hasPinnedImageDigests(manifest) || usesLatestTag(manifest)) {
      return c.json(
        {
          error: {
            code: "UNPINNED_RELEASE",
            message: "Upgrade targets must use pinned image digests.",
          },
        },
        400,
      );
    }

    const operation = await createOperation(config, "upgrade.apply");
    operation.targetVersion = manifest.version;
    operation.backupDir = backup.backupDir;

    await runOperation(config, operation, async (record) => {
      record.logs.push(`Validated pinned release ${manifest.version}.`);
      for (const image of manifest.images) {
        record.logs.push(`${image.service}: ${image.image}@${image.digest}`);
      }
      await runCommand(
        record,
        execute,
        "docker",
        ["compose", "--env-file", config.envFile, "-f", config.composeFile, "pull"],
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
          "--env-file",
          config.envFile,
          "-f",
          config.composeFile,
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

    const operation = await createOperation(config, "upgrade.rollback");
    operation.targetVersion = manifest.version;
    operation.backupDir = parsed.data.backupDir;

    await runOperation(config, operation, async (record) => {
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
          "--env-file",
          config.envFile,
          "-f",
          config.composeFile,
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

function usesLatestTag(manifest: UpgradeReleaseManifest) {
  return manifest.images.some((image) => image.image.endsWith(":latest"));
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
  operation.status = "RUNNING";
  await writeOperation(config, operation);
  try {
    await task(operation);
    operation.status = "SUCCEEDED";
  } catch (err) {
    operation.status = "FAILED";
    operation.error = errorMessage(err);
    operation.logs.push(operation.error);
  } finally {
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
  operation.logs.push(`$ ${command} ${args.join(" ")}`);
  const result = await execute(command, args, options);
  if (result.stdout.trim()) operation.logs.push(result.stdout.trim());
  if (result.stderr.trim()) operation.logs.push(result.stderr.trim());
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
