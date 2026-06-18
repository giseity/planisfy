import assert from "node:assert/strict";
import test from "node:test";
import {
  parseBoundedIntegerParam,
  USAGE_LOG_RETENTION_DAYS,
  usageDaysLimit,
  usageRetentionWindow,
} from "./usage";

test("parseBoundedIntegerParam defaults missing values", () => {
  assert.deepEqual(
    parseBoundedIntegerParam(undefined, "days", {
      defaultValue: 30,
      min: 1,
      max: 366,
    }),
    { ok: true, value: 30 },
  );
});

test("parseBoundedIntegerParam rejects invalid and out-of-range values", () => {
  const options = { defaultValue: 30, min: 1, max: 366 };

  assert.deepEqual(parseBoundedIntegerParam("abc", "days", options), {
    ok: false,
    message: "days must be an integer",
  });
  assert.deepEqual(parseBoundedIntegerParam("1.5", "days", options), {
    ok: false,
    message: "days must be an integer",
  });
  assert.deepEqual(parseBoundedIntegerParam("0", "days", options), {
    ok: false,
    message: "days must be between 1 and 366",
  });
  assert.deepEqual(parseBoundedIntegerParam("367", "days", options), {
    ok: false,
    message: "days must be between 1 and 366",
  });
});

test("usage retention policy clamps usage summary windows", () => {
  const now = new Date("2026-06-18T16:00:00.000Z");
  const window = usageRetentionWindow(now);

  assert.equal(window.days, USAGE_LOG_RETENTION_DAYS);
  assert.equal(window.oldestAt.toISOString(), "2026-03-21T00:00:00.000Z");
  assert.equal(window.newestAt, now);
  assert.deepEqual(usageDaysLimit(), {
    defaultValue: 30,
    min: 1,
    max: USAGE_LOG_RETENTION_DAYS,
  });
});
