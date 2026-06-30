import { describe, expect, it } from "vitest";
import {
  getDeploymentPolicy,
  isCapabilityRequired,
  isCapabilityVisible,
} from "../src/index";

describe("platform policy", () => {
  it("keeps self-host local storage, supervisor, root-agent compute, and support bundles visible", () => {
    expect(isCapabilityVisible("self_host", "localStorage")).toBe(true);
    expect(isCapabilityVisible("self_host", "selfHostSupervisor")).toBe(true);
    expect(isCapabilityVisible("self_host", "rootAgentCompute")).toBe(true);
    expect(isCapabilityVisible("self_host", "supportBundles")).toBe(true);
  });

  it("requires managed billing, email, R2-compatible storage, usage billing, and API key gating", () => {
    expect(isCapabilityRequired("managed", "billing")).toBe(true);
    expect(isCapabilityRequired("managed", "transactionalEmail")).toBe(true);
    expect(isCapabilityRequired("managed", "managedStorage")).toBe(true);
    expect(isCapabilityRequired("managed", "usageBilling")).toBe(true);
    expect(isCapabilityRequired("managed", "apiKeyCreation")).toBe(true);
  });

  it("hides self-host-only operations from managed policy", () => {
    const managed = getDeploymentPolicy("managed");
    const rootAgentCompute = managed.capabilities.find(
      (capability) => capability.id === "rootAgentCompute",
    );
    const supervisor = managed.capabilities.find(
      (capability) => capability.id === "selfHostSupervisor",
    );

    expect(rootAgentCompute?.policy).toBe("hidden");
    expect(rootAgentCompute?.visible).toBe(false);
    expect(supervisor?.policy).toBe("hidden");
    expect(supervisor?.visible).toBe(false);
  });
});
