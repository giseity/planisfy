import { adminMetadata } from "../../lib/metadata";

export const metadata = adminMetadata({
  title: "Schedules",
  description: "Manage custom command schedules for platform operations.",
  path: "/schedules",
});

import { and, desc, eq, isNull } from "drizzle-orm"
import { db, scheduledOperations } from "@planisfy/database"
import { Badge } from "@planisfy/ui/components/badge"
import { Button } from "@planisfy/ui/components/button"
import { Card, CardContent, CardHeader, CardTitle } from "@planisfy/ui/components/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@planisfy/ui/components/table"
import { requireAdmin } from "@/features/auth/admin-auth"
import {
  createCustomCommandScheduleAction,
  deleteCustomCommandScheduleAction,
  runCustomCommandScheduleAction,
} from "@/features/operations/ops-actions"
import { formatDate, shortId, statusBadgeVariant, truncate } from "@/features/operations/ops"

export const dynamic = "force-dynamic"

export default async function SchedulesPage() {
  await requireAdmin()
  const schedules = await db
    .select()
    .from(scheduledOperations)
    .where(andCustomCommand())
    .orderBy(desc(scheduledOperations.createdAt))
    .limit(100)

  return (
    <div className="space-y-5 p-6">
      <div>
        <h1 className="text-2xl font-bold">Custom Command Schedules</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Create, run, and delete operator-only custom command schedules.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Create custom command schedule</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createCustomCommandScheduleAction} className="grid gap-3 lg:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Account ID</span>
              <input
                name="accountId"
                required
                className="h-8 rounded-md border border-input bg-background px-3 py-1 text-sm"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Name</span>
              <input
                name="name"
                required
                className="h-8 rounded-md border border-input bg-background px-3 py-1 text-sm"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Cron</span>
              <input
                name="cron"
                required
                defaultValue="0 2 * * *"
                className="h-8 rounded-md border border-input bg-background px-3 py-1 text-sm"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Timezone</span>
              <input
                name="timezone"
                defaultValue="UTC"
                className="h-8 rounded-md border border-input bg-background px-3 py-1 text-sm"
              />
            </label>
            <label className="grid gap-1 text-sm lg:col-span-2">
              <span className="font-medium">Payload JSON</span>
              <textarea
                name="payload"
                required
                rows={7}
                defaultValue={'{\n  "command": "example:maintenance"\n}'}
                className="rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
              />
            </label>
            <div className="lg:col-span-2">
              <Button type="submit" size="sm">Create schedule</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Custom command schedules</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Schedule</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Cron</TableHead>
                <TableHead>Last run</TableHead>
                <TableHead>Payload</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {schedules.map((schedule) => (
                <TableRow key={schedule.id}>
                  <TableCell>
                    <div className="font-medium text-sm">{schedule.name}</div>
                    <div className="font-mono text-xs text-muted-foreground">
                      {shortId(schedule.id)} · {shortId(schedule.accountId)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(schedule.status)}>{schedule.status}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{schedule.cron}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs">
                    {formatDate(schedule.lastRunAt)}
                  </TableCell>
                  <TableCell className="max-w-md">
                    <code className="block truncate text-[11px] text-muted-foreground">
                      {truncate(JSON.stringify(schedule.payload), 160)}
                    </code>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <form action={runCustomCommandScheduleAction}>
                        <input type="hidden" name="id" value={schedule.id} />
                        <Button type="submit" size="xs" variant="outline">Run</Button>
                      </form>
                      <form action={deleteCustomCommandScheduleAction}>
                        <input type="hidden" name="id" value={schedule.id} />
                        <Button type="submit" size="xs" variant="destructive">Delete</Button>
                      </form>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {schedules.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                    No custom command schedules found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

function andCustomCommand() {
  return and(eq(scheduledOperations.kind, "custom_command"), isNull(scheduledOperations.deletedAt))
}
