import assert from "node:assert/strict";
import test from "node:test";
import { parseBoundedIntegerParam } from "./usage";

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
