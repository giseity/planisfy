# Deployment Modes

Planisfy v1 has two official deployment modes:

- `DEPLOYMENT_MODE=self_host`
- `DEPLOYMENT_MODE=managed`

Both modes share the same API/resource/publishing/usage core. The boundary is
defined by `@planisfy/platform-policy` and exposed through `/setup/preflight` as
`deploymentMode` plus `capabilities[]`.

## App Surfaces And Auth Origin

Planisfy v1 keeps three web surfaces distinct:

- Marketing/public: public entry pages and managed-mode auth pages.
- Console: authenticated customer dashboard, operational pages, and Studio.
- Admin: internal/super-admin operations UI.

`BETTER_AUTH_URL` remains the canonical server auth handler URL. Frontend apps
use `NEXT_PUBLIC_AUTH_ORIGIN` to decide where unauthenticated users should sign
in. In managed mode this should point at the Marketing/public origin. In
self-host and local development it defaults to the Console origin, so a simple
single-console auth workflow keeps working.

## Self-Host

Self-host is the default mode. It keeps local storage, the self-host supervisor,
support bundles, release upgrade checks, custom execution targets, and worker
profiles visible.

Required core env:

- `BETTER_AUTH_SECRET`
- `INTERNAL_API_SECRET`
- `DATABASE_URL`
- Redis connection env
- `STORAGE_PROVIDER=local` with `LOCAL_STORAGE_PATH`, or another configured
  storage provider for advanced self-host installs

Optional env:

- `RESEND_API_KEY`; without it, local email delivery is dry-run/degraded.
- Dodo Payments env; without it, checkout is unavailable.
- `SUPERVISOR_URL` and `SUPERVISOR_TOKEN`; without them, local upgrade
  automation is unavailable but the app still runs.
- `NEXT_PUBLIC_AUTH_ORIGIN`; defaults to the Console origin for local/self-host
  installs.

## Managed

Managed mode is platform-operated for v1. Users can sign up and use the Console
on the Free plan, but API key creation and rotation require verified email.
Customer-created execution targets and worker profiles are hidden in Console and
rejected by the API with `CAPABILITY_UNAVAILABLE`.

Required managed production env:

- `DEPLOYMENT_MODE=managed`
- strong `BETTER_AUTH_SECRET`
- strong `INTERNAL_API_SECRET`
- `RESEND_API_KEY`
- `DODO_PAYMENTS_API_KEY`
- `DODO_PAYMENTS_WEBHOOK_SECRET`
- `DODO_PRO_PRODUCT_ID`
- `STORAGE_PROVIDER=r2`
- `R2_BUCKET`
- `R2_ENDPOINT` or `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_PUBLIC_URL`
- `NEXT_PUBLIC_AUTH_ORIGIN`, set to the public/Marketing origin that mounts
  `/sign-in`, `/sign-up`, and `/reset-password`

Managed readiness reports billing, transactional email, R2-compatible storage,
usage/quota, public signup, API key creation, and the platform worker runtime as
required capabilities.

## Later Modes

Hybrid/private cloud is not an official v1 mode. Cloud adapter code can remain
in the repository, but customer-managed `aws_batch` and `gcp_batch` execution
targets are self-host or internal-only until a later mode is explicitly defined.
