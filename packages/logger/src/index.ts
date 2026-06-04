export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug: LogMethod;
  info: LogMethod;
  warn: LogMethod;
  error: LogMethod;
  child(bindings: Record<string, unknown>): Logger;
}

export type LogMethod = (message: string, fields?: Record<string, unknown>) => void;

export interface CreateLoggerOptions {
  service: string;
  level?: LogLevel;
  bindings?: Record<string, unknown>;
}

const levelOrder: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export function createLogger(options: CreateLoggerOptions): Logger {
  const configuredLevel = normalizeLevel(options.level ?? process.env.LOG_LEVEL);
  const bindings = {
    service: options.service,
    ...options.bindings,
  };

  return createBoundLogger(configuredLevel, bindings);
}

function createBoundLogger(level: LogLevel, bindings: Record<string, unknown>): Logger {
  return {
    debug: writeLog("debug", level, bindings),
    info: writeLog("info", level, bindings),
    warn: writeLog("warn", level, bindings),
    error: writeLog("error", level, bindings),
    child(childBindings) {
      return createBoundLogger(level, { ...bindings, ...childBindings });
    },
  };
}

function writeLog(
  level: LogLevel,
  configuredLevel: LogLevel,
  bindings: Record<string, unknown>,
): LogMethod {
  return (message, fields = {}) => {
    if (levelOrder[level] < levelOrder[configuredLevel]) return;

    const entry = {
      level,
      time: new Date().toISOString(),
      msg: message,
      ...bindings,
      ...fields,
    };

    const output = JSON.stringify(entry);
    if (level === "error") {
      console.error(output);
    } else if (level === "warn") {
      console.warn(output);
    } else {
      console.log(output);
    }
  };
}

function normalizeLevel(level: string | undefined): LogLevel {
  if (level === "debug" || level === "info" || level === "warn" || level === "error") {
    return level;
  }

  return "info";
}
