import { nextJsConfig } from "../../packages/eslint-config/next.js"

/** @type {import("eslint").Linter.Config} */
export default [
  ...nextJsConfig,
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@planisfy/database",
              message:
                "Console product code must use the API contract/client boundary instead of importing the database package.",
            },
            {
              name: "@planisfy/auth",
              message:
                "Console product code must use explicit auth UI/client subpaths instead of importing the auth package root.",
            },
            {
              name: "@planisfy/auth/server",
              message:
                "Console product code must use client auth helpers or API routes instead of importing the server auth instance.",
            },
            {
              name: "drizzle-orm",
              message:
                "Console product code must not query the database directly; add or use a Console API endpoint.",
            },
          ],
          patterns: [
            {
              group: [
                "@planisfy/database/*",
                "drizzle-orm/*",
                "api/*",
                "../api/*",
                "../../api/*",
                "../../../api/*",
                "../../../../api/*",
                "../../apps/api/*",
                "../../../apps/api/*",
                "../../../../apps/api/*",
              ],
              message:
                "Console product code must depend on published workspace contracts and HTTP clients, not API internals or database internals.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["app/api/auth/**/route.ts"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
]
