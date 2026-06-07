import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Hono } from "hono";

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
