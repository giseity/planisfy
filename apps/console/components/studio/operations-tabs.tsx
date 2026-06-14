"use client";

import type React from "react";
import { useMemo, useState } from "react";
import {
  api,
  type ConsoleArtifactBackup,
  type ConsoleCustomDomain,
  type ConsoleExecutionTarget,
  type ConsoleJobTimeline,
  type ConsoleNotificationChannel,
  type ConsoleOperationsOverview,
  type ConsolePreviewLink,
  type ConsoleScheduledOperation,
  type ConsoleTileset,
  type ConsoleWorkerNode,
  type ConsoleWorkerProfile,
  type ConsoleWorkflowTemplate,
} from "@/lib/api";
import {
  formatBytes,
  formatDate,
  parseJsonObject,
  schedulePayload,
  splitList,
} from "@/components/studio/operations-tabs-model";
import { Badge } from "@planisfy/ui/components/badge";
import { Button } from "@planisfy/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@planisfy/ui/components/card";
import { Input } from "@planisfy/ui/components/input";
import { Label } from "@planisfy/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@planisfy/ui/components/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@planisfy/ui/components/table";
import { Textarea } from "@planisfy/ui/components/textarea";
import {
  ArchiveRestore,
  Bell,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  Globe,
  Link2,
  Play,
  RefreshCw,
  ServerCog,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

export function JobsTab({
  jobs,
  timeline,
  onTimeline,
}: {
  jobs: ConsoleOperationsOverview["recentJobs"];
  timeline: ConsoleJobTimeline | null;
  onTimeline: (jobId: string) => void;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
      <Card>
        <CardHeader>
          <CardTitle>Recent Processing Jobs</CardTitle>
          <CardDescription>
            Timeline entries come from job logs and terminal status.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="w-[96px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((job) => (
                <TableRow key={job.id}>
                  <TableCell className="font-medium">{job.type}</TableCell>
                  <TableCell>
                    <StatusBadge status={job.status} />
                  </TableCell>
                  <TableCell>{job.progress}%</TableCell>
                  <TableCell>{formatDate(job.updatedAt)}</TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="outline"
                      aria-label={`View timeline for ${job.type}`}
                      title="View timeline"
                      onClick={() => onTimeline(job.id)}
                    >
                      <ClipboardList className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {jobs.length === 0 && (
                <EmptyRow colSpan={5} label="No processing jobs yet." />
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Timeline</CardTitle>
          <CardDescription>
            {timeline ? timeline.job.id : "Select a job to inspect events."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {timeline?.timeline.map((event) => (
              <div
                key={`${event.id}-${event.timestamp}`}
                className="border-l pl-3"
              >
                <div className="flex items-center gap-2">
                  <StatusBadge status={event.level} />
                  <span className="text-xs text-muted-foreground">
                    {formatDate(event.timestamp)}
                  </span>
                </div>
                <p className="mt-1 text-sm">{event.message}</p>
              </div>
            ))}
            {!timeline && (
              <p className="text-sm text-muted-foreground">
                Job events will appear here.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function SchedulesTab({
  executionTargets,
  schedules,
  tilesets,
  workerProfiles,
  onChanged,
}: {
  executionTargets: ConsoleExecutionTarget[];
  schedules: ConsoleScheduledOperation[];
  tilesets: ConsoleTileset[];
  workerProfiles: ConsoleWorkerProfile[];
  onChanged: () => void;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] =
    useState<ConsoleScheduledOperation["kind"]>("tileset_rebuild");
  const [cron, setCron] = useState("0 2 * * *");
  const [timezone, setTimezone] = useState("UTC");
  const [tilesetId, setTilesetId] = useState("");
  const [executionTargetId, setExecutionTargetId] = useState("");
  const [workerProfileId, setWorkerProfileId] = useState("");
  const [payload, setPayload] = useState("{}");
  const [saving, setSaving] = useState(false);
  const requiresTileset = kind === "tileset_rebuild";
  const canCreateSchedule =
    name.trim().length > 0 &&
    !saving &&
    (!requiresTileset || Boolean(tilesetId));

  async function createSchedule() {
    if (requiresTileset && !tilesetId) {
      toast.error("Select a tileset before creating a rebuild schedule");
      return;
    }
    setSaving(true);
    try {
      await api.createScheduledOperation({
        name,
        kind,
        cron,
        timezone,
        payload: schedulePayload({
          executionTargetId,
          kind,
          payload,
          tilesetId,
          workerProfileId,
        }),
      });
      setName("");
      setPayload("{}");
      toast.success("Schedule created");
      onChanged();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create schedule",
      );
    } finally {
      setSaving(false);
    }
  }

  async function runSchedule(id: string) {
    await runAction(
      () => api.runScheduledOperation(id),
      "Schedule run recorded",
      onChanged,
    );
  }

  async function deleteSchedule(id: string) {
    await runAction(
      () => api.deleteScheduledOperation(id),
      "Schedule deleted",
      onChanged,
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
      <Card>
        <CardHeader>
          <CardTitle>Create Schedule</CardTitle>
          <CardDescription>
            Use cron syntax for recurring imports, rebuilds, or command
            workflows.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Kind">
            <Select
              value={kind}
              onValueChange={(value) =>
                setKind(value as ConsoleScheduledOperation["kind"])
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tileset_rebuild">Tileset rebuild</SelectItem>
                <SelectItem value="source_import">Source import</SelectItem>
                <SelectItem value="custom_command">Custom command</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cron">
              <Input value={cron} onChange={(e) => setCron(e.target.value)} />
            </Field>
            <Field label="Timezone">
              <Input
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
              />
            </Field>
          </div>
          <Field label="Tileset">
            <Select
              value={tilesetId || "none"}
              onValueChange={(value) =>
                setTilesetId(value === "none" ? "" : value)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No tileset</SelectItem>
                {tilesets.map((tileset) => (
                  <SelectItem key={tileset.id} value={tileset.id}>
                    {tileset.name} ({tileset.handle})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {requiresTileset && !tilesetId && (
              <p className="text-xs text-muted-foreground">
                Required for tileset rebuild schedules.
              </p>
            )}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Execution target">
              <Select
                value={executionTargetId || "none"}
                onValueChange={(value) =>
                  setExecutionTargetId(value === "none" ? "" : value)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Default target</SelectItem>
                  {executionTargets.map((target) => (
                    <SelectItem key={target.id} value={target.id}>
                      {target.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Worker profile">
              <Select
                value={workerProfileId || "none"}
                onValueChange={(value) =>
                  setWorkerProfileId(value === "none" ? "" : value)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Default profile</SelectItem>
                  {workerProfiles.map((profile) => (
                    <SelectItem key={profile.id} value={profile.id}>
                      {profile.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Advanced payload JSON">
            <Textarea
              rows={5}
              value={payload}
              onChange={(e) => setPayload(e.target.value)}
            />
          </Field>
          <Button onClick={createSchedule} disabled={!canCreateSchedule}>
            <CalendarClock className="mr-1.5 h-4 w-4" />
            Create
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Scheduled Operations</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Cron</TableHead>
                <TableHead>Next run</TableHead>
                <TableHead className="w-[112px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {schedules.map((schedule) => (
                <TableRow key={schedule.id}>
                  <TableCell className="font-medium">{schedule.name}</TableCell>
                  <TableCell>
                    <StatusBadge status={schedule.kind} />
                  </TableCell>
                  <TableCell>{schedule.cron}</TableCell>
                  <TableCell>{formatDate(schedule.nextRunAt)}</TableCell>
                  <TableCell className="space-x-1">
                    <Button
                      size="sm"
                      variant="outline"
                      aria-label={`Run schedule ${schedule.name}`}
                      title="Run schedule"
                      onClick={() => runSchedule(schedule.id)}
                    >
                      <Play className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      aria-label={`Delete schedule ${schedule.name}`}
                      title="Delete schedule"
                      onClick={() => deleteSchedule(schedule.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {schedules.length === 0 && (
                <EmptyRow colSpan={5} label="No schedules configured." />
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export function NotificationsTab({
  channels,
  onChanged,
}: {
  channels: ConsoleNotificationChannel[];
  onChanged: () => void;
}) {
  const [name, setName] = useState("");
  const [provider, setProvider] =
    useState<ConsoleNotificationChannel["provider"]>("webhook");
  const [target, setTarget] = useState("");
  const [events, setEvents] = useState("job.failed,job.succeeded,schedule.due");

  async function createChannel() {
    await runAction(
      () =>
        api.createNotificationChannel({
          name,
          provider,
          target,
          events: splitList(events),
        }),
      "Notification channel created",
      () => {
        setName("");
        setTarget("");
        onChanged();
      },
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
      <Card>
        <CardHeader>
          <CardTitle>Add Channel</CardTitle>
          <CardDescription>
            Webhook delivery is active; email and chat providers are stored for
            adapter rollout.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Provider">
            <Select
              value={provider}
              onValueChange={(value) =>
                setProvider(value as ConsoleNotificationChannel["provider"])
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="webhook">Webhook</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="slack">Slack</SelectItem>
                <SelectItem value="discord">Discord</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Target">
            <Input value={target} onChange={(e) => setTarget(e.target.value)} />
          </Field>
          <Field label="Events">
            <Input value={events} onChange={(e) => setEvents(e.target.value)} />
          </Field>
          <Button onClick={createChannel} disabled={!name || !target}>
            <Bell className="mr-1.5 h-4 w-4" />
            Create
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Notification Channels</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Events</TableHead>
                <TableHead className="w-[112px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {channels.map((channel) => (
                <TableRow key={channel.id}>
                  <TableCell className="font-medium">{channel.name}</TableCell>
                  <TableCell>
                    <StatusBadge status={channel.provider} />
                  </TableCell>
                  <TableCell>{channel.events.join(", ") || "All"}</TableCell>
                  <TableCell className="space-x-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        runAction(
                          () => api.testNotificationChannel(channel.id),
                          "Test sent",
                          onChanged,
                        )
                      }
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        runAction(
                          () => api.deleteNotificationChannel(channel.id),
                          "Channel deleted",
                          onChanged,
                        )
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {channels.length === 0 && (
                <EmptyRow
                  colSpan={4}
                  label="No notification channels configured."
                />
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export function WorkersTab({
  nodes,
  onChanged,
}: {
  nodes: ConsoleWorkerNode[];
  onChanged: () => void;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ConsoleWorkerNode["kind"]>("local");
  const [endpoint, setEndpoint] = useState("");

  async function createNode() {
    await runAction(
      () =>
        api.createWorkerNode({ name, kind, endpoint: endpoint || undefined }),
      "Worker node added",
      () => {
        setName("");
        setEndpoint("");
        onChanged();
      },
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
      <Card>
        <CardHeader>
          <CardTitle>Register Worker</CardTitle>
          <CardDescription>
            Local workers validate by heartbeat; remote and cloud workers
            validate by endpoint.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Kind">
            <Select
              value={kind}
              onValueChange={(value) =>
                setKind(value as ConsoleWorkerNode["kind"])
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="local">Local</SelectItem>
                <SelectItem value="remote">Remote</SelectItem>
                <SelectItem value="cloud">Cloud</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Endpoint">
            <Input
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="https://worker.example.com/health"
            />
          </Field>
          <Button onClick={createNode} disabled={!name}>
            <ServerCog className="mr-1.5 h-4 w-4" />
            Register
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Worker Nodes</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last seen</TableHead>
                <TableHead className="w-[112px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {nodes.map((node) => (
                <TableRow key={node.id}>
                  <TableCell className="font-medium">{node.name}</TableCell>
                  <TableCell>{node.kind}</TableCell>
                  <TableCell>
                    <StatusBadge status={node.status} />
                  </TableCell>
                  <TableCell>{formatDate(node.lastSeenAt)}</TableCell>
                  <TableCell className="space-x-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        runAction(
                          () => api.validateWorkerNode(node.id),
                          "Worker validated",
                          onChanged,
                        )
                      }
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        runAction(
                          () => api.deleteWorkerNode(node.id),
                          "Worker deleted",
                          onChanged,
                        )
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {nodes.length === 0 && (
                <EmptyRow colSpan={5} label="No worker nodes registered." />
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export function BackupsTab({
  backups,
  onChanged,
}: {
  backups: ConsoleArtifactBackup[];
  onChanged: () => void;
}) {
  const [storageObjectId, setStorageObjectId] = useState("");
  const backupSources = useMemo(
    () =>
      backups.filter(
        (backup) => backup.storageObjectId && backup.sourceStorageKey,
      ),
    [backups],
  );

  async function createBackup() {
    await runAction(
      () => api.createArtifactBackup(storageObjectId),
      "Backup created",
      () => {
        setStorageObjectId("");
        onChanged();
      },
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
      <Card>
        <CardHeader>
          <CardTitle>Create Backup</CardTitle>
          <CardDescription>
            Copy a dataset or tile artifact from its storage key into backup
            storage.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {backupSources.length > 0 && (
            <Field label="Recent artifact">
              <Select
                value={storageObjectId || "manual"}
                onValueChange={(value) =>
                  setStorageObjectId(value === "manual" ? "" : value)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual ID</SelectItem>
                  {backupSources.map((backup) => (
                    <SelectItem
                      key={backup.id}
                      value={backup.storageObjectId ?? ""}
                    >
                      {backup.sourceStorageKey}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
          <Field label="Storage object ID">
            <Input
              value={storageObjectId}
              onChange={(e) => setStorageObjectId(e.target.value)}
            />
          </Field>
          <Button onClick={createBackup} disabled={!storageObjectId}>
            <ArchiveRestore className="mr-1.5 h-4 w-4" />
            Back up
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Artifact Backups</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-[96px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {backups.map((backup) => (
                <TableRow key={backup.id}>
                  <TableCell>
                    <StatusBadge status={backup.status} />
                  </TableCell>
                  <TableCell>{backup.provider}</TableCell>
                  <TableCell>{formatBytes(backup.size)}</TableCell>
                  <TableCell>{formatDate(backup.createdAt)}</TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="outline"
                      aria-label={`Restore backup from ${backup.sourceStorageKey}`}
                      title="Restore backup"
                      disabled={backup.status === "failed"}
                      onClick={() =>
                        runAction(
                          () => api.restoreArtifactBackup(backup.id),
                          "Backup restored",
                          onChanged,
                        )
                      }
                    >
                      <ArchiveRestore className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {backups.length === 0 && (
                <EmptyRow colSpan={5} label="No artifact backups yet." />
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export function DeliveryTab({
  previews,
  domains,
  tilesets,
  onChanged,
}: {
  previews: ConsolePreviewLink[];
  domains: ConsoleCustomDomain[];
  tilesets: ConsoleTileset[];
  onChanged: () => void;
}) {
  const [previewResourceType, setPreviewResourceType] = useState("tileset");
  const [previewResourceId, setPreviewResourceId] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [domainResourceType, setDomainResourceType] = useState("tileset");
  const [domainResourceId, setDomainResourceId] = useState("");
  const [host, setHost] = useState("");

  function selectResource(value: string, target: "preview" | "domain") {
    if (target === "preview")
      setPreviewResourceId(value === "manual" ? "" : value);
    else setDomainResourceId(value === "manual" ? "" : value);
  }

  async function createPreview() {
    await runAction(
      () =>
        api.createPreviewLink({
          resourceType: previewResourceType,
          resourceId: previewResourceId,
          targetUrl,
        }),
      "Preview link created",
      () => {
        setPreviewResourceId("");
        setTargetUrl("");
        onChanged();
      },
    );
  }

  async function createDomain() {
    await runAction(
      () =>
        api.createCustomDomain({
          resourceType: domainResourceType,
          resourceId: domainResourceId || undefined,
          host,
        }),
      "Custom domain created",
      () => {
        setDomainResourceId("");
        setHost("");
        onChanged();
      },
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Create Preview</CardTitle>
            <CardDescription>
              Temporary links can point at TileJSON, style JSON, or review URLs.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Resource type">
                <Select
                  value={previewResourceType}
                  onValueChange={setPreviewResourceType}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tileset">Tileset</SelectItem>
                    <SelectItem value="style">Style</SelectItem>
                    <SelectItem value="dataset">Dataset</SelectItem>
                    <SelectItem value="url">URL</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Resource">
                <ResourceSelector
                  resourceId={previewResourceId}
                  resourceType={previewResourceType}
                  tilesets={tilesets}
                  onSelect={(value) => selectResource(value, "preview")}
                  onManual={setPreviewResourceId}
                />
              </Field>
            </div>
            <Field label="Target URL">
              <Input
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
              />
            </Field>
            <Button
              onClick={createPreview}
              disabled={!previewResourceId || !targetUrl}
            >
              <Link2 className="mr-1.5 h-4 w-4" />
              Create preview
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Add Domain</CardTitle>
            <CardDescription>
              Domains start pending with a verification token for DNS setup.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Resource type">
                <Select
                  value={domainResourceType}
                  onValueChange={setDomainResourceType}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tileset">Tileset</SelectItem>
                    <SelectItem value="style">Style</SelectItem>
                    <SelectItem value="dataset">Dataset</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Resource">
                <ResourceSelector
                  resourceId={domainResourceId}
                  resourceType={domainResourceType}
                  tilesets={tilesets}
                  onSelect={(value) => selectResource(value, "domain")}
                  onManual={setDomainResourceId}
                />
              </Field>
            </div>
            <Field label="Host">
              <Input value={host} onChange={(e) => setHost(e.target.value)} />
            </Field>
            <Button onClick={createDomain} disabled={!host}>
              <Globe className="mr-1.5 h-4 w-4" />
              Add domain
            </Button>
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <DeliveryList
          title="Preview Links"
          rows={previews}
          onChanged={onChanged}
        />
        <DomainList domains={domains} onChanged={onChanged} />
      </div>
    </div>
  );
}

function ResourceSelector({
  onManual,
  onSelect,
  resourceId,
  resourceType,
  tilesets,
}: {
  onManual: (value: string) => void;
  onSelect: (value: string) => void;
  resourceId: string;
  resourceType: string;
  tilesets: ConsoleTileset[];
}) {
  if (resourceType !== "tileset" || tilesets.length === 0) {
    return (
      <Input value={resourceId} onChange={(e) => onManual(e.target.value)} />
    );
  }

  return (
    <div className="space-y-2">
      <Select value={resourceId || "manual"} onValueChange={onSelect}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="manual">Manual ID</SelectItem>
          {tilesets.map((tileset) => (
            <SelectItem key={tileset.id} value={tileset.id}>
              {tileset.name} ({tileset.handle})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input value={resourceId} onChange={(e) => onManual(e.target.value)} />
    </div>
  );
}

function DeliveryList({
  title,
  rows,
  onChanged,
}: {
  title: string;
  rows: ConsolePreviewLink[];
  onChanged: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Slug</TableHead>
              <TableHead>Resource</TableHead>
              <TableHead className="w-[96px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">{row.slug}</TableCell>
                <TableCell>{row.resourceType}</TableCell>
                <TableCell className="space-x-1">
                  <Button size="sm" variant="outline" asChild>
                    <a
                      href={row.targetUrl}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Open preview ${row.slug}`}
                      title="Open preview"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    aria-label={`Delete preview ${row.slug}`}
                    title="Delete preview"
                    onClick={() =>
                      runAction(
                        () => api.deletePreviewLink(row.id),
                        "Preview deleted",
                        onChanged,
                      )
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <EmptyRow colSpan={3} label="No preview links yet." />
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function DomainList({
  domains,
  onChanged,
}: {
  domains: ConsoleCustomDomain[];
  onChanged: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Custom Domains</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Host</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Token</TableHead>
              <TableHead className="w-[112px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {domains.map((domain) => (
              <TableRow key={domain.id}>
                <TableCell className="font-medium">{domain.host}</TableCell>
                <TableCell>
                  <StatusBadge status={domain.status} />
                </TableCell>
                <TableCell className="max-w-[180px] truncate text-xs">
                  {domain.verificationToken}
                </TableCell>
                <TableCell className="space-x-1">
                  <Button
                    size="sm"
                    variant="outline"
                    aria-label={`Verify domain ${domain.host}`}
                    title="Verify domain"
                    onClick={() =>
                      runAction(
                        () => api.verifyCustomDomain(domain.id),
                        "Domain verified",
                        onChanged,
                      )
                    }
                  >
                    <CheckCircle2 className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    aria-label={`Delete domain ${domain.host}`}
                    title="Delete domain"
                    onClick={() =>
                      runAction(
                        () => api.deleteCustomDomain(domain.id),
                        "Domain deleted",
                        onChanged,
                      )
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {domains.length === 0 && (
              <EmptyRow colSpan={4} label="No custom domains yet." />
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export function TemplatesTab({
  templates,
  onChanged,
}: {
  templates: ConsoleWorkflowTemplate[];
  onChanged: () => void;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("import-workflow");
  const [description, setDescription] = useState("");
  const [template, setTemplate] = useState("{}");

  async function createTemplate() {
    await runAction(
      () =>
        api.createWorkflowTemplate({
          name,
          category,
          description: description || undefined,
          template: parseJsonObject(template),
        }),
      "Template created",
      () => {
        setName("");
        setDescription("");
        setTemplate("{}");
        onChanged();
      },
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
      <Card>
        <CardHeader>
          <CardTitle>Create Template</CardTitle>
          <CardDescription>
            Store reusable execution targets, schedules, and import workflow
            payloads.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Category">
            <Input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
          </Field>
          <Field label="Description">
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
          <Field label="Template JSON">
            <Textarea
              rows={6}
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
            />
          </Field>
          <Button onClick={createTemplate} disabled={!name || !category}>
            <ClipboardList className="mr-1.5 h-4 w-4" />
            Create
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Workflow Templates</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="w-[56px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((templateRow) => (
                <TableRow key={templateRow.id}>
                  <TableCell className="font-medium">
                    {templateRow.name}
                  </TableCell>
                  <TableCell>{templateRow.category}</TableCell>
                  <TableCell>
                    {templateRow.builtIn ? "Built-in" : "Custom"}
                  </TableCell>
                  <TableCell>
                    {!templateRow.builtIn && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          runAction(
                            () => api.deleteWorkflowTemplate(templateRow.id),
                            "Template deleted",
                            onChanged,
                          )
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {templates.length === 0 && (
                <EmptyRow colSpan={4} label="No templates available." />
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
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

function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const variant =
    normalized.includes("fail") ||
    normalized.includes("error") ||
    normalized === "offline"
      ? "destructive"
      : normalized.includes("healthy") ||
          normalized.includes("success") ||
          normalized.includes("complete")
        ? "default"
        : "secondary";
  return <Badge variant={variant}>{status.replaceAll("_", " ")}</Badge>;
}

function EmptyRow({ colSpan, label }: { colSpan: number; label: string }) {
  return (
    <TableRow>
      <TableCell
        colSpan={colSpan}
        className="h-20 text-center text-sm text-muted-foreground"
      >
        {label}
      </TableCell>
    </TableRow>
  );
}

async function runAction<T>(
  action: () => Promise<T>,
  message: string,
  onDone: () => void,
) {
  try {
    await action();
    toast.success(message);
    onDone();
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Operation failed");
  }
}
