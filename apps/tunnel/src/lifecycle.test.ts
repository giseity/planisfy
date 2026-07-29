import { describe, expect, it, vi } from "vitest";
import { createTunnelLifecycle, signalExitCode } from "./lifecycle";

function setup() {
  const kill = vi.fn();
  const exit = vi.fn();
  const reportSpawnError = vi.fn();
  const lifecycle = createTunnelLifecycle({ kill, exit, reportSpawnError });

  return { exit, kill, lifecycle, reportSpawnError };
}

describe("tunnel lifecycle", () => {
  it.each(["SIGINT", "SIGTERM"] as const)(
    "forwards %s and exits cleanly after intentional shutdown",
    (signal) => {
      const { exit, kill, lifecycle } = setup();

      lifecycle.stop(signal);
      lifecycle.handleExit(null, signal);

      expect(kill).toHaveBeenCalledOnce();
      expect(kill).toHaveBeenCalledWith(signal);
      expect(exit).toHaveBeenCalledOnce();
      expect(exit).toHaveBeenCalledWith(0);
    },
  );

  it("preserves a normal child exit code", () => {
    const { exit, lifecycle } = setup();

    lifecycle.handleExit(23, null);

    expect(exit).toHaveBeenCalledWith(23);
  });

  it("maps an unexpected child signal to a non-zero exit", () => {
    const { exit, lifecycle } = setup();

    lifecycle.handleExit(null, "SIGTERM");

    expect(exit).toHaveBeenCalledWith(signalExitCode("SIGTERM"));
    expect(exit.mock.calls[0]?.[0]).toBeGreaterThan(0);
  });

  it("reports spawn failures and exits with status 1", () => {
    const { exit, lifecycle, reportSpawnError } = setup();
    const error = Object.assign(new Error("not found"), { code: "ENOENT" });

    lifecycle.handleError(error);

    expect(reportSpawnError).toHaveBeenCalledWith(error);
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("settles only once when error and exit events both arrive", () => {
    const { exit, lifecycle } = setup();

    lifecycle.handleError(new Error("spawn failed"));
    lifecycle.handleExit(7, null);
    lifecycle.stop("SIGINT");

    expect(exit).toHaveBeenCalledOnce();
  });
});
