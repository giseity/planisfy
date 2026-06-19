import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeDodoBillingTransactionStatus,
  normalizeDodoSubscriptionStatus,
} from "./billing";

describe("Dodo billing status normalization", () => {
  it("normalizes payment events to transaction statuses", () => {
    assert.equal(
      normalizeDodoBillingTransactionStatus("payment.processing", null),
      "PENDING",
    );
    assert.equal(
      normalizeDodoBillingTransactionStatus("payment.succeeded", null),
      "PAID",
    );
    assert.equal(
      normalizeDodoBillingTransactionStatus("payment.failed", null),
      "FAILED",
    );
    assert.equal(
      normalizeDodoBillingTransactionStatus("payment.cancelled", null),
      "CANCELED",
    );
    assert.equal(
      normalizeDodoBillingTransactionStatus("payment.refunded", null),
      "REFUNDED",
    );
  });

  it("falls back to raw payment status when event type is ambiguous", () => {
    assert.equal(
      normalizeDodoBillingTransactionStatus("payment.unknown", "paid"),
      "PAID",
    );
    assert.equal(
      normalizeDodoBillingTransactionStatus("payment.unknown", "pending"),
      "PENDING",
    );
    assert.equal(
      normalizeDodoBillingTransactionStatus("payment.unknown", "strange"),
      "UNKNOWN",
    );
  });

  it("normalizes subscription lifecycle statuses without local trials", () => {
    assert.equal(
      normalizeDodoSubscriptionStatus("subscription.active", null),
      "ACTIVE",
    );
    assert.equal(
      normalizeDodoSubscriptionStatus("subscription.failed", null),
      "PAST_DUE",
    );
    assert.equal(
      normalizeDodoSubscriptionStatus("subscription.expired", null),
      "CANCELED",
    );
    assert.equal(
      normalizeDodoSubscriptionStatus("subscription.updated", "trialing"),
      "INACTIVE",
    );
  });
});
