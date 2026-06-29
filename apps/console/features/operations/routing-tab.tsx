"use client";

import { useMemo, useState } from "react";
import {
  areaOfInterestToBBox,
  areaOfInterestToHgtTileNames,
} from "@planisfy/api-contracts";
import {
  Activity,
  CheckCircle2,
  Copy,
  Play,
  RefreshCw,
  Route,
  Square,
} from "lucide-react";
import {
  api,
  type ConsoleRoutingGraphBuild,
  type ConsoleRoutingGraphBuildDetail,
  type ConsoleWorkerNode,
} from "@/lib/api";
import { formatDate } from "@/features/operations/model";
import {
  EmptyRow,
  Field,
  runAction,
  StatusBadge,
} from "@/features/operations/ui";
import {
  AreaOfInterestSelector,
  areaOfInterestToDraft,
  draftToAreaOfInterest,
  type AreaOfInterestPreset,
} from "@/features/shared/area-of-interest-selector";
import { Button } from "@planisfy/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@planisfy/ui/components/card";
import { Checkbox } from "@planisfy/ui/components/checkbox";
import { Input } from "@planisfy/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@planisfy/ui/components/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@planisfy/ui/components/table";
import { toast } from "sonner";

const SOURCE_PRESETS = [
  {
    id: "africa/nigeria",
    label: "Nigeria",
    url: "https://download.geofabrik.de/africa/nigeria-latest.osm.pbf",
    areaOfInterest: { kind: "bbox", bbox: [2.6, 4.2, 14.7, 13.9] },
  },
  {
    id: "planet",
    label: "Planet",
    url: "https://planet.openstreetmap.org/pbf/planet-latest.osm.pbf",
    areaOfInterest: { kind: "world" },
  },
] satisfies Array<{
  id: string;
  label: string;
  url: string;
  areaOfInterest: AreaOfInterestPreset["areaOfInterest"];
}>;

const AOI_PRESETS: AreaOfInterestPreset[] = SOURCE_PRESETS.map((preset) => ({
  id: preset.id,
  label: preset.label,
  areaOfInterest: preset.areaOfInterest,
}));

export function RoutingTab({
  builds,
  nodes,
  onChanged,
}: {
  builds: ConsoleRoutingGraphBuild[];
  nodes: ConsoleWorkerNode[];
  onChanged: () => void;
}) {
  const [name, setName] = useState("Nigeria routing graph");
  const [sourcePreset, setSourcePreset] = useState(SOURCE_PRESETS[0]!.id);
  const [sourceUrl, setSourceUrl] = useState(SOURCE_PRESETS[0]!.url);
  const [aoiPreset, setAoiPreset] = useState(SOURCE_PRESETS[0]!.id);
  const [areaOfInterestDraft, setAreaOfInterestDraft] = useState(
    areaOfInterestToDraft(SOURCE_PRESETS[0]!.areaOfInterest),
  );
  const [workerNodeId, setWorkerNodeId] = useState("");
  const [activationWorkerNodeId, setActivationWorkerNodeId] = useState("");
  const [valhallaImage, setValhallaImage] = useState(
    "ghcr.io/valhalla/valhalla:3.7.0",
  );
  const [includeAdmins, setIncludeAdmins] = useState(true);
  const [includeTimezones, setIncludeTimezones] = useState(true);
  const [elevationMode, setElevationMode] = useState<"none" | "dem_companion">(
    "none",
  );
  const [demBaseUrl, setDemBaseUrl] = useState(
    "https://s3.amazonaws.com/elevation-tiles-prod/skadi",
  );
  const [hgtTiles, setHgtTiles] = useState("");
  const [tokenName, setTokenName] = useState("valhalla-builder");
  const [registrationToken, setRegistrationToken] = useState("");
  const [detail, setDetail] = useState<ConsoleRoutingGraphBuildDetail | null>(
    null,
  );

  const agentNodes = nodes.filter(
    (node) => node.metadata?.agentManaged || node.status === "healthy",
  );
  const areaOfInterest = useMemo(
    () => draftToAreaOfInterest(areaOfInterestDraft),
    [areaOfInterestDraft],
  );
  const hgtTileCount = useMemo(() => {
    if (!areaOfInterest) return null;
    return areaOfInterestToHgtTileNames(areaOfInterest).length;
  }, [areaOfInterest]);

  function choosePreset(value: string) {
    setSourcePreset(value);
    const preset = SOURCE_PRESETS.find((item) => item.id === value);
    if (preset?.url) setSourceUrl(preset.url);
    if (preset?.areaOfInterest) {
      setAoiPreset(preset.id);
      setAreaOfInterestDraft(areaOfInterestToDraft(preset.areaOfInterest));
    }
  }

  async function createToken() {
    await runAction(
      async () => {
        const res = await api.createRootAgentRegistrationToken({
          name: tokenName,
          kind: "remote",
          metadata: { capabilities: ["valhalla_graph_build"] },
        });
        setRegistrationToken(res.data.token);
        return res;
      },
      "Registration token created",
      onChanged,
    );
  }

  async function createBuild() {
    if (!areaOfInterest) {
      toast.error("Area bounds must be valid WGS84 values.");
      return;
    }
    const [minLon, minLat, maxLon, maxLat] = areaOfInterestToBBox(areaOfInterest);
    await runAction(
      () =>
        api.createRoutingGraphBuild({
          name,
          sourceUrl,
          sourcePreset: sourcePreset === "custom" ? undefined : sourcePreset,
          workerNodeId,
          activationWorkerNodeId: activationWorkerNodeId || undefined,
          valhallaImage,
          includeAdmins,
          includeTimezones,
          elevationMode,
          areaOfInterest,
          config:
            elevationMode === "dem_companion"
              ? {
                  dem: {
                    baseUrl: demBaseUrl,
                    bounds: { minLon, minLat, maxLon, maxLat },
                    hgtTiles: hgtTiles
                      .split(/[,\s]+/)
                      .map((tile) => tile.trim())
                      .filter(Boolean),
                  },
                }
              : undefined,
        }),
      "Routing graph build queued",
      onChanged,
    );
  }

  async function loadDetail(id: string) {
    try {
      const res = await api.getRoutingGraphBuild(id);
      setDetail(res.data);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to load routing build",
      );
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Register Root Agent</CardTitle>
            <CardDescription>
              Create a one-time token for a server running the root-agent
              service.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field label="Agent name">
              <Input
                value={tokenName}
                onChange={(event) => setTokenName(event.target.value)}
              />
            </Field>
            <Button onClick={createToken} disabled={!tokenName}>
              <Activity className="mr-1.5 h-4 w-4" />
              Create token
            </Button>
            {registrationToken ? (
              <div className="rounded-md border p-3 text-sm">
                <div className="mb-2 font-medium">Registration token</div>
                <div className="break-all font-mono text-xs">
                  {registrationToken}
                </div>
                <Button
                  className="mt-3"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void navigator.clipboard.writeText(registrationToken);
                    toast.success("Token copied");
                  }}
                >
                  <Copy className="mr-1.5 h-4 w-4" />
                  Copy
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>New Routing Build</CardTitle>
            <CardDescription>
              Build a Valhalla graph on a registered root agent.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field label="Name">
              <Input value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
            <Field label="Source">
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
                  <SelectItem value="custom">Custom URL</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="OSM PBF URL">
              <Input
                value={sourceUrl}
                onChange={(event) => setSourceUrl(event.target.value)}
              />
            </Field>
            <AreaOfInterestSelector
              value={areaOfInterestDraft}
              onChange={setAreaOfInterestDraft}
              presetId={aoiPreset}
              onPresetChange={setAoiPreset}
              presets={AOI_PRESETS}
            />
            <Field label="Build node">
              <Select value={workerNodeId} onValueChange={setWorkerNodeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a root agent" />
                </SelectTrigger>
                <SelectContent>
                  {agentNodes.map((node) => (
                    <SelectItem key={node.id} value={node.id}>
                      {node.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Activation node">
              <Select
                value={activationWorkerNodeId || "none"}
                onValueChange={(value) =>
                  setActivationWorkerNodeId(value === "none" ? "" : value)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Manual later</SelectItem>
                  {agentNodes.map((node) => (
                    <SelectItem key={node.id} value={node.id}>
                      {node.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Valhalla image">
              <Input
                value={valhallaImage}
                onChange={(event) => setValhallaImage(event.target.value)}
              />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={includeAdmins} onCheckedChange={(value) => setIncludeAdmins(Boolean(value))} />
              Include admin database
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={includeTimezones} onCheckedChange={(value) => setIncludeTimezones(Boolean(value))} />
              Include timezone database
            </label>
            <Field label="Elevation">
              <Select
                value={elevationMode}
                onValueChange={(value) =>
                  setElevationMode(value as "none" | "dem_companion")
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="dem_companion">DEM companion</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            {elevationMode === "dem_companion" ? (
              <div className="space-y-3 rounded-md border p-3">
                <Field label="DEM base URL">
                  <Input
                    value={demBaseUrl}
                    onChange={(event) => setDemBaseUrl(event.target.value)}
                  />
                </Field>
                <div className="text-muted-foreground text-xs">
                  DEM tiles from selected area:{" "}
                  {hgtTileCount === null ? "invalid area" : hgtTileCount.toLocaleString()}
                </div>
                <Field label="Explicit HGT tiles">
                  <Input
                    value={hgtTiles}
                    onChange={(event) => setHgtTiles(event.target.value)}
                    placeholder="N09E007 N10E007"
                  />
                </Field>
              </div>
            ) : null}
            <Button onClick={createBuild} disabled={!name || !sourceUrl || !workerNodeId}>
              <Route className="mr-1.5 h-4 w-4" />
              Queue build
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Routing Graph Builds</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Activation</TableHead>
                  <TableHead className="w-[172px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {builds.map((build) => (
                  <TableRow key={build.id}>
                    <TableCell>
                      <div className="font-medium">{build.name}</div>
                      <div className="text-muted-foreground text-xs">
                        {formatDate(build.updatedAt)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={build.status} />
                    </TableCell>
                    <TableCell>{build.progress}%</TableCell>
                    <TableCell>
                      <StatusBadge status={build.activationStatus} />
                    </TableCell>
                    <TableCell className="space-x-1">
                      <Button size="sm" variant="outline" onClick={() => loadDetail(build.id)}>
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={build.status !== "succeeded"}
                        onClick={() =>
                          runAction(
                            () =>
                              api.activateRoutingGraphBuild(
                                build.id,
                                build.activationWorkerNodeId ?? undefined,
                              ),
                            "Activation requested",
                            onChanged,
                          )
                        }
                      >
                        <Play className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={["succeeded", "failed", "canceled"].includes(build.status)}
                        onClick={() =>
                          runAction(
                            () => api.cancelRoutingGraphBuild(build.id),
                            "Cancellation requested",
                            onChanged,
                          )
                        }
                      >
                        <Square className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {builds.length === 0 && (
                  <EmptyRow colSpan={5} label="No routing graph builds yet." />
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {detail ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5" />
                {detail.build.name}
              </CardTitle>
              <CardDescription>
                {detail.artifacts.length} artifact
                {detail.artifacts.length === 1 ? "" : "s"} available
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-md border">
                <div className="border-b px-3 py-2 text-sm font-medium">Recent logs</div>
                <div className="max-h-[320px] overflow-auto p-3 font-mono text-xs">
                  {detail.logs.map((log) => (
                    <div key={log.id} className="mb-1">
                      <span className="text-muted-foreground">
                        {formatDate(log.createdAt)} [{log.level}]
                      </span>{" "}
                      {log.message}
                    </div>
                  ))}
                  {detail.logs.length === 0 ? "No logs yet." : null}
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
