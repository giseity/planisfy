import { nextJsConfig } from "../../packages/eslint-config/next.js"

/** @type {import("eslint").Linter.Config} */
export default [
  {
    ignores: [".source/**", "source.config.js"],
  },
  ...nextJsConfig,
]
