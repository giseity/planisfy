# Deployment Modes

Planisfy recognizes two deployment modes through `DEPLOYMENT_MODE`.

## self_host

`self_host` is the default in `.env.example`. It uses MinIO/S3-compatible object storage by default, allows local filesystem storage only as a demo fallback, permits dry-run email behavior and missing billing credentials, and keeps supervisor/root-agent controls enabled by deployment mode. The stack should boot even when map datasets are missing, with degraded health/preflight messages.

## managed

`managed` uses the same code paths but requires production provider configuration: Dodo Payments for billing, ZeptoMail for email, and R2/S3-compatible object storage. `@planisfy/platform-policy` and `/setup/preflight` expose which capabilities are configured, degraded, unavailable, or hidden.

## Shared Runtime

Both modes use the same API, Console, Admin, Docs, Marketing, worker, database schema, publication model, and public API route shapes. Differences are policy and configuration, not separate codebases.
