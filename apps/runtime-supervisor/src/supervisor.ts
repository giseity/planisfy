import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Hono, type Context } from "hono";
import { z } from "zod";
import { env } from "./env";

const execFileAsync = promisify(execFile);

const serviceSchema = z.enum(["martin", "valhalla", "elevation"]);
type RuntimeService = z.infer<typeof serviceSchema>;

export type RuntimeSupervisorConfig = {
  token: string;
  appVersion: string;
  driver: "compose" | "docker" | "systemd";
  composeFile?: string;
  composeEnvFile?: string;
  composeCwd: string;
  services: Record<RuntimeService, RuntimeServiceConfig>;
  execute?: CommandExecutor;
};

export type RuntimeServiceConfig = {
  composeService: string;
  systemdUnit: string;
  healthUrl?: string;
};

export type CommandExecutor = (
  command: string,
  args: string[],
  options: { cwd: string },
) => Promise<{ stdout: string; stderr: string }>;

type ServiceStatus = {
  service: RuntimeService;
  configured: boolean;
  healthy: boolean;
  healthUrl: string | null;
  message: string;
};

export function createRuntimeSupervisorApp(config: RuntimeSupervisorConfig) {
  const app = new Hono();
  const execute = config.execute ?? defaultExecute;

  app.get("/health", (c) =>
    c.json({
      status: "ok",
      version: config.appVersion,
      driver: config.driver,
      timestamp: new Date().toISOString(),
    }),
  );

  app.use("*", async (c, next) => {
    const token =
      c.req.header("x-runtime-supervisor-token") ||
      c.req.header("authorization")?.replace(/^Bearer\s+/i, "");
    if (!config.token || token !== config.token) {
      return c.json(
        { error: { code: "UNAUTHORIZED", message: "Runtime supervisor token required" } },
        401,
      );
    }
    await next();
  });

  app.get("/services", async (c) => {
    const statuses = await Promise.all(
      serviceSchema.options.map((service) => probeService(config, service)),
    );
    return c.json({ data: statuses });
  });

  app.post("/services/:service/restart", async (c) => {
    const service = parseService(c);
    if (!service.ok) return service.response;
    const result = await restartService(config, execute, service.value);
    return c.json({ data: result }, result.healthy ? 200 : 503);
  });

  app.post("/services/:service/health", async (c) => {
    const service = parseService(c);
    if (!service.ok) return service.response;
    const result = await probeService(config, service.value);
    return c.json({ data: result }, result.healthy ? 200 : 503);
  });

  return app;
}

export function runtimeSupervisorConfigFromEnv(): RuntimeSupervisorConfig {
  return {
    token: env.RUNTIME_SUPERVISOR_TOKEN,
    appVersion: env.APP_VERSION,
    driver: env.RUNTIME_SUPERVISOR_DRIVER,
    composeFile: env.RUNTIME_SUPERVISOR_COMPOSE_FILE,
    composeEnvFile: env.RUNTIME_SUPERVISOR_COMPOSE_ENV_FILE,
    composeCwd: env.RUNTIME_SUPERVISOR_COMPOSE_CWD,
    services: {
      martin: env.martin,
      valhalla: env.valhalla,
      elevation: env.elevation,
    },
  };
}

async function restartService(
  config: RuntimeSupervisorConfig,
  execute: CommandExecutor,
  service: RuntimeService,
): Promise<ServiceStatus> {
  const serviceConfig = config.services[service];
  if (config.driver === "systemd") {
    await execute("systemctl", ["restart", serviceConfig.systemdUnit], { cwd: config.composeCwd });
  } else if (config.driver === "docker") {
    const result = await execute(
      "docker",
      [
        "ps",
        "-q",
        "--filter",
        `label=com.docker.compose.service=${serviceConfig.composeService}`,
      ],
      { cwd: config.composeCwd },
    );
    const containerIds = result.stdout
      .split(/\r?\n/)
      .map((id) => id.trim())
      .filter(Boolean);
    if (containerIds.length === 0) {
      return {
        service,
        configured: false,
        healthy: false,
        healthUrl: serviceConfig.healthUrl ?? null,
        message: `No running container found for ${serviceConfig.composeService}.`,
      };
    }
    await execute("docker", ["restart", ...containerIds], { cwd: config.composeCwd });
  } else {
    if (!config.composeFile) {
      return {
        service,
        configured: false,
        healthy: false,
        healthUrl: serviceConfig.healthUrl ?? null,
        message: "RUNTIME_SUPERVISOR_COMPOSE_FILE is required for compose driver.",
      };
    }
    await execute(
      "docker",
      [
        "compose",
        ...(config.composeEnvFile ? ["--env-file", config.composeEnvFile] : []),
        "-f",
        config.composeFile,
        "restart",
        serviceConfig.composeService,
      ],
      { cwd: config.composeCwd },
    );
  }
  return probeService(config, service);
}

async function probeService(
  config: RuntimeSupervisorConfig,
  service: RuntimeService,
): Promise<ServiceStatus> {
  const healthUrl = config.services[service].healthUrl;
  if (!healthUrl) {
    return {
      service,
      configured: true,
      healthy: true,
      healthUrl: null,
      message: "No health URL configured.",
    };
  }
  try {
    const response = await fetch(healthUrl, { signal: AbortSignal.timeout(10_000) });
    return {
      service,
      configured: true,
      healthy: response.ok,
      healthUrl,
      message: response.ok ? "Service is healthy." : `Health check returned ${response.status}.`,
    };
  } catch (error) {
    return {
      service,
      configured: true,
      healthy: false,
      healthUrl,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

function parseService(c: Context):
  | { ok: true; value: RuntimeService }
  | { ok: false; response: Response } {
  const parsed = serviceSchema.safeParse(c.req.param("service"));
  if (parsed.success) return { ok: true, value: parsed.data };
  return {
    ok: false,
    response: c.json(
      {
        error: {
          code: "UNSUPPORTED_SERVICE",
          message: "Runtime supervisor supports martin, valhalla, and elevation only.",
        },
      },
      404,
    ),
  };
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
