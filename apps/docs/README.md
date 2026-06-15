# Docs App

Fumadocs/Next.js public documentation app. Source content lives under `content/docs`.

Runs in development through `pnpm --filter docs dev` and in Compose on `http://localhost:3002`.

Important config: standard Next.js public URLs and auth/database values needed by the shared app shell.

Commands: `pnpm --filter docs dev`, `check-types`, `build`, `start`. `check-types` runs Fumadocs generation before TypeScript.
