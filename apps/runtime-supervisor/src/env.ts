import { loadWorkspaceEnv } from "@planisfy/env/node";
import { z } from "zod";

loadWorkspaceEnv();

const serviceEnv = z.object({
  composeService: z.string(),
  systemdUnit: z.string(),
  healthUrl: z.string().url().optional(),
});

const envSchema = z.object({
  NODE_ENV: z.string().default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4012),
  APP_VERSION: z.string().default("runtime-supervisor"),
  RUNTIME_SUPERVISOR_TOKEN: z.string().default(""),
  RUNTIME_SUPERVISOR_DRIVER: z.enum(["compose", "docker", "systemd"]).default("compose"),
  RUNTIME_SUPERVISOR_COMPOSE_FILE: z.string().optional(),
  RUNTIME_SUPERVISOR_COMPOSE_ENV_FILE: z.string().optional(),
  RUNTIME_SUPERVISOR_COMPOSE_CWD: z.string().default(process.cwd()),
  martin: serviceEnv.default({
    composeService: "martin",
    systemdUnit: "planisfy-martin.service",
    healthUrl: "http://martin:3000/health",
  }),
  valhalla: serviceEnv.default({
    composeService: "valhalla",
    systemdUnit: "planisfy-valhalla.service",
    healthUrl: "http://valhalla:8002/status",
  }),
  elevation: serviceEnv.default({
    composeService: "elevation",
    systemdUnit: "planisfy-elevation.service",
    healthUrl: "http://elevation:8080/api/v1/health",
  }),
});

export const env = envSchema.parse({
  ...process.env,
  martin: {
    composeService: process.env.RUNTIME_SUPERVISOR_MARTIN_COMPOSE_SERVICE ?? "martin",
    systemdUnit:
      process.env.RUNTIME_SUPERVISOR_MARTIN_SYSTEMD_UNIT ?? "planisfy-martin.service",
    healthUrl: process.env.RUNTIME_SUPERVISOR_MARTIN_HEALTH_URL ?? "http://martin:3000/health",
  },
  valhalla: {
    composeService: process.env.RUNTIME_SUPERVISOR_VALHALLA_COMPOSE_SERVICE ?? "valhalla",
    systemdUnit:
      process.env.RUNTIME_SUPERVISOR_VALHALLA_SYSTEMD_UNIT ?? "planisfy-valhalla.service",
    healthUrl:
      process.env.RUNTIME_SUPERVISOR_VALHALLA_HEALTH_URL ?? "http://valhalla:8002/status",
  },
  elevation: {
    composeService: process.env.RUNTIME_SUPERVISOR_ELEVATION_COMPOSE_SERVICE ?? "elevation",
    systemdUnit:
      process.env.RUNTIME_SUPERVISOR_ELEVATION_SYSTEMD_UNIT ?? "planisfy-elevation.service",
    healthUrl:
      process.env.RUNTIME_SUPERVISOR_ELEVATION_HEALTH_URL ??
      "http://elevation:8080/api/v1/health",
  },
});
