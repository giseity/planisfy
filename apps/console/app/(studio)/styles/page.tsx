'use client'

import { useEffect, useState, useMemo } from 'react'
import { StyleCard } from '@/features/style-editor/components/style-card'
import { StyleListItem } from '@/features/style-editor/components/style-list-item'
import { Button } from '@planisfy/ui/components/button'
import { Input } from '@planisfy/ui/components/input'
import { Skeleton } from '@planisfy/ui/components/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@planisfy/ui/components/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@planisfy/ui/components/select'
import { ToggleGroup, ToggleGroupItem } from '@planisfy/ui/components/toggle-group'
import { Plus, Map, Search, LayoutGrid, List } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { api, type ApiEnvelope } from '@/lib/api'
import { createStyle } from '@/features/style-editor/workflow/style-actions'
import type { StudioStyleSummary } from '@/features/style-editor/workflow/style-workflow'

type SortMode = 'updated' | 'name' | 'created'
type ViewMode = 'grid' | 'list'

export default function StylesPage() {
  const [styles, setStyles] = useState<StudioStyleSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortMode>('updated')
  const [view, setView] = useState<ViewMode>('grid')

  const loadStyles = async () => {
    try {
      const res = await api.get<ApiEnvelope<StudioStyleSummary[]>>('/styles')
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
        (s) => s.name.toLowerCase().includes(q) || s.handle.toLowerCase().includes(q)
      )
    }

    // Sort
    result = [...result].sort((a, b) => {
      switch (sort) {
        case 'name':
          return a.name.localeCompare(b.name)
        case 'created':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        case 'updated':
        default:
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      }
    })

    return result
  }, [styles, search, sort])

  return (
    <div className="py-8">
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
            className="pl-8"
          />
        </div>
        <Select value={sort} onValueChange={(v) => setSort(v as SortMode)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="updated">Last modified</SelectItem>
            <SelectItem value="name">Name A-Z</SelectItem>
            <SelectItem value="created">Date created</SelectItem>
          </SelectContent>
        </Select>
        <ToggleGroup
          type="single"
          value={view}
          onValueChange={(value) => {
            if (value) setView(value as ViewMode)
          }}
        >
          <ToggleGroupItem value="grid" size="icon" aria-label="Grid view">
            <LayoutGrid className="h-4 w-4" />
          </ToggleGroupItem>
          <ToggleGroupItem value="list" size="icon" aria-label="List view">
            <List className="h-4 w-4" />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-lg" />
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
          <p className="text-sm text-muted-foreground">No styles match &ldquo;{search}&rdquo;</p>
        </div>
      ) : view === 'grid' ? (
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
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)

  async function handleCreate(formData: FormData) {
    setCreating(true)
    try {
      const created = await createStyle(String(formData.get('name') ?? ''))
      setOpen(false)
      router.push(`/styles/${created.id}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create style')
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="create-style">
          <Plus className="h-4 w-4 mr-2" />
          Create style
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form action={handleCreate}>
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
              data-testid="create-style-name"
            />
          </div>
          <DialogFooter>
            <Button type="submit" data-testid="create-style-submit" disabled={creating}>
              {creating ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
