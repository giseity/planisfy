import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { accountLifecycleStatusEnum, accountTypeEnum, systemRoleEnum } from "./primitives";

// ============================================================================
// Accounts (shared identity anchor for users and organizations)
//
// Key design: account.id = user.id (for users)
//             account.id = organization.id (for orgs)
//
// This eliminates extra owner joins: the entity's own ID is the account ID.
// Resources reference accounts.ownerId, so given a user ID or org ID you can
// query resources directly without a join.
// ============================================================================

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: accountTypeEnum("type").notNull(),
    handle: varchar("handle", { length: 64 }).notNull(),
    displayName: varchar("display_name", { length: 128 }).notNull(),
    avatarUrl: text("avatar_url"),
    bio: text("bio"),
    lifecycleStatus: accountLifecycleStatusEnum("lifecycle_status")
      .notNull()
      .default("ACTIVE"),
    lifecycleReason: text("lifecycle_reason"),
    lifecycleUntil: timestamp("lifecycle_until", { withTimezone: true }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("accounts_handle_unique")
      .on(table.handle)
      .where(sql`${table.deletedAt} IS NULL`),
    index("accounts_lifecycle_status_idx").on(table.lifecycleStatus),
  ],
);

// Transitional export for legacy callers. New code should import `accounts`.
export const profiles = accounts;

// ============================================================================
// Users (better-auth identity table)
//
// user.id = account.id (shared identity, FK enforced)
// ============================================================================

export const users = pgTable(
  "users",
  {
    id: uuid("id")
      .primaryKey()
      .references(() => accounts.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 255 }).notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    role: systemRoleEnum("role").default("USER").notNull(),
    image: text("image"),
    name: varchar("name", { length: 128 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("users_email_unique").on(table.email)],
);

// ============================================================================
// Organizations (better-auth org plugin compatible)
//
// organization.id = account.id (shared identity, FK enforced)
// Columns align with the org plugin schema; additional fields (deletedAt)
// are registered via the plugin's schema.organization.additionalFields.
// ============================================================================

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id")
      .primaryKey()
      .references(() => accounts.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 128 }).notNull(),
    slug: varchar("slug", { length: 128 }).notNull(),
    logo: text("logo"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("organizations_slug_unique")
      .on(table.slug)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

// ============================================================================
// Members (better-auth org plugin — User <-> Organization join)
//
// Role is a plain string to align with the org plugin's access control system.
// Default roles: "owner", "admin", "member". Custom roles (e.g. "viewer")
// can be defined in the plugin configuration.
// ============================================================================

export const members = pgTable(
  "members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 32 }).notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("members_org_user_unique").on(
      table.organizationId,
      table.userId,
    ),
    index("members_user_idx").on(table.userId),
    index("members_org_idx").on(table.organizationId),
  ],
);

// ============================================================================
// Invitations (better-auth org plugin)
// ============================================================================

export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 255 }).notNull(),
    role: varchar("role", { length: 32 }),
    status: varchar("status", { length: 32 }).notNull().default("pending"),
    inviterId: uuid("inviter_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("invitations_org_idx").on(table.organizationId),
    index("invitations_email_idx").on(table.email),
  ],
);

// ============================================================================
// better-auth Core Tables
// ============================================================================

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  activeOrganizationId: uuid("active_organization_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const oauthAccounts = pgTable("oauth_accounts", {
  id: text("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const verifications = pgTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
