import assert from "node:assert/strict";
import test from "node:test";
import { deploymentPlanFeatureGate, planFeatureGate } from "./plan-gates";

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

test("scale includes regional routing builds but not planet-scale builds", () => {
  assert.equal(planFeatureGate({ plan: "scale", feature: "routingBuilds" }), null);
  assert.equal(
    planFeatureGate({ plan: "scale", feature: "planetScaleBuilds" })?.code,
    "PLAN_UPGRADE_REQUIRED",
  );
});

test("platform includes planet-scale builds and external root agents", () => {
  assert.equal(planFeatureGate({ plan: "platform", feature: "planetScaleBuilds" }), null);
  assert.equal(
    planFeatureGate({ plan: "platform", feature: "externalRootAgents" }),
    null,
  );
});

test("self-host deployment bypasses hosted subscription feature gates", () => {
  assert.equal(
    deploymentPlanFeatureGate({
      deploymentMode: "self_host",
      plan: "free",
      feature: "audit",
    }),
    null,
  );
});

test("managed deployment enforces hosted subscription feature gates", () => {
  assert.equal(
    deploymentPlanFeatureGate({
      deploymentMode: "managed",
      plan: "free",
      feature: "audit",
    })?.code,
    "PLAN_UPGRADE_REQUIRED",
  );
});
