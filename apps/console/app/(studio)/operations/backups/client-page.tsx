"use client";

import { BackupsTab } from "@/features/operations/tabs";
import { useOperations } from "@/features/operations/provider";

export default function OperationsBackupsPage() {
  const { overview, load } = useOperations();
  return <BackupsTab backups={overview.artifactBackups} onChanged={load} />;
}
