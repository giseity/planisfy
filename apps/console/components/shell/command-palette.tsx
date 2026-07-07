"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@planisfy/ui/components/command"
import { Button } from "@planisfy/ui/components/button"
import { filterConsoleNavGroups } from "@/lib/console-navigation"
import { api } from "@/lib/api"
import type { BillingInfo } from "@/features/settings/model"
import type { DeploymentMode } from "@/lib/deployment-mode"
import { Database, KeyRound, Palette, Search, Upload } from "lucide-react"

const workflowItems = [
  {
    href: "/styles",
    label: "Create style",
    description: "Open the style workspace to create or edit a map style.",
    hint: "Styles",
    keywords: ["new style", "map style", "editor"],
    icon: Palette,
  },
  {
    href: "/tilesets",
    label: "Upload tileset",
    description: "Import source data and publish tileset artifacts.",
    hint: "Tilesets",
    keywords: ["source upload", "pmtiles", "data import"],
    icon: Upload,
  },
  {
    href: "/keys",
    label: "Create API key",
    description: "Manage credentials for public API access.",
    hint: "API keys",
    keywords: ["token", "credential", "developer key"],
    icon: KeyRound,
  },
  {
    href: "/tilesets",
    label: "Import Overture data",
    description: "Start from Overture places, buildings, roads, or base data.",
    hint: "Tilesets",
    keywords: ["overture", "places", "buildings", "roads"],
    icon: Database,
  },
]

const navDescriptions: Record<string, string> = {
  "/": "Review account activity, usage, and resource status.",
  "/styles": "Create, inspect, and publish MapLibre styles.",
  "/tilesets": "Upload, import, process, and publish geospatial datasets.",
  "/keys": "Create and rotate API keys for applications.",
  "/usage": "Track request volume, quotas, and metered usage.",
  "/integration": "Find endpoints, SDK guidance, and integration details.",
  "/operations": "Monitor jobs, workers, notifications, routing, and delivery.",
  "/platform": "Configure the self-hosted control plane.",
  "/platform/environment": "Review runtime services and environment readiness.",
  "/organization": "Manage organization profile and workspace settings.",
  "/team": "Invite users and review team access.",
  "/billing": "Review subscription, plan, and billing status.",
  "/settings/profile": "Update your profile and personal preferences.",
  "/settings/security": "Manage security settings and authentication.",
}

export function CommandPalette() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setOpen((current) => !current)
      }
    }

    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [])

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="hidden min-w-48 justify-between gap-3 px-2 text-muted-foreground md:flex"
        onClick={() => setOpen(true)}
      >
        <span className="flex items-center gap-2">
          <Search className="size-4" />
          Search
        </span>
        <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          Ctrl K
        </kbd>
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="md:hidden"
        aria-label="Open command palette"
        onClick={() => setOpen(true)}
      >
        <Search className="size-4" />
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandPaletteContent onSelect={() => setOpen(false)} />
      </CommandDialog>
    </>
  )
}

export function CommandPaletteContent({
  onSelect,
}: {
  onSelect?: () => void
}) {
  const router = useRouter()
  const [deploymentMode, setDeploymentMode] = useState<DeploymentMode | null>(null)

  useEffect(() => {
    api
      .get<BillingInfo>("/billing")
      .then((billing) => setDeploymentMode(billing.deploymentMode))
      .catch(() => setDeploymentMode(null))
  }, [])

  const navGroups = useMemo(
    () =>
      filterConsoleNavGroups(deploymentMode).map((group) => ({
        ...group,
        items: group.items.map((item) => ({
          ...item,
          description: navDescriptions[item.href],
          keywords: [group.label, item.label, item.href, navDescriptions[item.href]].filter(
            (keyword): keyword is string => Boolean(keyword),
          ),
        })),
      })),
    [deploymentMode],
  )

  function go(href: string) {
    onSelect?.()
    router.push(href)
  }

  return (
    <>
      <CommandInput placeholder="Search pages and workflows..." />
      <CommandList className="max-h-[520px]">
        <CommandEmpty>No command found.</CommandEmpty>
        {navGroups.map((group) => (
          <CommandGroup
            key={group.label}
            heading={group.label}
            className="[&_[cmdk-group-items]]:space-y-1"
          >
            {group.items.map((item) => (
              <CommandItem
                key={item.href}
                className="min-h-11 gap-3 px-3 py-2"
                keywords={item.keywords}
                onSelect={() => go(item.href)}
                value={`${group.label} ${item.label}`}
              >
                <item.icon className="size-4" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{item.label}</span>
                  {item.description ? (
                    <span className="block truncate text-xs text-muted-foreground">
                      {item.description}
                    </span>
                  ) : null}
                </span>
                <CommandShortcut className="tracking-normal">{item.href}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
        <CommandSeparator className="my-1" />
        <CommandGroup heading="Workflows" className="[&_[cmdk-group-items]]:space-y-1">
          {workflowItems.map((item) => (
            <CommandItem
              key={item.label}
              className="min-h-11 gap-3 px-3 py-2"
              keywords={item.keywords}
              onSelect={() => go(item.href)}
              value={item.label}
            >
              <item.icon className="size-4" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{item.label}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {item.description}
                </span>
              </span>
              <CommandShortcut className="tracking-normal">{item.hint}</CommandShortcut>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </>
  )
}
