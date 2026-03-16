import { relations } from "drizzle-orm";
import {
  profiles,
  users,
  organizations,
  members,
  invitations,
  sessions,
  accounts,
  styles,
  styleVersions,
  apiKeys,
  tilesetSources,
  usageLogs,
  auditEvents,
} from "./schema";

// ============================================================================
// Profile relations (supertype — identity shared with user or org)
// ============================================================================

export const profilesRelations = relations(profiles, ({ one, many }) => ({
  // A profile is either a user or an org (never both).
  // profile.id = user.id OR profile.id = organization.id.
  user: one(users, {
    fields: [profiles.id],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [profiles.id],
    references: [organizations.id],
  }),

  // Resources owned by this profile
  ownedStyles: many(styles),
  ownedTilesets: many(tilesetSources),
  apiKeys: many(apiKeys),
  usageLogs: many(usageLogs),
  auditEvents: many(auditEvents),
}));

// ============================================================================
// User relations
// ============================================================================

export const usersRelations = relations(users, ({ one, many }) => ({
  profile: one(profiles, {
    fields: [users.id],
    references: [profiles.id],
  }),
  memberships: many(members),
  sessions: many(sessions),
  authAccounts: many(accounts),
  sentInvitations: many(invitations),
}));

// ============================================================================
// Organization relations
// ============================================================================

export const organizationsRelations = relations(
  organizations,
  ({ one, many }) => ({
    profile: one(profiles, {
      fields: [organizations.id],
      references: [profiles.id],
    }),
    members: many(members),
    invitations: many(invitations),
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
    fields: [members.organizationId],
    references: [organizations.id],
  }),
}));

// ============================================================================
// Invitation relations
// ============================================================================

export const invitationsRelations = relations(invitations, ({ one }) => ({
  organization: one(organizations, {
    fields: [invitations.organizationId],
    references: [organizations.id],
  }),
  inviter: one(users, {
    fields: [invitations.inviterId],
    references: [users.id],
  }),
}));

// ============================================================================
// better-auth core relations
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

export const stylesRelations = relations(styles, ({ one, many }) => ({
  owner: one(profiles, {
    fields: [styles.ownerId],
    references: [profiles.id],
  }),
  versions: many(styleVersions),
}));

export const styleVersionsRelations = relations(styleVersions, ({ one }) => ({
  style: one(styles, {
    fields: [styleVersions.styleId],
    references: [styles.id],
  }),
  creator: one(users, {
    fields: [styleVersions.createdBy],
    references: [users.id],
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

export const auditEventsRelations = relations(auditEvents, ({ one }) => ({
  profile: one(profiles, {
    fields: [auditEvents.profileId],
    references: [profiles.id],
  }),
}));
