export type PublishVersionAction =
  | "publish"
  | "promote"
  | "rollback"
  | "republish";

export function classifyVersionPublish(params: {
  currentVersionNumber?: number | null;
  targetVersionNumber: number;
  isCurrentVersion: boolean;
}): PublishVersionAction {
  if (params.isCurrentVersion) return "republish";
  if (typeof params.currentVersionNumber !== "number") return "publish";
  return params.targetVersionNumber < params.currentVersionNumber
    ? "rollback"
    : "promote";
}

export function buildTilesetPublishAuditMetadata(params: {
  targetVersion: number;
  previousVersion?: number | null;
  action: PublishVersionAction;
  martinRegistration: unknown;
}) {
  return {
    version: params.targetVersion,
    previousVersion: params.previousVersion ?? null,
    publishAction: params.action,
    martinRegistration: params.martinRegistration,
  };
}
