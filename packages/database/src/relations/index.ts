import { relations } from "drizzle-orm";
import {
  accounts,
  users,
  organizations,
  members,
  invitations,
  sessions,
  oauthAccounts,
  styles,
  styleVersions,
  stylePublications,
  apiKeys,
  tilesetSources,
  sourceConnections,
  sourceCredentials,
  sourceImports,
  savedRegions,
  uploads,
  datasets,
  datasetVersions,
  tilesets,
  tilesetVersions,
  processingJobs,
  processingJobLogs,
  executionTargets,
  executionTargetEnvVars,
  workerProfiles,
  notificationChannels,
  scheduledOperations,
  artifactBackups,
  workerNodes,
  previewLinks,
  customDomains,
  workflowTemplates,
  eventOutbox,
  storageObjects,
  spriteAssets,
  basemapReleases,
  usageLogs,
  usageRollups,
  auditEvents,
  billingCustomers,
  plans,
  subscriptions,
  billingTransactions,
} from "../schema";

// ============================================================================
// Account relations (canonical identity anchor)
// ============================================================================

export const accountsRelations = relations(accounts, ({ one, many }) => ({
  user: one(users, {
    fields: [accounts.id],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [accounts.id],
    references: [organizations.id],
  }),

  ownedStyles: many(styles),
  ownedTilesetSources: many(tilesetSources),
  sourceConnections: many(sourceConnections),
  sourceCredentials: many(sourceCredentials),
  savedRegions: many(savedRegions),
  sourceImports: many(sourceImports),
  apiKeys: many(apiKeys),
  uploads: many(uploads),
  datasets: many(datasets),
  tilesets: many(tilesets),
  processingJobs: many(processingJobs),
  executionTargets: many(executionTargets),
  executionTargetEnvVars: many(executionTargetEnvVars),
  workerProfiles: many(workerProfiles),
  notificationChannels: many(notificationChannels),
  scheduledOperations: many(scheduledOperations),
  artifactBackups: many(artifactBackups),
  workerNodes: many(workerNodes),
  previewLinks: many(previewLinks),
  customDomains: many(customDomains),
  workflowTemplates: many(workflowTemplates),
  storageObjects: many(storageObjects),
  spriteAssets: many(spriteAssets),
  usageLogs: many(usageLogs),
  usageRollups: many(usageRollups),
  auditEvents: many(auditEvents),
  billingCustomers: many(billingCustomers),
  subscriptions: many(subscriptions),
  billingTransactions: many(billingTransactions),
}));

// Transitional export for legacy callers. New code should use accountsRelations.
export const profilesRelations = accountsRelations;

// ============================================================================
// User and organization relations
// ============================================================================

export const usersRelations = relations(users, ({ one, many }) => ({
  account: one(accounts, {
    fields: [users.id],
    references: [accounts.id],
  }),
  memberships: many(members),
  sessions: many(sessions),
  oauthAccounts: many(oauthAccounts),
  sentInvitations: many(invitations),
}));

export const organizationsRelations = relations(
  organizations,
  ({ one, many }) => ({
    account: one(accounts, {
      fields: [organizations.id],
      references: [accounts.id],
    }),
    members: many(members),
    invitations: many(invitations),
  })
);

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

export const oauthAccountsRelations = relations(oauthAccounts, ({ one }) => ({
  user: one(users, {
    fields: [oauthAccounts.userId],
    references: [users.id],
  }),
}));

// ============================================================================
// Resource relations
// ============================================================================

export const stylesRelations = relations(styles, ({ one, many }) => ({
  owner: one(accounts, {
    fields: [styles.ownerId],
    references: [accounts.id],
  }),
  versions: many(styleVersions),
  publications: many(stylePublications),
}));

export const styleVersionsRelations = relations(styleVersions, ({ one, many }) => ({
  style: one(styles, {
    fields: [styleVersions.styleId],
    references: [styles.id],
  }),
  creator: one(users, {
    fields: [styleVersions.createdBy],
    references: [users.id],
  }),
  publications: many(stylePublications),
}));

export const stylePublicationsRelations = relations(stylePublications, ({ one }) => ({
  style: one(styles, {
    fields: [stylePublications.styleId],
    references: [styles.id],
  }),
  styleVersion: one(styleVersions, {
    fields: [stylePublications.styleVersionId],
    references: [styleVersions.id],
  }),
  account: one(accounts, {
    fields: [stylePublications.accountId],
    references: [accounts.id],
  }),
}));

export const apiKeysRelations = relations(apiKeys, ({ one, many }) => ({
  owner: one(accounts, {
    fields: [apiKeys.referenceId],
    references: [accounts.id],
  }),
  usageLogs: many(usageLogs),
}));

export const tilesetSourcesRelations = relations(
  tilesetSources,
  ({ one }) => ({
    owner: one(accounts, {
      fields: [tilesetSources.ownerId],
      references: [accounts.id],
    }),
  })
);

export const sourceCredentialsRelations = relations(
  sourceCredentials,
  ({ one, many }) => ({
    account: one(accounts, {
      fields: [sourceCredentials.accountId],
      references: [accounts.id],
    }),
    sourceConnections: many(sourceConnections),
  })
);

export const savedRegionsRelations = relations(savedRegions, ({ one, many }) => ({
  account: one(accounts, {
    fields: [savedRegions.accountId],
    references: [accounts.id],
  }),
  imports: many(sourceImports),
}));

export const sourceConnectionsRelations = relations(
  sourceConnections,
  ({ one, many }) => ({
    account: one(accounts, {
      fields: [sourceConnections.accountId],
      references: [accounts.id],
    }),
    credential: one(sourceCredentials, {
      fields: [sourceConnections.credentialId],
      references: [sourceCredentials.id],
    }),
    imports: many(sourceImports),
  })
);

export const uploadsRelations = relations(uploads, ({ one }) => ({
  account: one(accounts, {
    fields: [uploads.accountId],
    references: [accounts.id],
  }),
  storageObject: one(storageObjects, {
    fields: [uploads.storageObjectId],
    references: [storageObjects.id],
  }),
}));

export const datasetsRelations = relations(datasets, ({ one, many }) => ({
  account: one(accounts, {
    fields: [datasets.accountId],
    references: [accounts.id],
  }),
  versions: many(datasetVersions),
}));

export const datasetVersionsRelations = relations(datasetVersions, ({ one }) => ({
  dataset: one(datasets, {
    fields: [datasetVersions.datasetId],
    references: [datasets.id],
  }),
  storageObject: one(storageObjects, {
    fields: [datasetVersions.storageObjectId],
    references: [storageObjects.id],
  }),
}));

export const sourceImportsRelations = relations(sourceImports, ({ one }) => ({
  account: one(accounts, {
    fields: [sourceImports.accountId],
    references: [accounts.id],
  }),
  sourceConnection: one(sourceConnections, {
    fields: [sourceImports.sourceConnectionId],
    references: [sourceConnections.id],
  }),
  region: one(savedRegions, {
    fields: [sourceImports.regionId],
    references: [savedRegions.id],
  }),
  dataset: one(datasets, {
    fields: [sourceImports.datasetId],
    references: [datasets.id],
  }),
  targetTileset: one(tilesets, {
    fields: [sourceImports.targetTilesetId],
    references: [tilesets.id],
  }),
  processingJob: one(processingJobs, {
    fields: [sourceImports.processingJobId],
    references: [processingJobs.id],
  }),
}));

export const tilesetsRelations = relations(tilesets, ({ one, many }) => ({
  account: one(accounts, {
    fields: [tilesets.accountId],
    references: [accounts.id],
  }),
  versions: many(tilesetVersions),
  sourceImports: many(sourceImports),
}));

export const tilesetVersionsRelations = relations(tilesetVersions, ({ one }) => ({
  tileset: one(tilesets, {
    fields: [tilesetVersions.tilesetId],
    references: [tilesets.id],
  }),
  artifactStorageObject: one(storageObjects, {
    fields: [tilesetVersions.artifactStorageObjectId],
    references: [storageObjects.id],
  }),
}));

// ============================================================================
// Async, storage, usage, audit, billing
// ============================================================================

export const processingJobsRelations = relations(processingJobs, ({ one, many }) => ({
  account: one(accounts, {
    fields: [processingJobs.accountId],
    references: [accounts.id],
  }),
  executionTarget: one(executionTargets, {
    fields: [processingJobs.executionTargetId],
    references: [executionTargets.id],
  }),
  workerProfile: one(workerProfiles, {
    fields: [processingJobs.workerProfileId],
    references: [workerProfiles.id],
  }),
  logs: many(processingJobLogs),
}));

export const executionTargetsRelations = relations(
  executionTargets,
  ({ one, many }) => ({
    account: one(accounts, {
      fields: [executionTargets.accountId],
      references: [accounts.id],
    }),
    envVars: many(executionTargetEnvVars),
    processingJobs: many(processingJobs),
  })
);

export const executionTargetEnvVarsRelations = relations(
  executionTargetEnvVars,
  ({ one }) => ({
    account: one(accounts, {
      fields: [executionTargetEnvVars.accountId],
      references: [accounts.id],
    }),
    executionTarget: one(executionTargets, {
      fields: [executionTargetEnvVars.executionTargetId],
      references: [executionTargets.id],
    }),
  })
);

export const workerProfilesRelations = relations(workerProfiles, ({ one, many }) => ({
  account: one(accounts, {
    fields: [workerProfiles.accountId],
    references: [accounts.id],
  }),
  processingJobs: many(processingJobs),
}));

export const notificationChannelsRelations = relations(
  notificationChannels,
  ({ one }) => ({
    account: one(accounts, {
      fields: [notificationChannels.accountId],
      references: [accounts.id],
    }),
  })
);

export const scheduledOperationsRelations = relations(
  scheduledOperations,
  ({ one }) => ({
    account: one(accounts, {
      fields: [scheduledOperations.accountId],
      references: [accounts.id],
    }),
  })
);

export const artifactBackupsRelations = relations(artifactBackups, ({ one }) => ({
  account: one(accounts, {
    fields: [artifactBackups.accountId],
    references: [accounts.id],
  }),
  storageObject: one(storageObjects, {
    fields: [artifactBackups.storageObjectId],
    references: [storageObjects.id],
  }),
}));

export const workerNodesRelations = relations(workerNodes, ({ one }) => ({
  account: one(accounts, {
    fields: [workerNodes.accountId],
    references: [accounts.id],
  }),
}));

export const previewLinksRelations = relations(previewLinks, ({ one }) => ({
  account: one(accounts, {
    fields: [previewLinks.accountId],
    references: [accounts.id],
  }),
}));

export const customDomainsRelations = relations(customDomains, ({ one }) => ({
  account: one(accounts, {
    fields: [customDomains.accountId],
    references: [accounts.id],
  }),
}));

export const workflowTemplatesRelations = relations(workflowTemplates, ({ one }) => ({
  account: one(accounts, {
    fields: [workflowTemplates.accountId],
    references: [accounts.id],
  }),
}));

export const processingJobLogsRelations = relations(processingJobLogs, ({ one }) => ({
  job: one(processingJobs, {
    fields: [processingJobLogs.jobId],
    references: [processingJobs.id],
  }),
}));

export const eventOutboxRelations = relations(eventOutbox, () => ({}));

export const storageObjectsRelations = relations(storageObjects, ({ one }) => ({
  account: one(accounts, {
    fields: [storageObjects.accountId],
    references: [accounts.id],
  }),
}));

export const spriteAssetsRelations = relations(spriteAssets, ({ one }) => ({
  account: one(accounts, {
    fields: [spriteAssets.accountId],
    references: [accounts.id],
  }),
  storageObject: one(storageObjects, {
    fields: [spriteAssets.storageObjectId],
    references: [storageObjects.id],
  }),
  rasterStorageObject: one(storageObjects, {
    fields: [spriteAssets.rasterStorageObjectId],
    references: [storageObjects.id],
  }),
}));

export const basemapReleasesRelations = relations(basemapReleases, ({ one }) => ({
  buildJob: one(processingJobs, {
    fields: [basemapReleases.buildJobId],
    references: [processingJobs.id],
  }),
}));

export const usageLogsRelations = relations(usageLogs, ({ one }) => ({
  apiKey: one(apiKeys, {
    fields: [usageLogs.apiKeyId],
    references: [apiKeys.id],
  }),
  account: one(accounts, {
    fields: [usageLogs.profileId],
    references: [accounts.id],
  }),
}));

export const usageRollupsRelations = relations(usageRollups, ({ one }) => ({
  account: one(accounts, {
    fields: [usageRollups.accountId],
    references: [accounts.id],
  }),
}));

export const auditEventsRelations = relations(auditEvents, ({ one }) => ({
  account: one(accounts, {
    fields: [auditEvents.profileId],
    references: [accounts.id],
  }),
}));

export const billingCustomersRelations = relations(billingCustomers, ({ one }) => ({
  account: one(accounts, {
    fields: [billingCustomers.accountId],
    references: [accounts.id],
  }),
}));

export const plansRelations = relations(plans, ({ many }) => ({
  subscriptions: many(subscriptions),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  account: one(accounts, {
    fields: [subscriptions.accountId],
    references: [accounts.id],
  }),
  plan: one(plans, {
    fields: [subscriptions.planId],
    references: [plans.id],
  }),
}));

export const billingTransactionsRelations = relations(
  billingTransactions,
  ({ one }) => ({
    account: one(accounts, {
      fields: [billingTransactions.accountId],
      references: [accounts.id],
    }),
  })
);
