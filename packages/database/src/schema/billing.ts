import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { accounts } from './identity'
import {
  billingProviderEnum,
  billingTransactionStatusEnum,
  billingTransactionTypeEnum,
  subscriptionStatusEnum,
} from './primitives'

export const billingCustomers = pgTable(
  'billing_customers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    provider: billingProviderEnum('provider').notNull().default('DODO'),
    providerCustomerId: text('provider_customer_id').notNull(),
    email: text('email'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('billing_customers_account_provider_unique').on(table.accountId, table.provider),
    uniqueIndex('billing_customers_provider_id_unique').on(
      table.provider,
      table.providerCustomerId
    ),
  ]
)

export const plans = pgTable('plans', {
  id: varchar('id', { length: 64 }).primaryKey(),
  name: varchar('name', { length: 128 }).notNull(),
  limits: jsonb('limits').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    planId: varchar('plan_id', { length: 64 })
      .notNull()
      .references(() => plans.id, { onDelete: 'restrict' }),
    status: subscriptionStatusEnum('status').notNull().default('INACTIVE'),
    currentPeriodStart: timestamp('current_period_start', {
      withTimezone: true,
    }),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    billingInterval: varchar('billing_interval', { length: 16 }).notNull().default('monthly'),
    providerSubscriptionId: text('provider_subscription_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('subscriptions_account_idx').on(table.accountId),
    index('subscriptions_status_idx').on(table.status),
    uniqueIndex('subscriptions_provider_subscription_unique').on(table.providerSubscriptionId),
  ]
)

export const billingTransactions = pgTable(
  'billing_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    initiatedByAccountId: uuid('initiated_by_account_id').references(() => accounts.id, {
      onDelete: 'set null',
    }),
    provider: billingProviderEnum('provider').notNull().default('DODO'),
    type: billingTransactionTypeEnum('type').notNull().default('SUBSCRIPTION'),
    status: billingTransactionStatusEnum('status').notNull().default('CHECKOUT_CREATED'),
    providerCheckoutId: text('provider_checkout_id'),
    providerOrderId: text('provider_order_id'),
    providerCustomerId: text('provider_customer_id'),
    providerCustomerExternalId: text('provider_customer_external_id'),
    providerProductId: text('provider_product_id').notNull(),
    productKey: text('product_key').notNull(),
    productLabel: text('product_label').notNull(),
    amountCents: integer('amount_cents'),
    currency: varchar('currency', { length: 8 }),
    metadata: jsonb('metadata'),
    lastWebhookId: text('last_webhook_id'),
    lastWebhookType: text('last_webhook_type'),
    lastWebhookAt: timestamp('last_webhook_at', { withTimezone: true }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('billing_transactions_account_idx').on(table.accountId),
    uniqueIndex('billing_transactions_checkout_unique').on(
      table.provider,
      table.providerCheckoutId
    ),
    uniqueIndex('billing_transactions_order_unique').on(table.provider, table.providerOrderId),
  ]
)

export const billingWebhookEvents = pgTable(
  'billing_webhook_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    provider: billingProviderEnum('provider').notNull().default('DODO'),
    webhookId: text('webhook_id').notNull(),
    eventType: text('event_type'),
    payload: jsonb('payload'),
    result: jsonb('result'),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('billing_webhook_events_provider_id_unique').on(table.provider, table.webhookId),
  ]
)

export const managedContracts = pgTable(
  'managed_contracts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    planId: varchar('plan_id', { length: 64 })
      .notNull()
      .references(() => plans.id, { onDelete: 'restrict' }),
    status: varchar('status', { length: 24 }).notNull().default('ACTIVE'),
    includedMonthlyUnits: integer('included_monthly_units').notNull(),
    overageEnabled: boolean('overage_enabled').notNull().default(false),
    overageUnitPriceMicros: integer('overage_unit_price_micros'),
    hardMonthlySpendCapCents: integer('hard_monthly_spend_cap_cents'),
    currency: varchar('currency', { length: 8 }).notNull().default('USD'),
    providerSubscriptionId: text('provider_subscription_id'),
    effectiveAt: timestamp('effective_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    assignedByAccountId: uuid('assigned_by_account_id').references(() => accounts.id, {
      onDelete: 'set null',
    }),
    assignmentReason: text('assignment_reason').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('managed_contracts_account_idx').on(table.accountId),
    uniqueIndex('managed_contracts_active_account_unique')
      .on(table.accountId)
      .where(sql`${table.status} = 'ACTIVE'`),
    index('managed_contracts_effective_idx').on(
      table.accountId,
      table.effectiveAt,
      table.expiresAt
    ),
    uniqueIndex('managed_contracts_provider_subscription_unique').on(table.providerSubscriptionId),
  ]
)

export const usageAllowanceGrants = pgTable(
  'usage_allowance_grants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    units: integer('units').notNull(),
    validFrom: timestamp('valid_from', { withTimezone: true }).notNull().defaultNow(),
    validUntil: timestamp('valid_until', { withTimezone: true }).notNull(),
    reason: text('reason').notNull(),
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
    grantedByAccountId: uuid('granted_by_account_id').references(() => accounts.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('usage_allowance_grants_account_validity_idx').on(
      table.accountId,
      table.validFrom,
      table.validUntil
    ),
    uniqueIndex('usage_allowance_grants_idempotency_unique').on(
      table.accountId,
      table.idempotencyKey
    ),
  ]
)

export const usageBillingPeriods = pgTable(
  'usage_billing_periods',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
    periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
    includedUnits: integer('included_units').notNull(),
    grantedUnits: integer('granted_units').notNull().default(0),
    usedUnits: integer('used_units').notNull().default(0),
    overageUnits: integer('overage_units').notNull().default(0),
    overageAmountMicros: bigint('overage_amount_micros', { mode: 'number' }).notNull().default(0),
    status: varchar('status', { length: 24 }).notNull().default('OPEN'),
    providerUsageId: text('provider_usage_id'),
    reconciledAt: timestamp('reconciled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('usage_billing_periods_account_start_unique').on(
      table.accountId,
      table.periodStart
    ),
    index('usage_billing_periods_status_idx').on(table.status),
  ]
)

export const billableRequests = pgTable(
  'billable_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
    requestFingerprint: varchar('request_fingerprint', {
      length: 64,
    }).notNull(),
    endpoint: text('endpoint').notNull(),
    method: varchar('method', { length: 8 }).notNull(),
    units: integer('units').notNull(),
    statusCode: integer('status_code'),
    responseBody: jsonb('response_body'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('billable_requests_account_idempotency_unique').on(
      table.accountId,
      table.idempotencyKey
    ),
    index('billable_requests_created_idx').on(table.createdAt),
  ]
)
