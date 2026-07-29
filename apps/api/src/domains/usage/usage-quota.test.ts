import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildQuotaWarningRequest,
  evaluateMonthlyQuota,
  getMonthlyUsagePeriod,
} from "./usage-quota";

describe("usage quota helpers", () => {
  it("uses UTC calendar-month boundaries", () => {
    const period = getMonthlyUsagePeriod(
      new Date("2026-06-15T23:30:00.000Z"),
    );

    assert.equal(period.key, "2026-06");
    assert.equal(period.start.toISOString(), "2026-06-01T00:00:00.000Z");
    assert.equal(period.end.toISOString(), "2026-07-01T00:00:00.000Z");
  });

  it("allows requests that stay within the monthly unit limit", () => {
    const quota = evaluateMonthlyQuota({
      used: 90,
      cost: 10,
      limit: 100,
    });

    assert.equal(quota.allowed, true);
    assert.equal(quota.projected, 100);
    assert.equal(quota.remaining, 0);
    assert.equal(quota.percent, 100);
  });

  it("rejects requests that would exceed the monthly unit limit", () => {
    const quota = evaluateMonthlyQuota({
      used: 95,
      cost: 10,
      limit: 100,
    });

    assert.equal(quota.allowed, false);
    assert.equal(quota.used, 95);
    assert.equal(quota.projected, 105);
    assert.equal(quota.remaining, 0);
  });

  it("treats platform quota as unlimited", () => {
    const quota = evaluateMonthlyQuota({
      used: 1_000_000,
      cost: 10_000,
      limit: Infinity,
    });

    assert.equal(quota.allowed, true);
    assert.equal(quota.remaining, Infinity);
    assert.equal(quota.percent, 0);
  });

  it("requests one threshold-keyed warning after successful billable usage", () => {
    const warning = buildQuotaWarningRequest({
      accountId: "11111111-1111-4111-8111-111111111111",
      usedUnits: 79,
      billableUnits: 1,
      totalUnits: 100,
      now: new Date("2026-07-29T12:00:00.000Z"),
    });

    assert.equal(
      warning?.deduplicationKey,
      "quota-warning:11111111-1111-4111-8111-111111111111:2026-07:80",
    );
    assert.equal(warning?.payload.percentUsed, 80);
    assert.equal(
      buildQuotaWarningRequest({
        accountId: "11111111-1111-4111-8111-111111111111",
        usedUnits: 79,
        billableUnits: 0,
        totalUnits: 100,
      }),
      null,
    );
  });
});
