import assert from "node:assert/strict";
import test from "node:test";
import { Hono } from "hono";
import type { AuthEnv } from "../../middleware/auth";
import { billingRoute, serializeBillingTransaction } from "./route";

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
    productKey: "starter",
    productLabel: "Starter",
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
    productKey: "starter",
    productLabel: "Starter",
    amountCents: 2900,
    currency: "USD",
    paidAt: paidAt.toISOString(),
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
  });
});

test("self-host billing exposes read-only hosted billing actions", async () => {
  const previousMode = process.env.DEPLOYMENT_MODE;
  process.env.DEPLOYMENT_MODE = "self_host";

  const app = new Hono<AuthEnv>();
  app.use("*", async (c, next) => {
    c.set("userId", "user-1");
    c.set("ownerId", "user-1");
    c.set("orgRole", null);
    c.set("session", {
      id: "session-1",
      userId: "user-1",
      token: "token-1",
      activeOrganizationId: null,
    });
    c.set("apiKeyId", null);
    c.set("apiKeyOwnerId", null);
    c.set("apiKeyScopes", null);
    c.set("requestId", "request-1");
    await next();
  });
  app.route("/", billingRoute);

  try {
    const transactionsResponse = await app.request("/billing/transactions");
    const transactions = (await transactionsResponse.json()) as { data: unknown[] };
    assert.equal(transactionsResponse.status, 200);
    assert.deepEqual(transactions.data, []);

    assert.equal(
      (
        await app.request("/billing/checkout", {
          method: "POST",
          body: JSON.stringify({ planId: "starter", interval: "monthly" }),
          headers: { "content-type": "application/json" },
        })
      ).status,
      409,
    );
    assert.equal((await app.request("/billing/portal")).status, 409);
  } finally {
    if (previousMode === undefined) {
      delete process.env.DEPLOYMENT_MODE;
    } else {
      process.env.DEPLOYMENT_MODE = previousMode;
    }
  }
});
