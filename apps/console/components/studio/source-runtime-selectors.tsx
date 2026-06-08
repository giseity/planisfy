"use client";

import type {
  ConsoleExecutionTarget,
  ConsoleWorkerProfile,
} from "@/lib/api";
import { Label } from "@planisfy/ui/components/label";
import { ResourceCombobox } from "@planisfy/ui/components/resource-combobox";

export function SourceRuntimeSelectors({
  executionTargets,
  workerProfiles,
  selectedExecutionTargetId,
  selectedWorkerProfileId,
  onExecutionTargetChange,
  onWorkerProfileChange,
  compact = false,
}: {
  executionTargets: ConsoleExecutionTarget[];
  workerProfiles: ConsoleWorkerProfile[];
  selectedExecutionTargetId: string;
  selectedWorkerProfileId: string;
  onExecutionTargetChange: (value: string) => void;
  onWorkerProfileChange: (value: string) => void;
  compact?: boolean;
}) {
  const executionTargetResources = [
    {
      value: "default",
      label: "Local default",
      description: "Use the console default execution target.",
    },
    ...executionTargets.map((target) => ({
      value: target.id,
      label: target.name,
      description: [
        formatExecutionProvider(target.provider),
        target.region,
        target.hasCredentials ? null : "credentials missing",
      ]
        .filter(Boolean)
        .join(" - "),
    })),
  ];

  const workerProfileResources = [
    {
      value: "default",
      label: "Default worker",
      description: "Use the default worker image and limits.",
    },
    ...workerProfiles.map((profile) => ({
      value: profile.id,
      label: profile.name,
      description: [
        profile.image,
        profile.cpu ? `${profile.cpu} CPU` : null,
        profile.memoryMb ? `${profile.memoryMb} MB` : null,
        profile.concurrency ? `${profile.concurrency} concurrent` : null,
      ]
        .filter(Boolean)
        .join(" - "),
    })),
  ];

  return (
    <div
      className={compact ? "flex flex-wrap gap-2" : "grid grid-cols-2 gap-3"}
    >
      <div className={compact ? "min-w-40" : "space-y-2"}>
        {!compact && <Label>Execution target</Label>}
        <ResourceCombobox
          value={selectedExecutionTargetId}
          onValueChange={onExecutionTargetChange}
          resources={executionTargetResources}
          placeholder="Select target"
          searchPlaceholder="Search targets..."
          emptyText="No execution targets found."
          className={compact ? "h-8" : undefined}
        />
      </div>
      <div className={compact ? "min-w-40" : "space-y-2"}>
        {!compact && <Label>Worker profile</Label>}
        <ResourceCombobox
          value={selectedWorkerProfileId}
          onValueChange={onWorkerProfileChange}
          resources={workerProfileResources}
          placeholder="Select profile"
          searchPlaceholder="Search profiles..."
          emptyText="No worker profiles found."
          className={compact ? "h-8" : undefined}
        />
      </div>
    </div>
  );
}

function formatExecutionProvider(provider: ConsoleExecutionTarget["provider"]) {
  switch (provider) {
    case "aws_batch":
      return "AWS Batch";
    case "gcp_batch":
      return "GCP Batch";
    case "local":
      return "Local";
  }
}
