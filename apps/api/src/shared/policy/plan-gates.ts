import { createMiddleware } from "hono/factory";
import {
  planIncludesFeature,
  type PlanFeature,
  type PlanSlug,
} from "@planisfy/types";
import { getAccountPlan } from "../../domains/billing/billing";
import { env } from "../../env";
import type { AuthEnv } from "../../middleware/auth";
import type { DeploymentMode } from "@planisfy/platform-policy";

export interface PlanGateDenial {
  code: "PLAN_UPGRADE_REQUIRED";
  message: string;
  requiredFeature: PlanFeature;
  plan: PlanSlug;
  status: 402;
}

export function planFeatureGate(params: {
  plan: PlanSlug;
  feature: PlanFeature;
}): PlanGateDenial | null {
  if (planIncludesFeature(params.plan, params.feature)) return null;

  return {
    code: "PLAN_UPGRADE_REQUIRED",
    message: planFeatureMessage(params.feature),
    requiredFeature: params.feature,
    plan: params.plan,
    status: 402,
  };
}

export function deploymentPlanFeatureGate(params: {
  deploymentMode: DeploymentMode;
  plan: PlanSlug;
  feature: PlanFeature;
}): PlanGateDenial | null {
  if (params.deploymentMode !== "managed") return null;
  return planFeatureGate({ plan: params.plan, feature: params.feature });
}

export function requirePlanFeature(feature: PlanFeature) {
  return createMiddleware<AuthEnv>(async (c, next) => {
    const ownerId = c.get("ownerId");
    const plan = await getAccountPlan(ownerId);
    const denial = planFeatureGate({ plan, feature });

    if (denial) {
      return c.json(
        {
          error: {
            code: denial.code,
            message: denial.message,
            details: {
              requiredFeature: denial.requiredFeature,
              plan: denial.plan,
            },
          },
        },
        denial.status,
      );
    }

    await next();
  });
}

export function requireManagedPlanFeature(feature: PlanFeature) {
  return createMiddleware<AuthEnv>(async (c, next) => {
    const ownerId = c.get("ownerId");
    const plan = await getAccountPlan(ownerId);
    const denial = deploymentPlanFeatureGate({
      deploymentMode: env.DEPLOYMENT_MODE,
      plan,
      feature,
    });

    if (denial) {
      return c.json(
        {
          error: {
            code: denial.code,
            message: denial.message,
            details: {
              requiredFeature: denial.requiredFeature,
              plan: denial.plan,
            },
          },
        },
        denial.status,
      );
    }

    await next();
  });
}

export async function managedPlanFeatureDenial(
  ownerId: string,
  feature: PlanFeature,
): Promise<PlanGateDenial | null> {
  const plan = await getAccountPlan(ownerId);
  return deploymentPlanFeatureGate({
    deploymentMode: env.DEPLOYMENT_MODE,
    plan,
    feature,
  });
}

export function planGateErrorPayload(denial: PlanGateDenial) {
  return {
    error: {
      code: denial.code,
      message: denial.message,
      details: {
        requiredFeature: denial.requiredFeature,
        plan: denial.plan,
      },
    },
  };
}

function planFeatureMessage(feature: PlanFeature) {
  if (feature === "team") {
    return "Team collaboration requires the Starter plan or higher.";
  }
  if (feature === "audit") {
    return "Audit logs require the Scale plan or higher.";
  }
  if (feature === "operations") {
    return "Operations controls require the Scale plan or higher.";
  }
  if (feature === "routingBuilds") {
    return "Routing graph builds require the Scale plan or higher.";
  }
  if (feature === "planetScaleBuilds") {
    return "Planet-scale routing builds require the Platform plan.";
  }
  if (feature === "externalRootAgents") {
    return "External root-agent compute requires the Platform plan.";
  }
  if (feature === "selfHostSupport") {
    return "Self-host support requires the Platform plan.";
  }
  return "This feature is not included in the current plan.";
}
