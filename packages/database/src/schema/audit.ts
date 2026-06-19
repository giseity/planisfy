import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { accounts } from "./identity";

// ============================================================================
// Audit Events (Core actions: *.created, *.updated, *.deleted)
// ============================================================================

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    action: varchar("action", { length: 64 }).notNull(),
    resourceType: varchar("resource_type", { length: 32 }).notNull(),
    resourceId: varchar("resource_id", { length: 128 }),
    metadata: jsonb("metadata"),
    ipAddress: text("ip_address"),
    timestamp: timestamp("timestamp", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("audit_events_account_idx").on(table.profileId),
    index("audit_events_timestamp_idx").on(table.timestamp),
    index("audit_events_resource_idx").on(table.resourceType, table.resourceId),
  ],
);
