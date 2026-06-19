import {
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
} from "drizzle-orm/pg-core";
import { users } from "./identity";

// ============================================================================
// Platform Admin Controls
// ============================================================================

export const platformConfig = pgTable(
  "platform_config",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: varchar("key", { length: 128 }).notNull(),
    value: text("value").notNull().default(""),
    valueType: varchar("value_type", { length: 32 }).notNull().default("text"),
    category: varchar("category", { length: 64 }).notNull().default("General"),
    description: text("description"),
    isSecret: boolean("is_secret").notNull().default(false),
    updatedById: uuid("updated_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("platform_config_key_unique").on(table.key),
    index("platform_config_category_idx").on(table.category),
  ],
);

export const featureFlags = pgTable(
  "feature_flags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: varchar("key", { length: 128 }).notNull(),
    label: varchar("label", { length: 128 }).notNull(),
    description: text("description"),
    scope: varchar("scope", { length: 64 }).notNull().default("global"),
    enabled: boolean("enabled").notNull().default(false),
    rolloutPercent: integer("rollout_percent").notNull().default(0),
    metadata: jsonb("metadata").notNull().default({}),
    updatedById: uuid("updated_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .$onUpdate(() => new Date()),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("feature_flags_key_unique").on(table.key),
    index("feature_flags_scope_idx").on(table.scope),
    index("feature_flags_archived_idx").on(table.archivedAt),
  ],
);

export const announcements = pgTable(
  "announcements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: varchar("title", { length: 180 }).notNull(),
    body: text("body").notNull(),
    status: varchar("status", { length: 32 }).notNull().default("draft"),
    audience: varchar("audience", { length: 64 }).notNull().default("all"),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    createdById: uuid("created_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedById: uuid("updated_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .$onUpdate(() => new Date()),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    index("announcements_status_idx").on(table.status),
    index("announcements_audience_idx").on(table.audience),
    index("announcements_schedule_idx").on(table.startsAt, table.endsAt),
  ],
);
