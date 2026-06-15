# Self-Host Supervisor

Optional local-only Hono API for self-host preflight, backup, upgrade apply, rollback, and operation status.

Runs in Compose only with the `with-supervisor` profile and is bound to `127.0.0.1:4010`.

Important config: `SUPERVISOR_TOKEN`, `PLANISFY_ROOT_DIR`, `SUPERVISOR_STATE_DIR`, `SUPERVISOR_COMPOSE_FILE`, and `SUPERVISOR_ENV_FILE`.

Commands: `pnpm --filter self-host-supervisor dev`, `check-types`, `lint`, `test`, `build`, `start`.
