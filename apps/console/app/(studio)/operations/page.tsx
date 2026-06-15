"use client"

import { AlertTriangle, CheckCircle2, ClipboardList, Loader2, XCircle } from "lucide-react"
import type { ComponentProps, ReactNode } from "react"
import { Badge } from "@planisfy/ui/components/badge"
import { Button } from "@planisfy/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@planisfy/ui/components/card"
import { Progress } from "@planisfy/ui/components/progress"
import { StatusAlert } from "@planisfy/ui/components/status-alert"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@planisfy/ui/components/table"
import { useOperations } from "@/components/operations/provider"

export default function OperationsPage() {
  const { overview, openTimeline } = useOperations()
  const jobs = overview.recentJobs
  const activeJobs = jobs.filter((job) => isActiveJob(job.status))
  const completed24h = jobs.filter((job) => job.status === "SUCCEEDED").length
  const failed24h = jobs.filter((job) => job.status === "FAILED").length
  const activeJob = activeJobs[0] ?? jobs.find((job) => job.progress > 0 && job.progress < 100)
  const failedJob = jobs.find((job) => job.status === "FAILED")

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-4">
        <SummaryCard icon={<Loader2 className="h-4 w-4" />} label="Active jobs" value={activeJobs.length} detail="processing" />
        <SummaryCard icon={<CheckCircle2 className="h-4 w-4" />} label="Completed (24h)" value={completed24h} />
        <SummaryCard icon={<XCircle className="h-4 w-4" />} label="Failed (24h)" value={failed24h} tone="destructive" />
        <SummaryCard icon={<ClipboardList className="h-4 w-4" />} label="Avg duration" value="14m" detail="last 10 jobs" />
      </div>

      {activeJob && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <span className="mt-2 h-2 w-2 rounded-full bg-amber-500" />
                <div>
                  <p className="text-sm font-medium">
                    {activeJob.type} - {activeJob.input?.tilesetId ?? activeJob.input?.datasetId ?? "processing target"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Started {formatDate(activeJob.startedAt ?? activeJob.createdAt)}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => openTimeline(activeJob.id)}>
                  View logs
                </Button>
                <Button variant="outline" size="sm">
                  Cancel
                </Button>
              </div>
            </div>
            <Progress value={activeJob.progress} className="h-1.5" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{activeJob.progress}% complete</span>
              <span>ETA calculated by worker profile</span>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent jobs</CardTitle>
          <CardDescription>Processing jobs with progress, status, and timeline actions.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((job) => (
                <TableRow key={job.id}>
                  <TableCell className="font-medium">{job.type}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {job.input?.tilesetId ?? job.input?.datasetId ?? job.input?.uploadId ?? "-"}
                  </TableCell>
                  <TableCell>
                    <div className="w-28 space-y-1">
                      <Progress value={job.progress} className="h-1" />
                      <span className="text-xs text-muted-foreground">{job.progress}%</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={job.status} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(job.updatedAt)}
                  </TableCell>
                  <TableCell>
                    <Button variant="outline" size="sm" onClick={() => openTimeline(job.id)}>
                      Logs
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {jobs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-sm text-muted-foreground">
                    No processing jobs yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {failedJob && (
        <StatusAlert
          variant="destructive"
          icon={<AlertTriangle className="h-4 w-4" />}
          title={`${failedJob.type} failed`}
          description={failedJob.errorMessage ?? "Inspect the job timeline for details."}
          action={<Button variant="outline" size="xs">Retry</Button>}
        />
      )}
    </div>
  )
}

function SummaryCard({
  detail,
  icon,
  label,
  tone,
  value,
}: {
  detail?: string
  icon: ReactNode
  label: string
  tone?: "destructive"
  value: ReactNode
}) {
  return (
    <Card className={tone === "destructive" ? "border-destructive/30" : undefined}>
      <CardContent className="flex min-h-24 items-center gap-3 p-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-semibold">{value}</p>
          {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
        </div>
      </CardContent>
    </Card>
  )
}

function StatusBadge({ status }: { status: string }) {
  const variant: ComponentProps<typeof Badge>["variant"] =
    status === "SUCCEEDED"
      ? "success"
      : status === "FAILED"
        ? "destructive"
        : status === "RUNNING" || status === "PROCESSING"
          ? "warning"
          : "secondary"

  return <Badge variant={variant}>{status}</Badge>
}

function isActiveJob(status: string) {
  return ["RUNNING", "PROCESSING", "QUEUED"].includes(status)
}

function formatDate(value: string | null) {
  if (!value) return "-"
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}
