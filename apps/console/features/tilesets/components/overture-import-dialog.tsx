"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  api,
  type ConsoleSavedRegion,
  type ConsoleTileset,
  type OvertureCatalogTheme,
} from "@/lib/api";
import {
  canRequestOvertureImport,
  catalogTypesForTheme,
  defaultOvertureImportOptions,
} from "@/features/tilesets/workflow/import-workflow";
import {
  AreaOfInterestSelector,
  areaOfInterestToDraft,
  draftToAreaOfInterest,
} from "@/features/shared/area-of-interest-selector";
import { areaOfInterestToBBox } from "@planisfy/api-contracts";
import { Button } from "@planisfy/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@planisfy/ui/components/dialog";
import { Input } from "@planisfy/ui/components/input";
import { Label } from "@planisfy/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@planisfy/ui/components/select";
import { Database, RefreshCw } from "lucide-react";
import { toast } from "sonner";

const NEW_REGION_VALUE = "__new-region__";

interface OvertureImportDialogProps {
  tileset?: ConsoleTileset;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
  trigger?: ReactNode;
}

export function OvertureImportDialog({
  tileset,
  open,
  onOpenChange,
  onImported,
  trigger,
}: OvertureImportDialogProps) {
  const [catalogThemes, setCatalogThemes] = useState<OvertureCatalogTheme[]>(
    [],
  );
  const [regions, setRegions] = useState<ConsoleSavedRegion[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [selectedTheme, setSelectedTheme] = useState("");
  const [selectedType, setSelectedType] = useState("");
  const [selectedRegionId, setSelectedRegionId] = useState(NEW_REGION_VALUE);
  const [importName, setImportName] = useState("");
  const [importHandle, setImportHandle] = useState("");
  const [importDescription, setImportDescription] = useState("");
  const [regionName, setRegionName] = useState("");
  const [regionHandle, setRegionHandle] = useState("");
  const [regionAoiPreset, setRegionAoiPreset] = useState("custom");
  const [regionAreaOfInterest, setRegionAreaOfInterest] = useState(
    areaOfInterestToDraft({
      kind: "bbox",
      bbox: [-122.55, 37.7, -122.35, 37.84],
    }),
  );

  const loadOptions = useCallback(async () => {
    setLoading(true);
    try {
      const [catalogRes, regionsRes] = await Promise.all([
        api.getOvertureCatalog(),
        api.listRegions(),
      ]);
      setCatalogThemes(catalogRes.data.themes);
      setRegions(regionsRes.data);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to load import options",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) loadOptions();
  }, [loadOptions, open]);

  function handleThemeChange(theme: string) {
    const type = catalogTypesForTheme(catalogThemes, theme)[0]?.type ?? "";
    setSelectedTheme(theme);
    setSelectedType(type);
    applyImportDefaults(theme, type);
  }

  function handleTypeChange(type: string) {
    setSelectedType(type);
    applyImportDefaults(selectedTheme, type);
  }

  function applyImportDefaults(theme: string, type: string) {
    if (!theme || !type) return;
    const defaults = defaultOvertureImportOptions(catalogThemes, theme, type);
    setImportName(defaults.name);
    setImportHandle(defaults.handle);
    setImportDescription(defaults.description);
  }

  async function handleCreateOvertureImport() {
    const needsRegion = selectedRegionId === NEW_REGION_VALUE;
    const areaOfInterest = draftToAreaOfInterest(regionAreaOfInterest);
    const bbox = areaOfInterest ? areaOfInterestToBBox(areaOfInterest) : null;
    if (needsRegion && !bbox) {
      toast.error("Region bbox must be west, south, east, north.");
      return;
    }

    const regionReady = needsRegion
      ? Boolean(regionName && regionHandle && bbox)
      : Boolean(selectedRegionId);
    if (
      !canRequestOvertureImport({
        theme: selectedTheme,
        type: selectedType,
        name: importName,
        handle: importHandle,
        regionReady,
      })
    ) {
      return;
    }

    setImporting(true);
    try {
      let regionId = selectedRegionId;
      if (needsRegion) {
        const region = await api.createRegion({
          name: regionName,
          handle: regionHandle,
          bbox: bbox!,
        });
        regionId = region.data.id;
        setSelectedRegionId(regionId);
      }

      await api.createOvertureImport({
        name: importName,
        handle: importHandle,
        description: importDescription || undefined,
        regionId,
        targetTilesetId: tileset?.id,
        theme: selectedTheme,
        type: selectedType,
      });
      resetImportForm(regionId);
      onOpenChange(false);
      toast.success(
        tileset
          ? "Overture import queued; tileset will build when ready"
          : "Overture import queued",
      );
      onImported();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to queue Overture import",
      );
    } finally {
      setImporting(false);
    }
  }

  function resetImportForm(regionId = selectedRegionId) {
    setSelectedTheme("");
    setSelectedType("");
    setImportName("");
    setImportHandle("");
    setImportDescription("");
    setSelectedRegionId(regionId);
  }

  function useSampleBbox() {
    setRegionName("San Francisco sample");
    setRegionHandle("san-francisco-sample");
    setRegionAoiPreset("custom");
    setRegionAreaOfInterest(
      areaOfInterestToDraft({
        kind: "bbox",
        bbox: [-122.55, 37.7, -122.35, 37.84],
      }),
    );
  }

  const regionAreaReady = Boolean(draftToAreaOfInterest(regionAreaOfInterest));

  const canSubmit = canRequestOvertureImport({
    theme: selectedTheme,
    type: selectedType,
    name: importName,
    handle: importHandle,
    regionReady:
      selectedRegionId === NEW_REGION_VALUE
        ? Boolean(regionName && regionHandle && regionAreaReady)
        : Boolean(selectedRegionId),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import Overture</DialogTitle>
          <DialogDescription>
            Queue a DuckDB extraction for a saved region and cataloged Overture
            feature type.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Theme</Label>
              <Select
                value={selectedTheme}
                onValueChange={handleThemeChange}
                disabled={loading}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Theme" />
                </SelectTrigger>
                <SelectContent>
                  {catalogThemes.map((theme) => (
                    <SelectItem key={theme.theme} value={theme.theme}>
                      {theme.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={selectedType}
                onValueChange={handleTypeChange}
                disabled={!selectedTheme || loading}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  {catalogTypesForTheme(catalogThemes, selectedTheme).map(
                    (type) => (
                      <SelectItem key={type.type} value={type.type}>
                        {type.label}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={importName}
                onChange={(e) => setImportName(e.target.value)}
                placeholder="Overture Places"
              />
            </div>
            <div className="space-y-2">
              <Label>Handle</Label>
              <Input
                value={importHandle}
                onChange={(e) =>
                  setImportHandle(
                    e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
                  )
                }
                placeholder="overture-places-place"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Input
              value={importDescription}
              onChange={(e) => setImportDescription(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="space-y-2">
            <Label>Region</Label>
            <Select
              value={selectedRegionId}
              onValueChange={setSelectedRegionId}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Region" />
              </SelectTrigger>
              <SelectContent>
                {regions.map((region) => (
                  <SelectItem key={region.id} value={region.id}>
                    {region.name}
                  </SelectItem>
                ))}
                <SelectItem value={NEW_REGION_VALUE}>New bbox</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {selectedRegionId === NEW_REGION_VALUE && (
            <div className="space-y-3 rounded-md border p-3">
              <div className="flex justify-end">
                <Button type="button" variant="outline" onClick={useSampleBbox}>
                  Use sample bbox
                </Button>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Region name</Label>
                  <Input
                    value={regionName}
                    onChange={(e) => setRegionName(e.target.value)}
                    placeholder="Region name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Region handle</Label>
                  <Input
                    value={regionHandle}
                    onChange={(e) =>
                      setRegionHandle(
                        e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
                      )
                    }
                    placeholder="region-handle"
                  />
                </div>
              </div>
              <AreaOfInterestSelector
                value={regionAreaOfInterest}
                onChange={setRegionAreaOfInterest}
                presetId={regionAoiPreset}
                onPresetChange={setRegionAoiPreset}
              />
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                resetImportForm();
                onOpenChange(false);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateOvertureImport}
              disabled={loading || importing || !canSubmit}
            >
              {importing ? (
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Database className="mr-2 h-4 w-4" />
              )}
              Import
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
