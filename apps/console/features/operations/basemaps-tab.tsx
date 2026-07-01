'use client'

import { useState } from 'react'
import { ExternalLink, Info, Map, MoreHorizontal, Play, RefreshCw, Square } from 'lucide-react'
import {
  api,
  type ConsoleBasemapBuild,
  type ConsoleBasemapBuildDetail,
  type ConsoleBasemapRelease,
  type ConsoleRuntimeInstallation,
  type ConsoleWorkerNode,
} from '@/lib/api'
import { docsUrl } from '@/lib/docs-url'
import { formatDate } from '@/features/operations/model'
import { EmptyRow, Field, runAction, StatusBadge } from '@/features/operations/ui'
import { Button } from '@planisfy/ui/components/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@planisfy/ui/components/card'
import { Input } from '@planisfy/ui/components/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@planisfy/ui/components/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@planisfy/ui/components/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@planisfy/ui/components/table'

const SOURCE_PRESETS = [
  {
    id: 'africa/cameroon',
    label: 'Cameroon',
    url: 'https://download.geofabrik.de/africa/cameroon-latest.osm.pbf',
  },
  {
    id: 'africa/nigeria',
    label: 'Nigeria',
    url: 'https://download.geofabrik.de/africa/nigeria-latest.osm.pbf',
  },
  {
    id: 'planet',
    label: 'Planet',
    url: 'https://planet.openstreetmap.org/pbf/planet-latest.osm.pbf',
  },
]

export function BasemapsTab({
  builds,
  releases,
  runtimeInstallations,
  nodes,
  onChanged,
}: {
  builds: ConsoleBasemapBuild[]
  releases: ConsoleBasemapRelease[]
  runtimeInstallations: ConsoleRuntimeInstallation[]
  nodes: ConsoleWorkerNode[]
  onChanged: () => void
}) {
  const [name, setName] = useState('cameroon-osm-basemap')
  const [sourcePreset, setSourcePreset] = useState('africa/cameroon')
  const [sourceUrl, setSourceUrl] = useState(SOURCE_PRESETS[0]?.url ?? '')
  const [workerNodeId, setWorkerNodeId] = useState('')
  const [activationWorkerNodeId, setActivationWorkerNodeId] = useState('')
  const [planetilerImage, setPlanetilerImage] = useState('ghcr.io/onthegomap/planetiler:latest')
  const [detail, setDetail] = useState<ConsoleBasemapBuildDetail | null>(null)

  const buildNodes = nodes.filter((node) => hasCapability(node, 'basemap_build'))
  const servingNodes = nodes.filter(
    (node) =>
      hasCapability(node, 'self_host_activation') ||
      hasCapability(node, 'managed_runtime_activation')
  )
  const basemapInstallations = runtimeInstallations.filter(
    (installation) => installation.resourceType === 'basemap'
  )

  function choosePreset(value: string) {
    setSourcePreset(value)
    const preset = SOURCE_PRESETS.find((item) => item.id === value)
    if (preset) {
      setName(`${preset.id.replace(/[^A-Za-z0-9._-]/g, '-')}-osm-basemap`)
      setSourceUrl(preset.url)
    }
  }

  async function createBuild() {
    await runAction(
      () =>
        api.createBasemapBuild({
          name,
          sourceUrl,
          sourcePreset,
          workerNodeId,
          activationWorkerNodeId: activationWorkerNodeId || undefined,
          engine: 'planetiler_osm',
          sourceKind: 'osm_pbf',
          planetilerImage,
          profile: 'openmaptiles',
          outputFormat: 'pmtiles',
          config: { minZoom: 0, maxZoom: sourcePreset === 'planet' ? 14 : 13 },
        }),
      'Basemap build queued',
      onChanged
    )
  }

  async function loadDetail(id: string) {
    const response = await api.getBasemapBuild(id)
    setDetail(response.data)
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Map className="h-4 w-4" />
              Basemap Builds
            </CardTitle>
            <CardDescription>
              Planetiler creates PMTiles artifacts. Martin serves activated releases.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <div className="flex gap-2">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="space-y-1">
                  <p>
                    A successful build means tiles were computed. Deploying makes the artifact
                    available to Martin, and promoting marks it as the primary basemap.
                  </p>
                  <a
                    className="inline-flex items-center gap-1 text-primary"
                    href={docsUrl('/docs/self-hosting/data-sources')}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Basemap docs
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            </div>
            <Field label="Source preset">
              <Select value={sourcePreset} onValueChange={choosePreset}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SOURCE_PRESETS.map((preset) => (
                    <SelectItem key={preset.id} value={preset.id}>
                      {preset.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Name">
              <Input value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
            <Field label="OSM PBF URL">
              <Input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} />
            </Field>
            <Field label="Build worker">
              <Select value={workerNodeId} onValueChange={setWorkerNodeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a basemap build worker" />
                </SelectTrigger>
                <SelectContent>
                  {buildNodes.map((node) => (
                    <SelectItem key={node.id} value={node.id}>
                      {node.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Serving worker">
              <Select
                value={activationWorkerNodeId || 'none'}
                onValueChange={(value) => setActivationWorkerNodeId(value === 'none' ? '' : value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Deploy later</SelectItem>
                  {servingNodes.map((node) => (
                    <SelectItem key={node.id} value={node.id}>
                      {node.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Planetiler image">
              <Input
                value={planetilerImage}
                onChange={(event) => setPlanetilerImage(event.target.value)}
              />
            </Field>
            <Button disabled={!name || !sourceUrl || !workerNodeId} onClick={createBuild}>
              Queue Basemap Build
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Basemap Releases</CardTitle>
            <CardDescription>Published artifacts that may be active or primary.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Runtime</TableHead>
                  <TableHead>Primary</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {releases.map((release) => (
                  <TableRow key={release.id}>
                    <TableCell>
                      <div className="font-medium">{release.name}</div>
                      <div className="text-xs text-muted-foreground">{release.version}</div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={release.status} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={release.activationStatus} />
                    </TableCell>
                    <TableCell>{release.isPrimary ? 'Yes' : 'No'}</TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={release.activationStatus !== 'active' || release.isPrimary}
                        onClick={() =>
                          runAction(
                            () => api.promoteBasemapRelease(release.id),
                            'Primary basemap updated',
                            onChanged
                          )
                        }
                      >
                        Promote
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!releases.length && <EmptyRow colSpan={5} label="No basemap releases yet." />}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Builds</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[260px]">Name</TableHead>
                  <TableHead>Build</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Runtime</TableHead>
                  <TableHead className="w-10 text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {builds.map((build) => (
                  <TableRow key={build.id}>
                    <TableCell className="min-w-[260px]">
                      <div className="font-medium">{build.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {build.engine} / {formatDate(build.updatedAt)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={build.status} />
                    </TableCell>
                    <TableCell>{build.progress}%</TableCell>
                    <TableCell>
                      <StatusBadge status={build.activationStatus} />
                    </TableCell>
                    <TableCell className="w-10 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`${build.name} actions`}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => loadDetail(build.id)}>
                            <RefreshCw className="mr-2 h-4 w-4" />
                            View details
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={build.status !== 'succeeded'}
                            onSelect={() =>
                              runAction(
                                () =>
                                  api.activateBasemapBuild(
                                    build.id,
                                    build.activationWorkerNodeId ?? undefined
                                  ),
                                'Basemap activation requested',
                                onChanged
                              )
                            }
                          >
                            <Play className="mr-2 h-4 w-4" />
                            Activate basemap
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={['succeeded', 'failed', 'canceled'].includes(build.status)}
                            onSelect={() =>
                              runAction(
                                () => api.cancelBasemapBuild(build.id),
                                'Cancellation requested',
                                onChanged
                              )
                            }
                          >
                            <Square className="mr-2 h-4 w-4" />
                            Cancel build
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
                {!builds.length && <EmptyRow colSpan={5} label="No basemap builds yet." />}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Runtime Installations</CardTitle>
            <CardDescription>
              Basemap artifacts copied to serving machines for Martin.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Worker</TableHead>
                  <TableHead>Runtime path</TableHead>
                  <TableHead>Activated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {basemapInstallations.map((installation) => (
                  <TableRow key={installation.id}>
                    <TableCell>
                      <StatusBadge status={installation.status} />
                    </TableCell>
                    <TableCell>{workerName(nodes, installation.workerNodeId)}</TableCell>
                    <TableCell className="max-w-[360px] truncate text-xs">
                      {installation.runtimePath ?? 'Not reported'}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {formatDate(installation.activatedAt)}
                    </TableCell>
                  </TableRow>
                ))}
                {!basemapInstallations.length && (
                  <EmptyRow colSpan={4} label="No basemap runtime installations yet." />
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {detail && (
          <Card>
            <CardHeader>
              <CardTitle>{detail.build.name}</CardTitle>
              <CardDescription>
                {detail.artifacts.length} artifact(s), {detail.releases.length} release(s)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <StatusBox label="Build" value={detail.build.status} />
                <StatusBox
                  label="Artifact"
                  value={detail.artifacts[0]?.status ?? 'not_available'}
                />
                <StatusBox label="Runtime" value={detail.build.activationStatus} />
              </div>
              <div className="max-h-96 overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Level</TableHead>
                      <TableHead>Message</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.logs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="whitespace-nowrap text-xs">
                          {formatDate(log.createdAt)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={log.level} />
                        </TableCell>
                        <TableCell>{log.message}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

function hasCapability(node: ConsoleWorkerNode, capability: string) {
  const capabilities = Array.isArray(node.metadata?.capabilities) ? node.metadata.capabilities : []
  return capabilities.includes(capability)
}

function workerName(nodes: ConsoleWorkerNode[], id: string | null) {
  return nodes.find((node) => node.id === id)?.name ?? 'Unknown worker'
}

function StatusBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-2">
        <StatusBadge status={value} />
      </div>
    </div>
  )
}
