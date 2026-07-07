import { adminMetadata } from "../../lib/metadata";

export const metadata = adminMetadata({
  title: "Announcements",
  description: "Create and manage platform announcements for Planisfy users.",
  path: "/announcements",
});

import { desc, isNull } from "drizzle-orm"
import { announcements, db } from "@planisfy/database"
import { Badge } from "@planisfy/ui/components/badge"
import { Button } from "@planisfy/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@planisfy/ui/components/card"
import { Input } from "@planisfy/ui/components/input"
import { Label } from "@planisfy/ui/components/label"
import {
  PageActions,
  PageDescription,
  PageHeader,
  PageHeaderText,
  PageTitle,
} from "@planisfy/ui/components/page-header"
import { StatusAlert } from "@planisfy/ui/components/status-alert"
import { Textarea } from "@planisfy/ui/components/textarea"
import { Megaphone, Plus } from "lucide-react"
import { requireAdmin } from "@/features/auth/admin-auth"
import {
  createAnnouncementAction,
  updateAnnouncementStatusAction,
} from "@/features/platform/platform-admin-actions"
import type { ComponentProps } from "react"

export const dynamic = "force-dynamic"

export default async function AnnouncementsPage() {
  await requireAdmin()
  const rows = await db
    .select()
    .from(announcements)
    .where(isNull(announcements.archivedAt))
    .orderBy(desc(announcements.updatedAt))

  return (
    <div className="space-y-5">
      <PageHeader>
        <PageHeaderText>
          <PageTitle>Announcements</PageTitle>
          <PageDescription>
            Create and schedule persisted platform announcements.
          </PageDescription>
        </PageHeaderText>
        <PageActions>
          <Badge variant="secondary">{rows.length} active</Badge>
        </PageActions>
      </PageHeader>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Plus className="h-4 w-4 text-muted-foreground" />
            Create Announcement
          </CardTitle>
          <CardDescription>
            Drafts can be promoted to published or scheduled states.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createAnnouncementAction} className="grid gap-3 lg:grid-cols-[1fr_0.45fr_0.45fr]">
            <Field label="Title">
              <Input name="title" required />
            </Field>
            <Field label="Audience">
              <Input name="audience" defaultValue="all" />
            </Field>
            <Field label="Status">
              <select
                name="status"
                defaultValue="draft"
                className="h-8 w-full rounded-md border bg-background px-2 text-sm"
              >
                <option value="draft">Draft</option>
                <option value="scheduled">Scheduled</option>
                <option value="published">Published</option>
              </select>
            </Field>
            <Field label="Body">
              <Textarea name="body" rows={4} required />
            </Field>
            <Field label="Starts at">
              <Input name="startsAt" type="datetime-local" />
            </Field>
            <Field label="Ends at">
              <Input name="endsAt" type="datetime-local" />
            </Field>
            <div className="lg:col-span-3">
              <Button type="submit">
                <Megaphone className="h-4 w-4" />
                Create announcement
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {rows.map((announcement) => (
          <Card key={announcement.id}>
            <CardContent className="space-y-4 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold">
                      {announcement.title}
                    </p>
                    <Badge variant={statusVariant(announcement.status)}>
                      {announcement.status}
                    </Badge>
                    <Badge variant="outline">
                      Audience: {announcement.audience}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {announcement.body}
                  </p>
                </div>
                <form action={updateAnnouncementStatusAction} className="flex gap-2">
                  <input type="hidden" name="id" value={announcement.id} />
                  <select
                    name="status"
                    defaultValue={announcement.status}
                    className="h-8 rounded-md border bg-background px-2 text-sm"
                  >
                    <option value="draft">Draft</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="published">Published</option>
                    <option value="archived">Archived</option>
                  </select>
                  <Button type="submit" size="sm">
                    Save
                  </Button>
                </form>
              </div>
              <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                <span>Created: {formatDate(announcement.createdAt)}</span>
                <span>Starts: {formatDate(announcement.startsAt)}</span>
                <span>Ends: {formatDate(announcement.endsAt)}</span>
              </div>
            </CardContent>
          </Card>
        ))}
        {rows.length === 0 && (
          <StatusAlert
            icon={<Megaphone className="h-4 w-4" />}
            title="No announcements yet"
            description="Create a draft announcement to start the broadcast workflow."
          />
        )}
      </div>
    </div>
  )
}

function Field({
  children,
  label,
}: {
  children: React.ReactNode
  label: string
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  )
}

function statusVariant(status: string): ComponentProps<typeof Badge>["variant"] {
  if (status === "published") return "success"
  if (status === "scheduled") return "warning"
  if (status === "archived") return "secondary"
  return "outline"
}

function formatDate(value: Date | string | null) {
  if (!value) return "-"
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}
