"use client";

import type {
  ConsoleExecutionTarget,
  ConsoleWorkerProfile,
} from "@/lib/api";
import { Label } from "@planisfy/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@planisfy/ui/components/select";

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
  return (
    <div
      className={compact ? "flex flex-wrap gap-2" : "grid grid-cols-2 gap-3"}
    >
      <div className={compact ? "min-w-40" : "space-y-2"}>
        {!compact && <Label>Execution target</Label>}
        <Select
          value={selectedExecutionTargetId}
          onValueChange={onExecutionTargetChange}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">Local default</SelectItem>
            {executionTargets.map((target) => (
              <SelectItem key={target.id} value={target.id}>
                {target.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className={compact ? "min-w-40" : "space-y-2"}>
        {!compact && <Label>Worker profile</Label>}
        <Select
          value={selectedWorkerProfileId}
          onValueChange={onWorkerProfileChange}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">Default worker</SelectItem>
            {workerProfiles.map((profile) => (
              <SelectItem key={profile.id} value={profile.id}>
                {profile.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
