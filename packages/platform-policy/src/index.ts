export const deploymentModes = ["self_host", "managed"] as const;

export type DeploymentMode = (typeof deploymentModes)[number];

export const capabilityIds = [
  "billing",
  "transactionalEmail",
  "managedStorage",
  "localStorage",
  "selfHostSupervisor",
  "customExecutionTargets",
  "publicSignup",
  "apiKeyCreation",
  "usageBilling",
  "supportBundles",
  "releaseUpgrades",
  "platformWorkerRuntime",
] as const;

export type CapabilityId = (typeof capabilityIds)[number];

export type CapabilityRequirement =
  | "required"
  | "optional"
  | "hidden"
  | "unavailable";

export interface CapabilityDefinition {
  id: CapabilityId;
  label: string;
  description: string;
}

export interface CapabilityPolicy extends CapabilityDefinition {
  policy: CapabilityRequirement;
  required: boolean;
  visible: boolean;
}

export interface DeploymentPolicy {
  mode: DeploymentMode;
  capabilities: CapabilityPolicy[];
}

const capabilityDefinitions = {
  billing: {
    id: "billing",
    label: "Billing",
    description: "Plan billing, checkout, subscriptions, and webhook state.",
  },
  transactionalEmail: {
    id: "transactionalEmail",
    label: "Transactional email",
    description: "Account verification and product lifecycle email delivery.",
  },
  managedStorage: {
    id: "managedStorage",
    label: "Managed object storage",
    description: "Platform-operated R2-compatible artifact storage.",
  },
  localStorage: {
    id: "localStorage",
    label: "Local object storage",
    description: "Self-host local artifact storage and Martin source aliases.",
  },
  selfHostSupervisor: {
    id: "selfHostSupervisor",
    label: "Self-host supervisor",
    description: "Local upgrade, backup, restore, and support operations.",
  },
  customExecutionTargets: {
    id: "customExecutionTargets",
    label: "Custom execution targets",
    description: "Customer-managed local, AWS Batch, or GCP Batch workers.",
  },
  publicSignup: {
    id: "publicSignup",
    label: "Public signup",
    description: "User signup and Console account onboarding.",
  },
  apiKeyCreation: {
    id: "apiKeyCreation",
    label: "API key creation",
    description: "Console-managed API key creation and rotation.",
  },
  usageBilling: {
    id: "usageBilling",
    label: "Usage and quota",
    description: "Request metering, plan limits, and quota reporting.",
  },
  supportBundles: {
    id: "supportBundles",
    label: "Support bundles",
    description: "Self-host diagnostic bundle and operator handoff scripts.",
  },
  releaseUpgrades: {
    id: "releaseUpgrades",
    label: "Release upgrades",
    description: "Release manifest, backup, migration, and upgrade checks.",
  },
  platformWorkerRuntime: {
    id: "platformWorkerRuntime",
    label: "Platform worker runtime",
    description: "Planisfy-operated processing jobs and worker dispatch.",
  },
} satisfies Record<CapabilityId, CapabilityDefinition>;

const requirements = {
  self_host: {
    billing: "optional",
    transactionalEmail: "optional",
    managedStorage: "optional",
    localStorage: "required",
    selfHostSupervisor: "optional",
    customExecutionTargets: "optional",
    publicSignup: "required",
    apiKeyCreation: "required",
    usageBilling: "optional",
    supportBundles: "optional",
    releaseUpgrades: "required",
    platformWorkerRuntime: "required",
  },
  managed: {
    billing: "required",
    transactionalEmail: "required",
    managedStorage: "required",
    localStorage: "unavailable",
    selfHostSupervisor: "hidden",
    customExecutionTargets: "hidden",
    publicSignup: "required",
    apiKeyCreation: "required",
    usageBilling: "required",
    supportBundles: "hidden",
    releaseUpgrades: "hidden",
    platformWorkerRuntime: "required",
  },
} satisfies Record<DeploymentMode, Record<CapabilityId, CapabilityRequirement>>;

export function isDeploymentMode(value: unknown): value is DeploymentMode {
  return value === "self_host" || value === "managed";
}

export function parseDeploymentMode(value: unknown): DeploymentMode {
  return isDeploymentMode(value) ? value : "self_host";
}

export function getDeploymentPolicy(mode: DeploymentMode): DeploymentPolicy {
  return {
    mode,
    capabilities: capabilityIds.map((id) => getCapabilityPolicy(mode, id)),
  };
}

export function getCapabilityPolicy(
  mode: DeploymentMode,
  id: CapabilityId,
): CapabilityPolicy {
  const policy = requirements[mode][id];
  return {
    ...capabilityDefinitions[id],
    policy,
    required: policy === "required",
    visible: policy !== "hidden" && policy !== "unavailable",
  };
}

export function isCapabilityRequired(
  mode: DeploymentMode,
  id: CapabilityId,
): boolean {
  return requirements[mode][id] === "required";
}

export function isCapabilityVisible(
  mode: DeploymentMode,
  id: CapabilityId,
): boolean {
  return getCapabilityPolicy(mode, id).visible;
}

export function isManagedMode(mode: DeploymentMode): boolean {
  return mode === "managed";
}
