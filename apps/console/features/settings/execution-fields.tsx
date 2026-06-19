"use client";

import type React from "react";
import type { ExecutionTargetProvider } from "@/lib/api";
import { targetLabel } from "@/features/settings/model";
import { Button } from "@planisfy/ui/components/button";
import { Input } from "@planisfy/ui/components/input";
import { Label } from "@planisfy/ui/components/label";
import { Wand2 } from "lucide-react";

export function ProviderConfigFields({
  provider,
  config,
  credentials,
  onConfigChange,
  onCredentialChange,
  onApplyPreset,
}: {
  provider: ExecutionTargetProvider;
  config: Record<string, unknown>;
  credentials: Record<string, unknown>;
  onConfigChange: (key: string, value: string) => void;
  onCredentialChange: (key: string, value: string) => void;
  onApplyPreset: () => void;
}) {
  const text = (source: Record<string, unknown>, key: string) =>
    source[key] === undefined || source[key] === null
      ? ""
      : String(source[key]);

  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{targetLabel(provider)} preset</p>
          <p className="text-xs text-muted-foreground">
            Fill the common provider fields, then use JSON for advanced options.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onApplyPreset}
        >
          <Wand2 className="mr-1.5 h-4 w-4" />
          Preset
        </Button>
      </div>

      {provider === "local" && (
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Queue">
            <Input
              value={text(config, "queue")}
              onChange={(e) => onConfigChange("queue", e.target.value)}
              placeholder="geodata"
            />
          </Field>
          <Field label="Max concurrent jobs">
            <Input
              type="number"
              min={1}
              value={text(config, "maxConcurrentJobs")}
              onChange={(e) =>
                onConfigChange("maxConcurrentJobs", e.target.value)
              }
            />
          </Field>
          <Field label="Working directory">
            <Input
              value={text(config, "workingDirectory")}
              onChange={(e) =>
                onConfigChange("workingDirectory", e.target.value)
              }
              placeholder="/data/storage"
            />
          </Field>
        </div>
      )}

      {provider === "aws_batch" && (
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Job queue">
            <Input
              value={text(config, "jobQueue")}
              onChange={(e) => onConfigChange("jobQueue", e.target.value)}
              placeholder="planisfy-geodata"
            />
          </Field>
          <Field label="Job definition">
            <Input
              value={text(config, "jobDefinition")}
              onChange={(e) => onConfigChange("jobDefinition", e.target.value)}
              placeholder="planisfy-geodata-worker"
            />
          </Field>
          <Field label="Retry attempts">
            <Input
              type="number"
              min={0}
              value={text(config, "retryAttempts")}
              onChange={(e) => onConfigChange("retryAttempts", e.target.value)}
            />
          </Field>
          <Field label="Role ARN">
            <Input
              value={text(credentials, "roleArn")}
              onChange={(e) => onCredentialChange("roleArn", e.target.value)}
              placeholder="arn:aws:iam::...:role/..."
            />
          </Field>
        </div>
      )}

      {provider === "gcp_batch" && (
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Project ID">
            <Input
              value={text(config, "projectId")}
              onChange={(e) => onConfigChange("projectId", e.target.value)}
              placeholder="my-gcp-project"
            />
          </Field>
          <Field label="Location">
            <Input
              value={text(config, "location")}
              onChange={(e) => onConfigChange("location", e.target.value)}
              placeholder="us-central1"
            />
          </Field>
          <Field label="Job name prefix">
            <Input
              value={text(config, "jobNamePrefix")}
              onChange={(e) => onConfigChange("jobNamePrefix", e.target.value)}
              placeholder="planisfy-geodata"
            />
          </Field>
          <Field label="Service account email">
            <Input
              value={text(credentials, "serviceAccountEmail")}
              onChange={(e) =>
                onCredentialChange("serviceAccountEmail", e.target.value)
              }
              placeholder="worker@project.iam.gserviceaccount.com"
            />
          </Field>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
