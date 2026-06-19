import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isCheckoutPlan,
  lookupSubscriptionProduct,
  resolveSubscriptionProduct,
} from "./subscription-products";

const productEnv = {
  DODO_PRO_PRODUCT_ID: "prod_pro",
  DODO_ENTERPRISE_PRODUCT_ID: "prod_enterprise",
};

describe("subscription product catalog", () => {
  it("resolves configured checkout plans to Dodo products", () => {
    assert.deepEqual(resolveSubscriptionProduct("pro", productEnv), {
      planId: "pro",
      productKey: "pro",
      productLabel: "Pro Subscription",
      dodoProductId: "prod_pro",
    });
    assert.deepEqual(resolveSubscriptionProduct("enterprise", productEnv), {
      planId: "enterprise",
      productKey: "enterprise",
      productLabel: "Enterprise Subscription",
      dodoProductId: "prod_enterprise",
    });
  });

  it("treats missing product IDs as unavailable", () => {
    assert.equal(
      resolveSubscriptionProduct("pro", {
        DODO_PRO_PRODUCT_ID: "",
        DODO_ENTERPRISE_PRODUCT_ID: "prod_enterprise",
      }),
      null,
    );
  });

  it("reverse maps known Dodo product IDs", () => {
    assert.equal(
      lookupSubscriptionProduct("prod_enterprise", productEnv)?.planId,
      "enterprise",
    );
    assert.equal(lookupSubscriptionProduct("prod_unknown", productEnv), null);
  });

  it("keeps free out of checkout", () => {
    assert.equal(isCheckoutPlan("free"), false);
    assert.equal(isCheckoutPlan("pro"), true);
  });
});
