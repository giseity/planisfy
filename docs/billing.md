# Billing

Billing support is implemented around Dodo Payments.

## Self-Host Mode

Billing configuration is optional. Console can show billing capability as unavailable or degraded without blocking the local product loop.

## Managed Mode

Managed mode requires Dodo configuration through `DODO_PAYMENTS_API_KEY`, `DODO_PAYMENTS_API_URL`, `DODO_PAYMENTS_ENVIRONMENT`, `DODO_PAYMENTS_WEBHOOK_SECRET`, and product IDs.

## Runtime

The API owns checkout/session creation and webhook handling. Webhooks are mounted at `/webhooks/dodo` and update billing/subscription ledger rows after verification. Plan limits feed request-per-minute and monthly quota checks.
