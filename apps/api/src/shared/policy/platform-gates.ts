import type { DeploymentMode } from "@planisfy/platform-policy";

export interface PlatformGateDenial {
  code: "EMAIL_VERIFICATION_REQUIRED" | "CAPABILITY_UNAVAILABLE";
  message: string;
  status: 403;
}

export function apiKeyMutationGate(params: {
  deploymentMode: DeploymentMode;
  emailVerified: boolean;
}): PlatformGateDenial | null {
  if (params.deploymentMode !== "managed" || params.emailVerified) return null;

  return {
    code: "EMAIL_VERIFICATION_REQUIRED",
    message: "Verify your email before creating or changing API keys.",
    status: 403,
  };
}
