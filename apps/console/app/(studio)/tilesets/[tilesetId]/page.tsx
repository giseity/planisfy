"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import {
  Database,
  Globe,
  Loader2,
  MoreHorizontal,
  Upload,
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
import { api, type ConsoleProcessingJob, type ConsoleTileset } from "@/lib/api"
import type { ComponentProps } from "react"

const fallbackTileset: ConsoleTileset = {
  id: "buildings-usa",
  accountId: "demo",
  ownerHandle: "alexchen",
  name: "Buildings USA",
  handle: "buildings-usa",
  description: "Overture-derived building footprints for US coverage.",
  type: "VECTOR",
  status: "READY",
  currentVersionId: "buildings-v3",
  bounds: null,
  minZoom: 0,
  maxZoom: 14,
  layerMetadata: { vector_layers: [{ id: "buildings", fields: {}, minzoom: 0, maxzoom: 14 }] },
  uploads: [],
  latestUpload: {
    id: "upload-buildings",
    accountId: "demo",
    originalFileName: "overture-buildings.geojson",
    contentType: "application/geo+json",
    size: 1_200_000_000,
    storageObjectId: "obj_buildings",
    artifactAvailability: { ok: true },
    status: "COMPLETED",
    validationResult: {
      format: "GeoJSON",
      featureCount: 12_400_000,
      schema: { columns: ["id", "height", "class"] },
    },
    linkedTilesetId: "buildings-usa",
    createdAt: new Date("2026-06-08T10:00:00.000Z").toISOString(),
    updatedAt: new Date("2026-06-08T10:00:00.000Z").toISOString(),
  },
  versions: [
    {
      id: "buildings-v3",
      tilesetId: "buildings-usa",
      version: 3,
      buildJobId: "job_a1b2",
      format: "PMTiles",
      artifactStorageObjectId: "obj_buildings_v3",
      schema: { vector_layers: [{ id: "buildings", fields: {}, minzoom: 0, maxzoom: 14 }] },
      bounds: null,
      minZoom: 0,
      maxZoom: 14,
      createdAt: new Date("2026-06-09T11:42:00.000Z").toISOString(),
      publishedAt: new Date("2026-06-09T11:42:00.000Z").toISOString(),
      artifact: {
        id: "obj_buildings_v3",
        provider: "r2",
        bucket: "planisfy-tiles",
        storageKey: "tiles/buildings-usa/v3.pmtiles",
        fileName: "buildings-usa-v3.pmtiles",
        contentType: "application/octet-stream",
        size: 1_200_000_000,
        url: "https://api.planisfy.com/v1/tiles/buildings-usa",
        availability: { ok: true },
      },
    },
  ],
  latestVersion: null,
  currentVersion: null,
  isPublished: true,
  tilejsonUrl: "https://api.planisfy.com/v1/tiles/buildings-usa/tilejson.json?key=YOUR_KEY",
  versionedTilejsonUrl: "https://api.planisfy.com/v1/tiles/buildings-usa@3/tilejson.json?key=YOUR_KEY",
  createdAt: new Date("2026-05-28T15:20:00.000Z").toISOString(),
  updatedAt: new Date("2026-06-09T11:42:00.000Z").toISOString(),
}

fallbackTileset.latestVersion = fallbackTileset.versions[0] ?? null
fallbackTileset.currentVersion = fallbackTileset.versions[0] ?? null

export default function TilesetDetailPage() {
  const params = useParams<{ tilesetId: string }>()
  const [tilesets, setTilesets] = useState<ConsoleTileset[]>([])
  const [jobs, setJobs] = useState<ConsoleProcessingJob[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let canceled = false
    Promise.all([api.listTilesets(), api.listJobs()])
      .then(([tilesetsRes, jobsRes]) => {
        if (canceled) return
        setTilesets(tilesetsRes.data)
        setJobs(jobsRes.data)
      })
      .catch(() => {})
      .finally(() => {
        if (!canceled) setLoading(false)
      })

    return () => {
      canceled = true
    }
  }, [])

  const tileset = useMemo(
    () =>
      tilesets.find((item) => item.id === params.tilesetId || item.handle === params.tilesetId) ??
      fallbackTileset,
    [params.tilesetId, tilesets],
  )

  const versions = tileset.versions.length > 0 ? tileset.versions : fallbackTileset.versions
  const currentVersion = tileset.currentVersion ?? tileset.latestVersion ?? versions[0] ?? null
  const matchingJobs = jobs.filter((job) => job.input?.tilesetId === tileset.id)

  if (loading) {
    return (
      <div className="flex min-h-[360px] items-center justify-center rounded-lg border">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-sm text-muted-foreground">
            <Link href="/tilesets" className="hover:text-foreground">Tilesets</Link>
            <span>/</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{tileset.name}</h1>
          <p className="text-sm text-muted-foreground">{tileset.handle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline">
            <Upload className="h-4 w-4" />
            Upload new version
          </Button>
          <Button>
            <Globe className="h-4 w-4" />
            Promote
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="grid gap-5 p-5 lg:grid-cols-[180px_1fr]">
          <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md bg-slate-800">
            <div className="absolute inset-0 grid grid-cols-4 grid-rows-4 opacity-25">
              {Array.from({ length: 16 }).map((_, index) => (
                <div key={index} className="border border-white/20" />
              ))}
            </div>
            <Database className="relative h-9 w-9 text-white/40" />
          </div>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant={tileset.isPublished ? "success" : "secondary"}>
                {tileset.isPublished ? "Published" : tileset.status}
              </Badge>
              {currentVersion && <Badge variant="secondary">v{currentVersion.version}</Badge>}
              <Badge variant="outline">{currentVersion?.format ?? "PMTiles"}</Badge>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Fact label="Total size" value={formatBytes(currentVersion?.artifact?.size ?? tileset.latestUpload?.size ?? null)} />
              <Fact label="Layers" value={layerCount(currentVersion, tileset).toString()} />
              <Fact label="Zoom range" value={`${tileset.minZoom ?? currentVersion?.minZoom ?? 0}-${tileset.maxZoom ?? currentVersion?.maxZoom ?? 14}`} />
              <Fact label="Owner" value={tileset.ownerHandle ? `@${tileset.ownerHandle}` : "Organization"} />
              <Fact label="Created" value={formatDate(tileset.createdAt)} />
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Tile endpoint</p>
              <Input
                readOnly
                value={tileset.tilejsonUrl ?? `/tilesets/${tileset.handle}/tilejson.json`}
                className="font-mono text-xs"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="versions">
        <TabsList>
          <TabsTrigger value="versions">Versions</TabsTrigger>
          <TabsTrigger value="jobs">Build jobs</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Version history</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Version</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Layers</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Zoom</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {versions.map((version) => (
                <TableRow key={version.id}>
                  <TableCell className="font-medium">v{version.version}</TableCell>
                  <TableCell>
                    <Badge variant={version.publishedAt ? "success" : "secondary"}>
                      {version.publishedAt ? "published" : "available"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDate(version.createdAt)}</TableCell>
                  <TableCell>{version.schema?.vector_layers?.length ?? 0}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{formatBytes(version.artifact?.size ?? null)}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{version.minZoom ?? 0}-{version.maxZoom ?? 14}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon-sm" aria-label={`Actions for version ${version.version}`}>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Source metadata</CardTitle>
            <CardDescription>Origin and build configuration for the active tileset.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <MetadataBlock
              label="Source type"
              value={tileset.latestUpload?.validationResult?.format ?? "Overture Maps Foundation - Buildings"}
              detail={`${formatNumber(tileset.latestUpload?.validationResult?.featureCount)} features`}
            />
            <MetadataBlock
              label="Build configuration"
              value={`minZoom ${tileset.minZoom ?? 0}, maxZoom ${tileset.maxZoom ?? 14}`}
              detail={`format ${currentVersion?.format ?? "pmtiles"}`}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent build jobs</CardTitle>
            <CardDescription>Build history related to this tileset.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Output</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(matchingJobs.length > 0 ? matchingJobs : sampleJobs).map((job) => (
                  <TableRow key={job.id}>
                    <TableCell className="font-mono text-xs">{job.id}</TableCell>
                    <TableCell><Badge variant={jobStatusVariant(job.status)}>{job.status}</Badge></TableCell>
                    <TableCell>{job.progress}%</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{job.output?.storageKey ?? "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

const sampleJobs: ConsoleProcessingJob[] = [
  {
    id: "job_a1b2",
    accountId: "demo",
    type: "TILE_BUILD",
    status: "SUCCEEDED",
    progress: 100,
    retryCount: 0,
    cancelRequestedAt: null,
    input: { tilesetId: "buildings-usa" },
    output: { storageKey: "buildings-usa-v3.pmtiles" },
    errorCode: null,
    errorMessage: null,
    createdAt: new Date("2026-06-09T11:00:00.000Z").toISOString(),
    updatedAt: new Date("2026-06-09T11:42:00.000Z").toISOString(),
    startedAt: new Date("2026-06-09T11:00:00.000Z").toISOString(),
    completedAt: new Date("2026-06-09T11:42:00.000Z").toISOString(),
  },
]

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  )
}

function MetadataBlock({ detail, label, value }: { detail: string; label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  )
}

function layerCount(version: ConsoleTileset["latestVersion"], tileset: ConsoleTileset) {
  return version?.schema?.vector_layers?.length ?? tileset.layerMetadata?.vector_layers?.length ?? 0
}

function jobStatusVariant(status: string): ComponentProps<typeof Badge>["variant"] {
  if (status === "SUCCEEDED") return "success"
  if (status === "FAILED") return "destructive"
  if (status === "RUNNING" || status === "PROCESSING") return "warning"
  return "secondary"
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value))
}

function formatBytes(value: number | null) {
  if (!value) return "-"
  const units = ["B", "KB", "MB", "GB", "TB"]
  let size = value
  let unit = 0
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024
    unit += 1
  }
  return `${size.toFixed(size >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`
}

function formatNumber(value?: number) {
  return typeof value === "number" ? value.toLocaleString() : "Unknown"
}
