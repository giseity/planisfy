"use client";

import {
  type ConsoleJobTimeline,
  type ConsoleOperationsOverview,
} from "@/lib/api";
import { formatDate } from "@/components/operations/model";
import { EmptyRow, StatusBadge } from "@/components/operations/ui";
import { Button } from "@planisfy/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@planisfy/ui/components/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@planisfy/ui/components/table";
import { ClipboardList } from "lucide-react";

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
