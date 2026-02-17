import { relations } from "drizzle-orm";
import { accounts, members, styles, apiKeys, tilesetSources, usageLogs, sessions, authAccounts } from "./schema";

export const accountsRelations = relations(accounts, ({ one, many }) => ({
  memberships: many(members), // Users have memberships in Orgs
  ownedStyles: many(styles),
  ownedTilesets: many(tilesetSources),
  apiKeys: many(apiKeys),
  sessions: many(sessions),
  authAccounts: many(authAccounts),
}));

export const membersRelations = relations(members, ({ one }) => ({
  user: one(accounts, {
    fields: [members.userId],
    references: [accounts.id],
    relationName: "user_memberships",
  }),
  organization: one(accounts, {
    fields: [members.orgId],
    references: [accounts.id],
    relationName: "org_members",
  }),
}));

export const stylesRelations = relations(styles, ({ one }) => ({
  owner: one(accounts, {
    fields: [styles.ownerId],
    references: [accounts.id],
  }),
}));

export const apiKeysRelations = relations(apiKeys, ({ one, many }) => ({
  owner: one(accounts, {
    fields: [apiKeys.ownerId],
    references: [accounts.id],
  }),
  usageLogs: many(usageLogs),
}));

export const tilesetSourcesRelations = relations(tilesetSources, ({ one }) => ({
  owner: one(accounts, {
    fields: [tilesetSources.ownerId],
    references: [accounts.id],
  }),
}));

export const usageLogsRelations = relations(usageLogs, ({ one }) => ({
  apiKey: one(apiKeys, {
    fields: [usageLogs.apiKeyId],
    references: [apiKeys.id],
  }),
  account: one(accounts, {
    fields: [usageLogs.accountId],
    references: [accounts.id],
  }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(accounts, {
    fields: [sessions.userId],
    references: [accounts.id],
  }),
}));

export const authAccountsRelations = relations(authAccounts, ({ one }) => ({
  user: one(accounts, {
    fields: [authAccounts.userId],
    references: [accounts.id],
  }),
}));
