import { Badge } from "@planisfy/ui/components/badge"
import { Button } from "@planisfy/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@planisfy/ui/components/card"
import {
  PageActions,
  PageDescription,
  PageHeader,
  PageHeaderText,
  PageTitle,
} from "@planisfy/ui/components/page-header"
import { Switch } from "@planisfy/ui/components/switch"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@planisfy/ui/components/dropdown-menu"
import { Flag, MoreHorizontal, Plus } from "lucide-react"
import { requireAdmin } from "@/lib/admin-auth"
import type { ComponentProps } from "react"

export const dynamic = "force-dynamic"

const scopes = ["All", "Global", "Managed", "Self-host", "Enterprise"]

const flags = [
  {
    name: "overture_imports",
    label: "Overture Imports",
    desc: "Allow users to import Overture Maps Foundation data.",
    enabled: true,
    scope: "global",
    updated: "Jun 5",
  },
  {
    name: "elevation_api",
    label: "Elevation API",
    desc: "Enable the /v1/elevation endpoint.",
    enabled: false,
    scope: "global",
    updated: "May 28",
  },
  {
    name: "static_maps",
    label: "Static Map Rendering",
    desc: "Server-side static map image generation.",
    enabled: false,
    scope: "global",
    updated: "May 20",
  },
  {
    name: "custom_exec_targets",
    label: "Custom Execution Targets",
    desc: "Allow self-host admins to configure custom worker runtimes.",
    enabled: true,
    scope: "self-host",
    updated: "Jun 1",
  },
  {
    name: "usage_billing_v2",
    label: "Usage Billing v2",
    desc: "New metered billing pipeline with per-unit tracking.",
    enabled: true,
    scope: "managed",
    updated: "Jun 8",
  },
  {
    name: "sso_saml",
    label: "SSO / SAML",
    desc: "Enterprise single sign-on via SAML 2.0.",
    enabled: false,
    scope: "enterprise",
    updated: "Apr 15",
  },
  {
    name: "public_signup",
    label: "Public Signup",
    desc: "Allow new user registration without invitation.",
    enabled: true,
    scope: "managed",
    updated: "Mar 1",
  },
  {
    name: "worker_autoscale",
    label: "Worker Autoscaling",
    desc: "Automatically scale processing workers based on queue depth.",
    enabled: false,
    scope: "self-host",
    updated: "Jun 3",
  },
]

export default async function FeatureFlagsPage() {
  await requireAdmin()

  return (
    <div className="space-y-5">
      <PageHeader>
        <PageHeaderText>
          <PageTitle>Feature Flags</PageTitle>
          <PageDescription>
            Toggle platform capabilities and experimental features.
          </PageDescription>
        </PageHeaderText>
        <PageActions>
          <Button>
            <Plus className="h-4 w-4" />
            Create flag
          </Button>
        </PageActions>
      </PageHeader>

      <div className="flex flex-wrap gap-1 rounded-md border bg-muted/20 p-1">
        {scopes.map((scope, index) => (
          <Button
            key={scope}
            size="sm"
            variant={index === 0 ? "secondary" : "ghost"}
          >
            {scope}
          </Button>
        ))}
      </div>

      <div className="space-y-2">
        {flags.map((flag) => (
          <Card key={flag.name}>
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <Switch checked={flag.enabled} aria-label={`${flag.label} enabled`} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">{flag.label}</p>
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                    {flag.name}
                  </code>
                  <Badge variant={scopeVariant(flag.scope)}>{flag.scope}</Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{flag.desc}</p>
              </div>
              <span className="text-xs text-muted-foreground">{flag.updated}</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${flag.label}`}>
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem>Edit targeting</DropdownMenuItem>
                  <DropdownMenuItem>View history</DropdownMenuItem>
                  <DropdownMenuItem>Archive flag</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Flag className="h-4 w-4 text-muted-foreground" />
            Flag governance
          </CardTitle>
          <CardDescription>
            Structural placeholder for approval rules, rollout percentages, and account-level overrides.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}

function scopeVariant(scope: string): ComponentProps<typeof Badge>["variant"] {
  if (scope === "managed") return "default"
  if (scope === "self-host") return "secondary"
  if (scope === "enterprise") return "warning"
  return "outline"
}
