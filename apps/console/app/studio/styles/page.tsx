"use client"

import { useEffect, useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { StyleCard } from "@/components/studio/style-card"
import { StyleListItem } from "@/components/studio/style-list-item"
import { Button } from "@planisfy/ui/components/button"
import { Input } from "@planisfy/ui/components/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@planisfy/ui/components/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@planisfy/ui/components/select"
import { Plus, Map, Search, LayoutGrid, List } from "lucide-react"
import { api, type ApiEnvelope } from "@/lib/api"
import { createStyle } from "./actions"

interface StyleSummary {
  id: string
  name: string
  handle: string
  description: string | null
  isPublic: boolean
  thumbnailUrl: string | null
  version: number
  createdAt: string
  updatedAt: string
}

type SortMode = "updated" | "name" | "created"
type ViewMode = "grid" | "list"

export default function StylesPage() {
  const [styles, setStyles] = useState<StyleSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [sort, setSort] = useState<SortMode>("updated")
  const [view, setView] = useState<ViewMode>("grid")

  const loadStyles = async () => {
    try {
      const res = await api.get<ApiEnvelope<StyleSummary[]>>("/styles")
      setStyles(res.data)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadStyles()
  }, [])

  const filtered = useMemo(() => {
    let result = styles

    // Filter
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.handle.toLowerCase().includes(q)
      )
    }

    // Sort
    result = [...result].sort((a, b) => {
      switch (sort) {
        case "name":
          return a.name.localeCompare(b.name)
        case "created":
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        case "updated":
        default:
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      }
    })

    return result
  }, [styles, search, sort])

  return (
    <div className="container max-w-6xl py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Styles</h1>
        <CreateStyleButton />
      </div>

      {/* Search / Sort / View toggle toolbar */}
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search styles..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
        <Select value={sort} onValueChange={(v) => setSort(v as SortMode)}>
          <SelectTrigger className="w-[160px] h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="updated">Last modified</SelectItem>
            <SelectItem value="name">Name A–Z</SelectItem>
            <SelectItem value="created">Date created</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex border rounded-md">
          <Button
            variant={view === "grid" ? "secondary" : "ghost"}
            size="icon"
            className="h-9 w-9 rounded-r-none"
            onClick={() => setView("grid")}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            variant={view === "list" ? "secondary" : "ghost"}
            size="icon"
            className="h-9 w-9 rounded-l-none"
            onClick={() => setView("list")}
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-48 rounded-lg border bg-muted animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 && styles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Map className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium">No styles yet</h3>
          <p className="text-sm text-muted-foreground mt-1 mb-4">
            Create your first map style to get started.
          </p>
          <CreateStyleButton />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-sm text-muted-foreground">
            No styles match &ldquo;{search}&rdquo;
          </p>
        </div>
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((style) => (
            <StyleCard key={style.id} style={style} onMutate={loadStyles} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {filtered.map((style) => (
            <StyleListItem key={style.id} style={style} onMutate={loadStyles} />
          ))}
        </div>
      )}
    </div>
  )
}

function CreateStyleButton() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Create style
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form action={createStyle}>
          <DialogHeader>
            <DialogTitle>Create a new style</DialogTitle>
            <DialogDescription>
              Start with a blank style. You can import an existing style from JSON later.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              name="name"
              placeholder="Style name"
              required
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="submit">Create</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
