# Deployment Modes

Planisfy recognizes two deployment modes through `DEPLOYMENT_MODE`.

## self_host

`self_host` is the default in `.env.example`. It allows local filesystem storage, dry-run email behavior, missing billing credentials, and optional supervisor/MinIO profiles. The stack should boot even when map datasets are missing, with degraded health/preflight messages.

## managed

`managed` uses the same code paths but requires production provider configuration: Dodo Payments for billing, Resend for email, and R2/S3-compatible object storage. `@planisfy/platform-policy` and `/setup/preflight` expose which capabilities are configured, degraded, unavailable, or hidden.

## Shared Runtime

Both modes use the same API, Console, Admin, Docs, Marketing, worker, database schema, publication model, and public API route shapes. Differences are policy and configuration, not separate codebases.
