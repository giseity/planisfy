"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import {
  AlertCircle,
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
import { api, type ConsoleExecutionTarget, type ConsoleProcessingJob, type ConsoleTileset, type ConsoleWorkerProfile } from "@/lib/api"
import { OvertureImportDialog } from "@/features/tilesets/components/overture-import-dialog"
import { TilesetUploadDialog } from "@/features/tilesets/components/tileset-upload-dialog"
import type { ComponentProps } from "react"

export default function TilesetDetailPage() {
  const params = useParams<{ tilesetId: string }>()
  const [tilesets, setTilesets] = useState<ConsoleTileset[]>([])
  const [jobs, setJobs] = useState<ConsoleProcessingJob[]>([])
  const [executionTargets, setExecutionTargets] = useState<ConsoleExecutionTarget[]>([])
  const [workerProfiles, setWorkerProfiles] = useState<ConsoleWorkerProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [selectedExecutionTargetId, setSelectedExecutionTargetId] = useState("default")
  const [selectedWorkerProfileId, setSelectedWorkerProfileId] = useState("default")

  useEffect(() => {
    let canceled = false
    Promise.all([
      api.listTilesets(),
      api.listJobs(),
      api.listExecutionTargets(),
      api.listWorkerProfiles(),
    ])
      .then(([tilesetsRes, jobsRes, targetsRes, profilesRes]) => {
        if (canceled) return
        setTilesets(tilesetsRes.data)
        setJobs(jobsRes.data)
        setExecutionTargets(targetsRes.data)
        setWorkerProfiles(profilesRes.data)
      })
      .catch(() => {})
      .finally(() => {
        if (!canceled) setLoading(false)
      })

    return () => {
      canceled = true
    }
  }, [])

  const reload = () => {
    Promise.all([api.listTilesets(), api.listJobs()])
      .then(([tilesetsRes, jobsRes]) => {
        setTilesets(tilesetsRes.data)
        setJobs(jobsRes.data)
      })
      .catch(() => {})
  }

  const tileset = useMemo(
    () =>
      tilesets.find((item) => item.id === params.tilesetId || item.handle === params.tilesetId) ?? null,
    [params.tilesetId, tilesets],
  )

  if (loading) {
    return (
      <div className="flex min-h-[360px] items-center justify-center rounded-lg border">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!tileset) {
    return (
      <div className="flex min-h-[360px] items-center justify-center rounded-lg border">
        <div className="text-center">
          <Database className="mx-auto h-8 w-8 text-muted-foreground" />
          <h1 className="mt-3 text-lg font-semibold">Tileset not found</h1>
          <p className="mt-1 text-sm text-muted-foreground">No tileset matched this ID or handle.</p>
        </div>
      </div>
    )
  }

  const versions = tileset.versions
  const currentVersion = tileset.currentVersion ?? tileset.latestVersion ?? versions[0] ?? null
  const matchingJobs = jobs.filter((job) => job.input?.tilesetId === tileset.id)
  const hasSource = Boolean(tileset.latestUpload || tileset.latestSourceImport)

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
          <TilesetUploadDialog
            tileset={tileset}
            open={uploadOpen}
            onOpenChange={setUploadOpen}
            executionTargets={executionTargets}
            workerProfiles={workerProfiles}
            selectedExecutionTargetId={selectedExecutionTargetId}
            selectedWorkerProfileId={selectedWorkerProfileId}
            onExecutionTargetChange={setSelectedExecutionTargetId}
            onWorkerProfileChange={setSelectedWorkerProfileId}
            onUploaded={reload}
          />
          <OvertureImportDialog
            tileset={tileset}
            open={importOpen}
            onOpenChange={setImportOpen}
            onImported={reload}
            trigger={
              <Button variant="outline">
                <Globe className="h-4 w-4" />
                Import Overture
              </Button>
            }
          />
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Source setup</CardTitle>
          <CardDescription>
            Attach an upload or Overture import to build versions for this tileset.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={hasSource ? statusVariant(tileset.status) : "secondary"}>
                {!hasSource && tileset.status === "DRAFT"
                  ? "Awaiting source"
                  : tileset.status}
              </Badge>
              {tileset.latestUpload && (
                <Badge variant="outline">
                  Upload: {tileset.latestUpload.status}
                </Badge>
              )}
              {tileset.latestSourceImport && (
                <Badge variant="outline">
                  Overture: {tileset.latestSourceImport.status}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {sourceSetupMessage(tileset)}
            </p>
            {tileset.latestSourceImport?.errorMessage && (
              <p className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                {tileset.latestSourceImport.errorMessage}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2 md:justify-end">
            <Button variant="outline" onClick={() => setUploadOpen(true)}>
              <Upload className="h-4 w-4" />
              Upload source
            </Button>
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Globe className="h-4 w-4" />
              Import Overture
            </Button>
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
              {versions.length > 0 ? (
                versions.map((version) => (
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
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-sm text-muted-foreground">
                    No versions have been built yet.
                  </TableCell>
                </TableRow>
              )}
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
              value={tileset.latestUpload?.validationResult?.format ?? "Unknown"}
              detail={featureCountDetail(tileset.latestUpload?.validationResult?.featureCount)}
            />
            <MetadataBlock
              label="Build configuration"
              value={
                tileset.minZoom !== null && tileset.maxZoom !== null
                  ? `minZoom ${tileset.minZoom}, maxZoom ${tileset.maxZoom}`
                  : "Awaiting build"
              }
              detail={currentVersion ? `format ${currentVersion.format}` : "No artifact published"}
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
                {matchingJobs.length > 0 ? (
                  matchingJobs.map((job) => (
                    <TableRow key={job.id}>
                      <TableCell className="font-mono text-xs">{job.id}</TableCell>
                      <TableCell><Badge variant={jobStatusVariant(job.status)}>{job.status}</Badge></TableCell>
                      <TableCell>{job.progress}%</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{job.output?.storageKey ?? "-"}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center text-sm text-muted-foreground">
                      No build jobs found for this tileset.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
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

function statusVariant(status: string): ComponentProps<typeof Badge>["variant"] {
  if (status === "READY") return "success"
  if (status === "ERROR") return "destructive"
  if (status === "BUILDING") return "warning"
  return "secondary"
}

function sourceSetupMessage(tileset: ConsoleTileset) {
  if (!tileset.latestUpload && !tileset.latestSourceImport) {
    return "Choose a source to create the first tileset version."
  }
  if (tileset.latestSourceImport) {
    if (tileset.latestSourceImport.status === "SUCCEEDED") {
      return "Overture import completed. A tileset build is queued or running automatically."
    }
    if (tileset.latestSourceImport.status === "FAILED") {
      return "Overture import failed. Adjust the source setup and queue a replacement import."
    }
    return "Overture import is running. The tileset will build automatically when the import is ready."
  }
  if (tileset.latestUpload?.status === "ERROR") {
    return "Upload processing failed. Upload a replacement source or retry the failed build job."
  }
  return "Upload source is attached. Build progress appears in recent jobs."
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

function formatNumber(value: number) {
  return value.toLocaleString()
}

function featureCountDetail(value?: number | null) {
  return typeof value === "number"
    ? `${formatNumber(value)} features`
    : "Feature count unavailable"
}
