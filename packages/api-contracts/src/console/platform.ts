import { z } from "zod";
import type {
  CapabilityId,
  CapabilityRequirement,
  DeploymentMode,
} from "@planisfy/platform-policy";

export const platformPreflightStatusSchema = z.enum(["pass", "warn", "fail"]);
export const platformPreflightSeveritySchema = z.enum([
  "required",
  "recommended",
  "optional",
]);
export const platformCapabilityStatusSchema = z.enum([
  "configured",
  "degraded",
  "unavailable",
  "hidden",
]);

export type PlatformPreflightStatus = z.infer<
  typeof platformPreflightStatusSchema
>;
export type PlatformPreflightSeverity = z.infer<
  typeof platformPreflightSeveritySchema
>;
export type PlatformCapabilityStatus = z.infer<
  typeof platformCapabilityStatusSchema
>;

export interface PlatformPreflightCheck {
  id: string;
  label: string;
  group: string;
  status: PlatformPreflightStatus;
  severity: PlatformPreflightSeverity;
  message: string;
  action?: string;
  value?: string | number | boolean | null;
}

export interface PlatformPreflightGroup {
  name: string;
  pass: number;
  warn: number;
  fail: number;
  checks: PlatformPreflightCheck[];
}

export interface PlatformCapability {
  id: CapabilityId;
  label: string;
  description: string;
  policy: CapabilityRequirement;
  required: boolean;
  visible: boolean;
  status: PlatformCapabilityStatus;
  message: string;
  action?: string;
  value?: string | number | boolean | null;
}

export interface PlatformPreflight {
  generatedAt: string;
  environment: string;
  appVersion: string;
  deploymentMode: DeploymentMode;
  capabilities: PlatformCapability[];
  summary: {
    pass: number;
    warn: number;
    fail: number;
    blocking: number;
  };
  groups: PlatformPreflightGroup[];
  checks: PlatformPreflightCheck[];
}
