# Managed Launch Runbook

Use this runbook before promoting managed mode to public traffic.

## Protected Environment

The GitHub environment must be named `managed-staging` and require human approval for `workflow_dispatch` runs.

Required proof:

- `Managed Staging Proof` workflow completed against the protected environment.
- `MANAGED_STAGING_API_URL` and `MANAGED_STAGING_CONSOLE_URL` are public HTTPS origins.
- API CORS accepts the configured Console origin.
- `/health`, `/setup/preflight`, and `/internal/managed-smoke` pass with internal authorization.
- Full browser product loop passes against staging with a managed test user.

## Provider Dashboards

Capture screenshots or exported status evidence for:

- R2 bucket, public URL, lifecycle/retention settings, and access-key scope.
- Dodo test-mode products, webhook endpoint, and recent webhook delivery.
- Resend domain verification, sender identity, and recent delivery.
- Database backups and point-in-time recovery status.
- Redis persistence/HA setting, if the provider exposes it.

## Ingress

Before sign-off:

- API and Console must use HTTPS.
- API must not expose internal-only routes without `x-internal-secret`.
- Console origin must match `NEXT_PUBLIC_CONSOLE_URL`.
- API origin must match `NEXT_PUBLIC_API_URL`.
- Product-loop browser smoke must render through public ingress, not private service URLs.

## Operator Sign-Off

Record:

- Workflow run URL.
- API and Console release SHA.
- Preflight summary with zero blocking checks.
- Storage, billing, and email smoke output.
- Known degraded optional services, if any.
- Approver name and timestamp.
