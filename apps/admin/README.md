# Admin App

Internal Next.js operations app for accounts, users, jobs, storage, health, usage, audit, and self-host upgrades.

Runs in development through `pnpm --filter admin dev` and in Compose on `http://localhost:3003`.

Important config: `DATABASE_URL`, auth secrets, OAuth credentials, public app/API URLs, and optional `SUPERVISOR_URL`/`SUPERVISOR_TOKEN`.

Commands: `pnpm --filter admin dev`, `check-types`, `lint`, `build`, `start`.
