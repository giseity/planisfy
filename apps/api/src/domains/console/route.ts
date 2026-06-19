import { Hono } from "hono";
import type { AuthEnv } from "../../middleware/auth";
import { auditRoute } from "../audit/route";
import { billingRoute } from "../billing/route";
import { dashboardRoute } from "../dashboard/route";
import { executionTargetsRoute } from "../execution-targets/route";
import { importsRoute } from "../imports/route";
import { keysRoute } from "../keys/route";
import { operationsRoute } from "../operations/route";
import { profileRoute } from "../profile/route";
import { resourcesRoute } from "../resources/route";
import { securityRoute } from "../security/route";
import { setupRoute } from "../setup/route";
import { stylesRoute } from "../styles/route";
import { usageRoute } from "../usage/route";

export const consoleRoute = new Hono<AuthEnv>()
  .route("/", dashboardRoute)
  .route("/", stylesRoute)
  .route("/", auditRoute)
  .route("/", keysRoute)
  .route("/", usageRoute)
  .route("/", billingRoute)
  .route("/", profileRoute)
  .route("/", securityRoute)
  .route("/", resourcesRoute)
  .route("/", importsRoute)
  .route("/", executionTargetsRoute)
  .route("/", operationsRoute)
  .route("/", setupRoute);

export type ConsoleAppType = typeof consoleRoute;
