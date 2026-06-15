# Billing

Planisfy uses subscription plans with monthly usage units. It does not use a
prepaid credit wallet, credit grants, rollover balances, or free trials.

## Billing Model

Plans define a monthly allowance through `monthlyUnits`. API requests consume
weighted units from that allowance based on endpoint category. The allowance is
for the current monthly period and is not stored as a spendable balance.

The Free plan is the low-friction entry path. Free users receive a small monthly
usage quota instead of a time-limited trial. Paid plans increase the monthly
quota and resource limits.

## Dodo Payments

Managed checkout is backed by Dodo Payments subscription products. The local
database stores normalized billing transaction records for checkout and webhook
reconciliation, including provider product IDs, product keys, customer IDs,
webhook IDs, and normalized transaction statuses.

Payment webhooks record transaction state. Subscription webhooks update the
local subscription state. Unknown Dodo products do not mutate local billing
state.

## Non-Goals

- No credit ledger.
- No purchased credit packs.
- No FIFO credit consumption.
- No usage rollover.
- No free-trial subscription state.
