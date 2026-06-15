"use client"

import { useRouter } from "next/navigation"
import { Command } from "@planisfy/ui/components/command"
import { Badge } from "@planisfy/ui/components/badge"
import { Button } from "@planisfy/ui/components/button"
import {
  PageDescription,
  PageHeader,
  PageHeaderText,
  PageTitle,
} from "@planisfy/ui/components/page-header"
import { CommandPaletteContent } from "@/components/shell/command-palette"

export default function CommandPalettePage() {
  const router = useRouter()

  return (
    <div className="space-y-5">
      <PageHeader>
        <PageHeaderText>
          <PageTitle>Command Palette</PageTitle>
          <PageDescription>
            Search console destinations and jump into common workflows.
          </PageDescription>
        </PageHeaderText>
      </PageHeader>

      <div className="mx-auto max-w-3xl overflow-hidden rounded-lg border bg-card shadow-sm">
        <Command>
          <CommandPaletteContent />
        </Command>
      </div>

      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">Search</Badge>
          <Badge variant="secondary">Enter to open</Badge>
          <Badge variant="secondary">Mouse supported</Badge>
        </div>
        <Button variant="outline" onClick={() => router.back()}>
          Back
        </Button>
      </div>
    </div>
  )
}
