import { adminMetadata } from "../../lib/metadata";

export const metadata = adminMetadata({
  title: "Upgrade",
  description: "Check upgrade readiness and platform release status.",
  path: "/upgrade",
});

import { Badge } from "@planisfy/ui/components/badge";
import { Button } from "@planisfy/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@planisfy/ui/components/card";
import { MetricCard } from "@planisfy/ui/components/metric-card";
import {
  PageActions,
  PageDescription,
  PageHeader,
  PageHeaderText,
  PageTitle,
} from "@planisfy/ui/components/page-header";
import { StatusAlert } from "@planisfy/ui/components/status-alert";
import { Input } from "@planisfy/ui/components/input";
import { Label } from "@planisfy/ui/components/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@planisfy/ui/components/table";
import {
  ArchiveRestore,
  CheckCircle2,
  ClipboardList,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  UploadCloud,
} from "lucide-react";

import { requirePlatformRole } from "@/features/auth/admin-auth";
import {
  supervisorApplyAction,
  supervisorBackupAction,
  supervisorPreflightAction,
  supervisorRollbackAction,
} from "@/features/supervisor/supervisor-actions";
import {
  getUpgradeCenterData,
  type SupervisorOperation,
} from "@/features/supervisor/supervisor";

export const dynamic = "force-dynamic";

export default async function UpgradePage() {
  await requirePlatformRole("OWNER");
  const data = await getUpgradeCenterData();

  return (
    <div className="space-y-6">
      <PageHeader>
        <PageHeaderText>
          <PageTitle>Upgrade Center</PageTitle>
          <PageDescription>
            {data.deploymentMode === "self_host"
              ? "Pinned self-host releases, backups, and guarded rollback."
              : "Managed upgrades are operated outside the self-host supervisor."}
          </PageDescription>
        </PageHeaderText>
        <PageActions>
          <Badge
            variant={
              data.configured && !data.error
                ? "success"
                : data.deploymentMode === "managed"
                  ? "secondary"
                  : "warning"
            }
          >
            {data.deploymentMode === "managed"
              ? "Managed mode"
              : data.configured
                ? "Supervisor configured"
                : "Supervisor disabled"}
          </Badge>
        </PageActions>
      </PageHeader>

      {data.error && (
        <StatusAlert
          variant="warning"
          icon={<ShieldAlert className="h-4 w-4" />}
          title="Supervisor unavailable"
          description={data.error}
        />
      )}

      {data.deploymentMode === "self_host" && (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <MetricCard
              icon={<CheckCircle2 className="h-4 w-4" />}
              label="Current Version"
              value={data.version?.version ?? "-"}
              detail={data.version?.composeFile ?? "Supervisor unavailable"}
            />
            <MetricCard
              icon={<ArchiveRestore className="h-4 w-4" />}
              label="Latest Backup"
              value={data.latestBackup?.status ?? "None"}
              detail={data.latestBackup?.backupDir ?? "Run backup before apply"}
            />
            <MetricCard
              icon={<ClipboardList className="h-4 w-4" />}
              label="Active Operation"
              value={data.activeOperation?.status ?? "Idle"}
              detail={data.activeOperation?.type ?? "No recent operation"}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
            <Card>
              <CardHeader>
                <CardTitle>Release Actions</CardTitle>
                <CardDescription>
                  Actions run from the Admin server through the token-protected
                  supervisor.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <form action={supervisorPreflightAction}>
                    <Button variant="outline" disabled={!data.configured}>
                      <RefreshCw className="h-4 w-4" />
                      Preflight
                    </Button>
                  </form>
                  <form action={supervisorBackupAction}>
                    <Button variant="outline" disabled={!data.configured}>
                      <ArchiveRestore className="h-4 w-4" />
                      Backup
                    </Button>
                  </form>
                </div>

                <form action={supervisorApplyAction} className="space-y-3">
                  <Field label="Target manifest path">
                    <Input
                      name="manifestPath"
                      placeholder="/data/releases/planisfy-1.0.0.json"
                    />
                  </Field>
                  <Field label="Successful backup operation ID">
                    <Input
                      name="backupOperationId"
                      defaultValue={data.latestBackup?.id ?? ""}
                    />
                  </Field>
                  <Button disabled={!data.configured || !data.latestBackup}>
                    <UploadCloud className="h-4 w-4" />
                    Apply pinned release
                  </Button>
                </form>

                <form action={supervisorRollbackAction} className="space-y-3">
                  <Field label="Rollback manifest path">
                    <Input
                      name="manifestPath"
                      placeholder="/data/releases/planisfy-previous.json"
                    />
                  </Field>
                  <Field label="Backup directory">
                    <Input
                      name="backupDir"
                      defaultValue={data.latestBackup?.backupDir ?? ""}
                    />
                  </Field>
                  <Button
                    variant="outline"
                    disabled={!data.configured || !data.latestBackup?.backupDir}
                  >
                    <RotateCcw className="h-4 w-4" />
                    Roll back
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Operation Log</CardTitle>
                <CardDescription>
                  Recent supervisor operations and the latest log tail.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Started</TableHead>
                      <TableHead>Target</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.operations.map((operation) => (
                      <TableRow key={operation.id}>
                        <TableCell className="font-medium">
                          {operation.type}
                        </TableCell>
                        <TableCell>
                          <OperationBadge status={operation.status} />
                        </TableCell>
                        <TableCell>{formatDate(operation.startedAt)}</TableCell>
                        <TableCell>{operation.targetVersion ?? "-"}</TableCell>
                      </TableRow>
                    ))}
                    {data.operations.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={4}
                          className="h-20 text-center text-sm text-muted-foreground"
                        >
                          No supervisor operations recorded.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>

                <LogTail operation={data.activeOperation} />
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function Field({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function OperationBadge({ status }: { status: SupervisorOperation["status"] }) {
  const variant =
    status === "FAILED"
      ? "destructive"
      : status === "SUCCEEDED"
        ? "success"
        : "warning";
  return <Badge variant={variant}>{status}</Badge>;
}

function LogTail({ operation }: { operation: SupervisorOperation | null }) {
  const logs = operation?.logs.slice(-10) ?? [];
  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-medium">Latest log tail</p>
        <span className="font-mono text-xs text-muted-foreground">
          {operation?.id.slice(0, 8) ?? "-"}
        </span>
      </div>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs">
        {logs.length > 0 ? logs.join("\n") : "No logs yet."}
      </pre>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  }).format(new Date(value));
}
