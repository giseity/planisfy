# Security

## Authentication

Planisfy uses Better Auth sessions and API keys. API keys must start with `pk_`, are stored as hashes, can expire, can be scoped, and can be restricted to browser origins through Origin or Referer checks.

## Route Protection

- Published assets under `/tiles/*`, `/styles/v1/*`, and `/fonts/*` allow anonymous public reads and optional identity attachment.
- Service APIs require API key or session auth.
- `/console/*` requires a session.
- `/internal/*` requires `INTERNAL_API_SECRET`.
- Dodo webhooks verify the configured webhook secret.

## Secrets

Production installs must set strong `BETTER_AUTH_SECRET` and `INTERNAL_API_SECRET`. Source credentials should use `SOURCE_CREDENTIAL_ENCRYPTION_KEY`; local development falls back to existing auth/internal secrets.

`ALLOW_PRIVATE_SOURCE_URLS=false` should remain the default unless a trusted private-network import environment is intentionally configured.
