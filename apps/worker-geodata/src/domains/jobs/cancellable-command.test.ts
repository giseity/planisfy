import assert from "node:assert/strict";
import test from "node:test";
import { runCancellableCommand } from "./cancellable-command";

test("runCancellableCommand terminates a child when cancellation wins", async () => {
  const cancellation = new Error("cancel requested");
  let polls = 0;

  await assert.rejects(
    runCancellableCommand({
      file: process.execPath,
      args: ["-e", "setInterval(() => {}, 1000)"],
      timeoutMs: 5_000,
      cancellationPollMs: 10,
      checkCanceled: async () => {
        polls += 1;
        if (polls >= 2) throw cancellation;
      },
    }),
    (error: unknown) => error === cancellation,
  );
  assert.ok(polls >= 2);
});

test("runCancellableCommand returns bounded child output", async () => {
  const result = await runCancellableCommand({
    file: process.execPath,
    args: ["-e", "process.stdout.write('ready')"],
    timeoutMs: 5_000,
    cancellationPollMs: 10,
  });

  assert.equal(result.stdout, "ready");
  assert.equal(result.stderr, "");
});
