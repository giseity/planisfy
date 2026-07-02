import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isCheckoutPlan,
  lookupSubscriptionProduct,
  resolveSubscriptionProduct,
} from "./subscription-products";

const productEnv = {
  DODO_STARTER_MONTHLY_PRODUCT_ID: "prod_starter_monthly",
  DODO_STARTER_YEARLY_PRODUCT_ID: "prod_starter_yearly",
  DODO_SCALE_MONTHLY_PRODUCT_ID: "prod_scale_monthly",
  DODO_SCALE_YEARLY_PRODUCT_ID: "prod_scale_yearly",
};

describe("subscription product catalog", () => {
  it("resolves configured checkout plans to Dodo products", () => {
    assert.deepEqual(resolveSubscriptionProduct("starter", "monthly", productEnv), {
      planId: "starter",
      interval: "monthly",
      productKey: "starter",
      productLabel: "Starter Monthly Subscription",
      dodoProductId: "prod_starter_monthly",
    });
    assert.deepEqual(resolveSubscriptionProduct("scale", "yearly", productEnv), {
      planId: "scale",
      interval: "yearly",
      productKey: "scale",
      productLabel: "Scale Annual Subscription",
      dodoProductId: "prod_scale_yearly",
    });
  });

  it("treats missing product IDs as unavailable", () => {
    assert.equal(
      resolveSubscriptionProduct("starter", "monthly", {
        ...productEnv,
        DODO_STARTER_MONTHLY_PRODUCT_ID: "",
      }),
      null,
    );
  });

  it("reverse maps known Dodo product IDs", () => {
    assert.equal(
      lookupSubscriptionProduct("prod_scale_yearly", productEnv)?.planId,
      "scale",
    );
    assert.equal(lookupSubscriptionProduct("prod_unknown", productEnv), null);
  });

  it("keeps free out of checkout", () => {
    assert.equal(isCheckoutPlan("free"), false);
    assert.equal(isCheckoutPlan("starter"), true);
    assert.equal(isCheckoutPlan("platform"), false);
  });
});
