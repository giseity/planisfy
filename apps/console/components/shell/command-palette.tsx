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
    hint: "Open styles",
    icon: Palette,
  },
  {
    href: "/tilesets",
    label: "Upload tileset",
    hint: "Open tilesets",
    icon: Upload,
  },
  {
    href: "/keys",
    label: "Create API key",
    hint: "Open API keys",
    icon: KeyRound,
  },
  {
    href: "/tilesets",
    label: "Import Overture data",
    hint: "Open tilesets",
    icon: Database,
  },
]

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
          keywords: `${group.label} ${item.label} ${item.href}`,
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
          <CommandGroup key={group.label} heading={group.label}>
            {group.items.map((item) => (
              <CommandItem
                key={item.href}
                keywords={[item.keywords]}
                onSelect={() => go(item.href)}
                value={`${group.label} ${item.label}`}
              >
                <item.icon className="size-4" />
                <span>{item.label}</span>
                <CommandShortcut>{item.href}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
        <CommandSeparator />
        <CommandGroup heading="Workflows">
          {workflowItems.map((item) => (
            <CommandItem
              key={item.label}
              onSelect={() => go(item.href)}
              value={item.label}
            >
              <item.icon className="size-4" />
              <span>{item.label}</span>
              <CommandShortcut>{item.hint}</CommandShortcut>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </>
  )
}
