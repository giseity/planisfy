# Console App

Customer Next.js app for dashboard, styles, tilesets, API keys, usage, operations, platform readiness, billing, organization, and settings.

Runs in development through `pnpm --filter console dev` and in Compose on `http://localhost:3001`.

Important config: database/auth secrets, OAuth credentials, `NEXT_PUBLIC_API_URL`, `CONSOLE_API_INTERNAL_ORIGIN`, public app/admin/marketing URLs, and optional ZeptoMail.

Commands: `pnpm --filter console dev`, `check-types`, `lint`, `test`, `build`, `start`.
