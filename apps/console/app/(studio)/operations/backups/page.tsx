"use client";

import { BackupsTab } from "@/components/studio/operations-tabs";
import { useOperations } from "@/components/studio/operations-provider";

export default function OperationsBackupsPage() {
  const { overview, load } = useOperations();
  return <BackupsTab backups={overview.artifactBackups} onChanged={load} />;
}
