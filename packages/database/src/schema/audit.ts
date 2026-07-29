import { index, jsonb, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'

import { accounts, users } from './identity'

// ============================================================================
// Audit Events (Core actions: *.created, *.updated, *.deleted)
// ============================================================================

export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    actorUserId: uuid('actor_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    requestId: varchar('request_id', { length: 128 }),
    outcome: varchar('outcome', { length: 16 }).notNull().default('SUCCESS'),
    action: varchar('action', { length: 64 }).notNull(),
    resourceType: varchar('resource_type', { length: 32 }).notNull(),
    resourceId: varchar('resource_id', { length: 128 }),
    metadata: jsonb('metadata'),
    ipAddress: text('ip_address'),
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('audit_events_account_idx').on(table.accountId),
    index('audit_events_actor_user_idx').on(table.actorUserId),
    index('audit_events_request_idx').on(table.requestId),
    index('audit_events_timestamp_idx').on(table.timestamp),
    index('audit_events_resource_idx').on(table.resourceType, table.resourceId),
  ]
)
