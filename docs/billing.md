# Billing

Billing support is implemented around Dodo Payments.

## Self-Host Mode

Billing configuration is optional. Console can show billing capability as unavailable or degraded without blocking the local product loop.

## Managed Mode

Managed mode requires Dodo configuration through `DODO_PAYMENTS_API_KEY`,
`DODO_PAYMENTS_API_URL`, `DODO_PAYMENTS_ENVIRONMENT`,
`DODO_PAYMENTS_WEBHOOK_SECRET`, `DODO_PAYMENTS_BRAND_ID`, and product IDs for
paid self-serve plans:
`DODO_STARTER_MONTHLY_PRODUCT_ID`, `DODO_STARTER_YEARLY_PRODUCT_ID`,
`DODO_SCALE_MONTHLY_PRODUCT_ID`, and `DODO_SCALE_YEARLY_PRODUCT_ID`.

`DODO_PRO_PRODUCT_ID` and `DODO_ENTERPRISE_PRODUCT_ID` are legacy monthly
fallbacks while older deployments migrate to Starter and Scale naming.

## Runtime

The API owns checkout/session creation and webhook handling. Webhooks are
mounted at `/webhooks/dodo` and update billing/subscription ledger rows after
signature verification and brand filtering. Free requires no card. Starter and
Scale support monthly and yearly checkout. Plan limits feed request-per-minute
and monthly Planisfy credit quota checks.
