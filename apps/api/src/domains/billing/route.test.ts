import assert from "node:assert/strict";
import test from "node:test";
import { serializeBillingTransaction } from "./route";

test("serializeBillingTransaction returns local Dodo ledger fields", () => {
  const createdAt = new Date("2026-06-15T10:00:00.000Z");
  const updatedAt = new Date("2026-06-15T10:05:00.000Z");
  const paidAt = new Date("2026-06-15T10:04:00.000Z");

  const serialized = serializeBillingTransaction({
    id: "transaction-1",
    accountId: "account-1",
    initiatedByAccountId: null,
    provider: "DODO",
    type: "SUBSCRIPTION",
    status: "PAID",
    providerCheckoutId: "checkout-1",
    providerOrderId: "order-1",
    providerCustomerId: "customer-1",
    providerCustomerExternalId: "account-1",
    providerProductId: "product-1",
    productKey: "pro",
    productLabel: "Pro",
    amountCents: 2900,
    currency: "USD",
    metadata: null,
    lastWebhookId: null,
    lastWebhookType: null,
    lastWebhookAt: null,
    paidAt,
    createdAt,
    updatedAt,
  });

  assert.deepEqual(serialized, {
    id: "transaction-1",
    provider: "DODO",
    type: "SUBSCRIPTION",
    status: "PAID",
    providerCheckoutId: "checkout-1",
    providerOrderId: "order-1",
    productKey: "pro",
    productLabel: "Pro",
    amountCents: 2900,
    currency: "USD",
    paidAt: paidAt.toISOString(),
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
  });
});
