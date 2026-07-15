import { loadWorkspaceEnv } from "./node";

if (!loadWorkspaceEnv()) {
  loadWorkspaceEnv({ filename: ".env.example" });
}
