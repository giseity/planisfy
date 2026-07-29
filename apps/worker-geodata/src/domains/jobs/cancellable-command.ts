import { spawn } from "node:child_process";

const MAX_CAPTURED_OUTPUT_BYTES = 16 * 1024 * 1024;
const FORCE_KILL_DELAY_MS = 5_000;

export async function runCancellableCommand(params: {
  file: string;
  args: string[];
  timeoutMs: number;
  cancellationPollMs: number;
  checkCanceled?: () => Promise<void>;
  env?: NodeJS.ProcessEnv;
}) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(params.file, params.args, {
      env: params.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let capturedBytes = 0;
    let terminatingError: unknown;
    let cancellationCheckRunning = false;
    let forceKillTimer: NodeJS.Timeout | undefined;
    let settled = false;

    const timeout = setTimeout(() => {
      terminate(
        new Error(
          `Command timed out after ${params.timeoutMs}ms: ${params.file}`,
        ),
      );
    }, params.timeoutMs);
    const cancellationTimer = params.checkCanceled
      ? setInterval(() => {
          if (cancellationCheckRunning || terminatingError) return;
          cancellationCheckRunning = true;
          params
            .checkCanceled!()
            .catch((error) => terminate(error))
            .finally(() => {
              cancellationCheckRunning = false;
            });
        }, params.cancellationPollMs)
      : undefined;

    child.stdout.on("data", (chunk: Buffer) => capture(stdout, chunk));
    child.stderr.on("data", (chunk: Buffer) => capture(stderr, chunk));
    child.on("error", (error) => finish(error));
    child.on("exit", (code, signal) => {
      if (terminatingError) {
        finish(terminatingError);
        return;
      }
      if (code !== 0) {
        finish(
          new Error(
            `Command failed (${code ?? signal ?? "unknown"}): ${params.file}\n${Buffer.concat(stderr).toString("utf8")}`,
          ),
        );
        return;
      }
      finish();
    });

    function capture(target: Buffer[], chunk: Buffer) {
      capturedBytes += chunk.byteLength;
      if (capturedBytes > MAX_CAPTURED_OUTPUT_BYTES) {
        terminate(
          new Error(
            `Command output exceeded ${MAX_CAPTURED_OUTPUT_BYTES} bytes: ${params.file}`,
          ),
        );
        return;
      }
      target.push(chunk);
    }

    function terminate(error: unknown) {
      if (terminatingError) return;
      terminatingError = error;
      child.kill("SIGTERM");
      forceKillTimer = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill("SIGKILL");
        }
      }, FORCE_KILL_DELAY_MS);
      forceKillTimer.unref();
    }

    function finish(error?: unknown) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (cancellationTimer) clearInterval(cancellationTimer);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      if (error) {
        reject(error);
      } else {
        resolve({
          stdout: Buffer.concat(stdout).toString("utf8"),
          stderr: Buffer.concat(stderr).toString("utf8"),
        });
      }
    }
  });
}
