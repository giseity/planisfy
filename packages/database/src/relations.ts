import { relations } from "drizzle-orm";
import {
  profiles,
  users,
  organizations,
  members,
  sessions,
  accounts,
  styles,
  apiKeys,
  tilesetSources,
  usageLogs,
} from "./schema";

// ============================================================================
// Profile relations
// ============================================================================

export const profilesRelations = relations(profiles, ({ one, many }) => ({
  user: one(users, {
    fields: [profiles.id],
    references: [users.profileId],
  }),
  organization: one(organizations, {
    fields: [profiles.id],
    references: [organizations.profileId],
  }),
  ownedStyles: many(styles),
  ownedTilesets: many(tilesetSources),
  apiKeys: many(apiKeys),
  usageLogs: many(usageLogs),
}));

// ============================================================================
// User relations
// ============================================================================

export const usersRelations = relations(users, ({ one, many }) => ({
  profile: one(profiles, {
    fields: [users.profileId],
    references: [profiles.id],
  }),
  ownedOrganizations: many(organizations),
  memberships: many(members),
  sessions: many(sessions),
  authAccounts: many(accounts),
}));

// ============================================================================
// Organization relations
// ============================================================================

export const organizationsRelations = relations(
  organizations,
  ({ one, many }) => ({
    profile: one(profiles, {
      fields: [organizations.profileId],
      references: [profiles.id],
    }),
    owner: one(users, {
      fields: [organizations.ownerId],
      references: [users.id],
    }),
    members: many(members),
  })
);

// ============================================================================
// Member relations
// ============================================================================

export const membersRelations = relations(members, ({ one }) => ({
  user: one(users, {
    fields: [members.userId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [members.orgId],
    references: [organizations.id],
  }),
}));

// ============================================================================
// better-auth relations
// ============================================================================

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, {
    fields: [accounts.userId],
    references: [users.id],
  }),
}));

// ============================================================================
// Resource relations
// ============================================================================

export const stylesRelations = relations(styles, ({ one }) => ({
  owner: one(profiles, {
    fields: [styles.ownerId],
    references: [profiles.id],
  }),
}));

export const apiKeysRelations = relations(apiKeys, ({ one, many }) => ({
  owner: one(profiles, {
    fields: [apiKeys.ownerId],
    references: [profiles.id],
  }),
  usageLogs: many(usageLogs),
}));

export const tilesetSourcesRelations = relations(
  tilesetSources,
  ({ one }) => ({
    owner: one(profiles, {
      fields: [tilesetSources.ownerId],
      references: [profiles.id],
    }),
  })
);

export const usageLogsRelations = relations(usageLogs, ({ one }) => ({
  apiKey: one(apiKeys, {
    fields: [usageLogs.apiKeyId],
    references: [apiKeys.id],
  }),
  profile: one(profiles, {
    fields: [usageLogs.profileId],
    references: [profiles.id],
  }),
}));
