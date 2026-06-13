"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import {
  AlertTriangle,
  Download,
  Eye,
  EyeOff,
  Globe,
  Map,
  MoreHorizontal,
  Pencil,
} from "lucide-react"
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
import { Tabs, TabsList, TabsTrigger } from "@planisfy/ui/components/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@planisfy/ui/components/table"
import type { ApiEnvelope } from "@/lib/api"
import { api } from "@/lib/api"
import {
  styleEditorHref,
  type StudioStyleSummary,
} from "@/lib/studio/style-workflow"

const fallbackStyle: StudioStyleSummary = {
  id: "satellite-streets",
  name: "Satellite Streets",
  handle: "satellite-streets",
  description: "Satellite imagery with streets and labels.",
  isPublic: true,
  thumbnailUrl: null,
  version: 3,
  createdAt: new Date("2026-05-28T15:20:00.000Z"),
  updatedAt: new Date("2026-06-09T11:42:00.000Z"),
}

const versions = [
  { version: 3, published: true, created: "Jun 9, 11:42 AM", layers: 42, sources: 5, size: "48 KB" },
  { version: 2, published: false, created: "Jun 5, 09:15 AM", layers: 38, sources: 4, size: "44 KB" },
  { version: 1, published: false, created: "May 28, 03:20 PM", layers: 32, sources: 3, size: "36 KB" },
]

const layers = [
  { name: "background", type: "background", visible: true },
  { name: "water", type: "fill", visible: true },
  { name: "landuse-park", type: "fill", visible: true },
  { name: "roads-highway", type: "line", visible: true },
  { name: "roads-primary", type: "line", visible: true },
  { name: "buildings-3d", type: "fill-extrusion", visible: true },
  { name: "poi-labels", type: "symbol", visible: false },
  { name: "place-labels", type: "symbol", visible: true },
]

export default function StyleDetailsPage() {
  const params = useParams<{ styleId: string }>()
  const [styles, setStyles] = useState<StudioStyleSummary[]>([])

  useEffect(() => {
    api
      .get<ApiEnvelope<StudioStyleSummary[]>>("/styles")
      .then((res) => setStyles(res.data))
      .catch(() => {})
  }, [])

  const style = useMemo(
    () => styles.find((item) => item.id === params.styleId || item.handle === params.styleId) ?? fallbackStyle,
    [params.styleId, styles],
  )

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-sm text-muted-foreground">
            <Link href="/styles" className="hover:text-foreground">Styles</Link>
            <span>/</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{style.name}</h1>
          <p className="text-sm text-muted-foreground">{style.handle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href={styleEditorHref(style)}>
              <Pencil className="h-4 w-4" />
              Edit in Studio
            </Link>
          </Button>
          <Button variant="outline">Duplicate</Button>
          <Button>
            <Globe className="h-4 w-4" />
            Publish
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="grid gap-5 p-5 lg:grid-cols-[220px_1fr]">
          <div className="flex aspect-[10/7] items-center justify-center overflow-hidden rounded-md bg-slate-800">
            {style.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={style.thumbnailUrl} alt={style.name} className="h-full w-full object-cover" />
            ) : (
              <Map className="h-10 w-10 text-white/40" />
            )}
          </div>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant={style.isPublic ? "success" : "secondary"}>
                {style.isPublic ? "Published" : "Draft"}
              </Badge>
              <Badge variant="secondary">v{style.version}</Badge>
              <Badge variant="outline">MapLibre compatible</Badge>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Fact label="Owner" value="@alexchen" />
              <Fact label="Created" value={formatDate(style.createdAt)} />
              <Fact label="Layers" value="42" />
              <Fact label="Sources" value="5" />
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Style URL</p>
              <Input readOnly className="font-mono text-xs" value={`https://api.planisfy.com/v1/styles/${style.handle}?key=YOUR_KEY`} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="versions">
        <TabsList>
          <TabsTrigger value="versions">Versions</TabsTrigger>
          <TabsTrigger value="usage">Usage</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Version history</CardTitle>
          <CardDescription>Published and draft style versions.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Version</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Layers</TableHead>
                <TableHead>Sources</TableHead>
                <TableHead>Size</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {versions.map((version) => (
                <TableRow key={version.version}>
                  <TableCell className="font-medium">v{version.version}</TableCell>
                  <TableCell>
                    <Badge variant={version.published ? "success" : "secondary"}>
                      {version.published ? "Published" : "Draft"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{version.created}</TableCell>
                  <TableCell>{version.layers}</TableCell>
                  <TableCell>{version.sources}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{version.size}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {!version.published && (
                        <Button variant="outline" size="xs">
                          <Globe className="h-3.5 w-3.5" />
                          Publish
                        </Button>
                      )}
                      <Button variant="ghost" size="icon-xs" aria-label={`Download v${version.version}`}>
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon-xs" aria-label={`Actions for v${version.version}`}>
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Layer breakdown (v{style.version})</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-2">
          {layers.map((layer) => (
            <div key={layer.name} className="flex items-center gap-3 rounded-md border p-2">
              {layer.visible ? (
                <Eye className="h-4 w-4 text-muted-foreground" />
              ) : (
                <EyeOff className="h-4 w-4 text-muted-foreground" />
              )}
              <span className="flex-1 text-sm font-medium">{layer.name}</span>
              <Badge variant="outline">{layer.type}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="border-destructive/30 bg-destructive/5">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-destructive">Danger zone</p>
            <p className="text-sm text-muted-foreground">
              Deleting this style removes all versions and breaks clients using it.
            </p>
          </div>
          <Button variant="destructive">Delete style</Button>
        </CardContent>
      </Card>
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  )
}

function formatDate(value: string | Date) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value))
}
