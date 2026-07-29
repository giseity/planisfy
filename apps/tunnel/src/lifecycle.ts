import { constants } from "node:os";

export type ShutdownSignal = "SIGINT" | "SIGTERM";

type TunnelLifecycleOptions = {
  kill: (signal: ShutdownSignal) => void;
  exit: (code: number) => void;
  reportSpawnError: (error: Error) => void;
};

export function signalExitCode(signal: NodeJS.Signals): number {
  const signalNumber = constants.signals[signal];
  return typeof signalNumber === "number" ? 128 + signalNumber : 1;
}

export function createTunnelLifecycle({
  kill,
  exit,
  reportSpawnError,
}: TunnelLifecycleOptions) {
  let requestedSignal: ShutdownSignal | null = null;
  let settled = false;

  const settle = (code: number) => {
    if (settled) return;
    settled = true;
    exit(code);
  };

  return {
    stop(signal: ShutdownSignal) {
      if (settled || requestedSignal) return;
      requestedSignal = signal;

      try {
        kill(signal);
      } catch (error) {
        reportSpawnError(
          error instanceof Error ? error : new Error("Failed to stop Cloudflare tunnel"),
        );
        settle(1);
      }
    },
    handleError(error: Error) {
      reportSpawnError(error);
      settle(1);
    },
    handleExit(code: number | null, signal: NodeJS.Signals | null) {
      if (requestedSignal) {
        settle(0);
        return;
      }
      if (signal) {
        settle(signalExitCode(signal));
        return;
      }
      settle(code ?? 1);
    },
  };
}
