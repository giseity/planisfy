import assert from "node:assert/strict";
import test from "node:test";
import { planFeatureGate } from "./plan-gates";

test("free accounts need an upgrade for team collaboration", () => {
  const denial = planFeatureGate({ plan: "free", feature: "team" });

  assert.equal(denial?.status, 402);
  assert.equal(denial?.code, "PLAN_UPGRADE_REQUIRED");
});

test("starter includes team collaboration but not audit logs", () => {
  assert.equal(planFeatureGate({ plan: "starter", feature: "team" }), null);
  assert.equal(
    planFeatureGate({ plan: "starter", feature: "audit" })?.code,
    "PLAN_UPGRADE_REQUIRED",
  );
});

test("scale includes audit and operations controls", () => {
  assert.equal(planFeatureGate({ plan: "scale", feature: "audit" }), null);
  assert.equal(planFeatureGate({ plan: "scale", feature: "operations" }), null);
});

test("platform includes custom execution targets", () => {
  assert.equal(
    planFeatureGate({ plan: "platform", feature: "customExecutionTargets" }),
    null,
  );
});
