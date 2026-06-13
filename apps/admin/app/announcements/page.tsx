import { Badge } from "@planisfy/ui/components/badge"
import { Button } from "@planisfy/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@planisfy/ui/components/card"
import { MetricCard } from "@planisfy/ui/components/metric-card"
import {
  PageActions,
  PageDescription,
  PageHeader,
  PageHeaderText,
  PageTitle,
} from "@planisfy/ui/components/page-header"
import { StatusAlert } from "@planisfy/ui/components/status-alert"
import {
  Clock,
  Eye,
  FilePenLine,
  Megaphone,
  MoreHorizontal,
  Pencil,
  Plus,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@planisfy/ui/components/dropdown-menu"
import { requireAdmin } from "@/lib/admin-auth"
import type { ComponentProps } from "react"

export const dynamic = "force-dynamic"

const announcements = [
  {
    id: 1,
    title: "Scheduled maintenance window",
    body: "Platform will be unavailable Jun 15, 02:00-04:00 UTC for database migration.",
    status: "scheduled",
    audience: "all",
    created: "Jun 9",
    publish: "Jun 12",
  },
  {
    id: 2,
    title: "New: Overture Maps imports",
    body: "Users can import building, POI, and transportation data directly from Overture Maps Foundation.",
    status: "published",
    audience: "all",
    created: "Jun 5",
    publish: "Jun 5",
  },
  {
    id: 3,
    title: "Rate limit changes for Free plan",
    body: "Starting Jul 1, Free plan rate limits will be reduced from 100 to 60 requests per minute.",
    status: "draft",
    audience: "free",
    created: "Jun 8",
    publish: "-",
  },
]

export default async function AnnouncementsPage() {
  await requireAdmin()

  return (
    <div className="space-y-5">
      <PageHeader>
        <PageHeaderText>
          <PageTitle>Announcements</PageTitle>
          <PageDescription>Broadcast messages to platform users.</PageDescription>
        </PageHeaderText>
        <PageActions>
          <Button>
            <Plus className="h-4 w-4" />
            Create announcement
          </Button>
        </PageActions>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          icon={<Megaphone className="h-4 w-4" />}
          label="Published"
          value="1"
        />
        <MetricCard icon={<Clock className="h-4 w-4" />} label="Scheduled" value="1" />
        <MetricCard icon={<FilePenLine className="h-4 w-4" />} label="Drafts" value="1" />
      </div>

      <div className="space-y-3">
        {announcements.map((announcement) => (
          <Card key={announcement.id}>
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold">{announcement.title}</p>
                    <Badge variant={statusVariant(announcement.status)}>
                      {announcement.status}
                    </Badge>
                    <Badge variant="outline">Audience: {announcement.audience}</Badge>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {announcement.body}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon-sm" aria-label={`Edit ${announcement.title}`}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${announcement.title}`}>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem>Duplicate</DropdownMenuItem>
                      <DropdownMenuItem>Preview</DropdownMenuItem>
                      <DropdownMenuItem>Archive</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                <span>Created: {announcement.created}</span>
                <span>Publish: {announcement.publish}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Eye className="h-4 w-4 text-muted-foreground" />
            Banner preview
          </CardTitle>
          <CardDescription>How the announcement appears to users.</CardDescription>
        </CardHeader>
        <CardContent>
          <StatusAlert
            icon={<Megaphone className="h-4 w-4" />}
            title="Scheduled maintenance window"
            description="Platform will be unavailable Jun 15, 02:00-04:00 UTC for database migration."
            action={<Button variant="outline" size="xs">Dismiss</Button>}
          />
        </CardContent>
      </Card>
    </div>
  )
}

function statusVariant(status: string): ComponentProps<typeof Badge>["variant"] {
  if (status === "published") return "success"
  if (status === "scheduled") return "warning"
  return "secondary"
}
