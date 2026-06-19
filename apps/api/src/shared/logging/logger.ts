// ── Structured logging ──────────────────────────────────────────────────────
// JSON-formatted logs in production, pretty-printed in development.

import { env } from "../../env";

const isProduction = env.NODE_ENV === "production";

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  msg: string;
  timestamp: string;
  [key: string]: unknown;
}

function formatEntry(
  level: LogLevel,
  msg: string,
  data?: Record<string, unknown>,
): LogEntry {
  return {
    level,
    msg,
    timestamp: new Date().toISOString(),
    ...data,
  };
}

function output(entry: LogEntry): void {
  if (isProduction) {
    const stream =
      entry.level === "error" || entry.level === "warn"
        ? process.stderr
        : process.stdout;
    stream.write(JSON.stringify(entry) + "\n");
  } else {
    const color =
      entry.level === "error"
        ? "\x1b[31m"
        : entry.level === "warn"
          ? "\x1b[33m"
          : entry.level === "debug"
            ? "\x1b[90m"
            : "\x1b[36m";
    const reset = "\x1b[0m";
    const { level, msg, ...rest } = entry;
    const extra =
      Object.keys(rest).length > 0 ? " " + JSON.stringify(rest) : "";
    console.log(`${color}[${level.toUpperCase()}]${reset} ${msg}${extra}`);
  }
}

export const logger = {
  debug(msg: string, data?: Record<string, unknown>) {
    if (isProduction) return; // Skip debug in prod
    output(formatEntry("debug", msg, data));
  },
  info(msg: string, data?: Record<string, unknown>) {
    output(formatEntry("info", msg, data));
  },
  warn(msg: string, data?: Record<string, unknown>) {
    output(formatEntry("warn", msg, data));
  },
  error(msg: string, data?: Record<string, unknown>) {
    output(formatEntry("error", msg, data));
  },
};

// ── Hono middleware logger ──────────────────────────────────────────────────

import type { MiddlewareHandler } from "hono";

export function requestLogger(): MiddlewareHandler {
  return async (c, next) => {
    const start = Date.now();
    await next();
    const duration = Date.now() - start;

    const entry: Record<string, unknown> = {
      requestId: c.get("requestId"),
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      duration,
    };

    if (c.res.status >= 500) {
      logger.error("request", entry);
    } else if (c.res.status >= 400) {
      logger.warn("request", entry);
    } else {
      logger.info("request", entry);
    }
  };
}
