import assert from "node:assert/strict";
import test from "node:test";
import { shouldReconcileStaleProcessingJob } from "@planisfy/database/jobs/reconciliation";

const now = new Date("2026-06-18T12:00:00.000Z");
const staleMs = 60_000;
const staleUpdatedAt = new Date(now.getTime() - staleMs - 1);
const freshUpdatedAt = new Date(now.getTime() - staleMs + 1);

test("reconciles stale pending jobs without an active queue job", () => {
  assert.equal(
    shouldReconcileStaleProcessingJob({
      status: "PENDING",
      updatedAt: staleUpdatedAt,
      now,
      staleMs,
      queueActive: false,
      hasFreshWorkerHeartbeat: true,
    }),
    true,
  );
});

test("reconciles stale processing jobs without a fresh heartbeat", () => {
  assert.equal(
    shouldReconcileStaleProcessingJob({
      status: "PROCESSING",
      updatedAt: staleUpdatedAt,
      now,
      staleMs,
      queueActive: true,
      hasFreshWorkerHeartbeat: false,
    }),
    true,
  );
});

test("keeps fresh active jobs", () => {
  assert.equal(
    shouldReconcileStaleProcessingJob({
      status: "PROCESSING",
      updatedAt: freshUpdatedAt,
      now,
      staleMs,
      queueActive: true,
      hasFreshWorkerHeartbeat: true,
    }),
    false,
  );
});

test("keeps old jobs with active queue state and fresh heartbeat", () => {
  assert.equal(
    shouldReconcileStaleProcessingJob({
      status: "PENDING",
      updatedAt: staleUpdatedAt,
      now,
      staleMs,
      queueActive: true,
      hasFreshWorkerHeartbeat: true,
    }),
    false,
  );
});

test("ignores canceled and terminal jobs", () => {
  for (const status of ["CANCELED", "FAILED", "SUCCEEDED"]) {
    assert.equal(
      shouldReconcileStaleProcessingJob({
        status,
        updatedAt: staleUpdatedAt,
        now,
        staleMs,
        queueActive: false,
        hasFreshWorkerHeartbeat: false,
      }),
      false,
    );
  }
});
