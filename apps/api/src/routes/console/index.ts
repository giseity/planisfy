import { Hono } from "hono";
import type { AuthEnv } from "../../middleware/auth";
import { auditRoute } from "../audit";
import { billingRoute } from "../billing";
import { dashboardRoute } from "../dashboard";
import { executionTargetsRoute } from "../execution-targets";
import { importsRoute } from "../imports";
import { keysRoute } from "../keys";
import { operationsRoute } from "../operations";
import { profileRoute } from "../profile";
import { resourcesRoute } from "../resources";
import { securityRoute } from "../security";
import { setupRoute } from "../setup";
import { stylesRoute } from "../styles";
import { usageRoute } from "../usage";

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
