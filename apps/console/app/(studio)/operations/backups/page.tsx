"use client";

import { BackupsTab } from "@/components/operations/tabs";
import { useOperations } from "@/components/operations/provider";

export default function OperationsBackupsPage() {
  const { overview, load } = useOperations();
  return <BackupsTab backups={overview.artifactBackups} onChanged={load} />;
}
