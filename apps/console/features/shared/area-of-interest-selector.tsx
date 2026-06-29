"use client";

import type { ConsoleAreaOfInterest } from "@planisfy/api-contracts";
import {
  areaOfInterestToBBox,
  normalizeAreaOfInterest,
} from "@planisfy/api-contracts";
import { Button } from "@planisfy/ui/components/button";
import { Input } from "@planisfy/ui/components/input";
import { Label } from "@planisfy/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@planisfy/ui/components/select";

export type AreaOfInterestDraft = {
  kind: "world" | "bbox";
  west: string;
  south: string;
  east: string;
  north: string;
};

export type AreaOfInterestPreset = {
  id: string;
  label: string;
  areaOfInterest: ConsoleAreaOfInterest;
};

export const DEFAULT_AREA_OF_INTEREST_PRESETS: AreaOfInterestPreset[] = [
  {
    id: "nigeria",
    label: "Nigeria",
    areaOfInterest: { kind: "bbox", bbox: [2.6, 4.2, 14.7, 13.9] },
  },
  {
    id: "world",
    label: "Full planet",
    areaOfInterest: { kind: "world" },
  },
];

export function AreaOfInterestSelector({
  value,
  onChange,
  presetId,
  onPresetChange,
  presets = DEFAULT_AREA_OF_INTEREST_PRESETS,
}: {
  value: AreaOfInterestDraft;
  onChange: (value: AreaOfInterestDraft) => void;
  presetId: string;
  onPresetChange: (value: string) => void;
  presets?: AreaOfInterestPreset[];
}) {
  const worldPresetId =
    presets.find((preset) => preset.areaOfInterest.kind === "world")?.id ??
    "custom";

  function choosePreset(nextPresetId: string) {
    onPresetChange(nextPresetId);
    const preset = presets.find((item) => item.id === nextPresetId);
    if (preset) onChange(areaOfInterestToDraft(preset.areaOfInterest));
  }

  function updateBounds(key: keyof AreaOfInterestDraft, nextValue: string) {
    onPresetChange("custom");
    onChange({ ...value, kind: "bbox", [key]: nextValue });
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label>Area</Label>
        <Select value={presetId} onValueChange={choosePreset}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {presets.map((preset) => (
              <SelectItem key={preset.id} value={preset.id}>
                {preset.label}
              </SelectItem>
            ))}
            <SelectItem value="custom">Custom bbox</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={value.kind === "world" ? "default" : "outline"}
          size="sm"
          onClick={() => {
            onPresetChange(worldPresetId);
            onChange(areaOfInterestToDraft({ kind: "world" }));
          }}
        >
          Full world
        </Button>
        <Button
          type="button"
          variant={value.kind === "bbox" ? "default" : "outline"}
          size="sm"
          onClick={() => {
            onPresetChange("custom");
            onChange({ ...value, kind: "bbox" });
          }}
        >
          Bbox
        </Button>
      </div>
      {value.kind === "bbox" ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="space-y-2">
            <Label>West</Label>
            <Input
              type="number"
              value={value.west}
              onChange={(event) => updateBounds("west", event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>South</Label>
            <Input
              type="number"
              value={value.south}
              onChange={(event) => updateBounds("south", event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>East</Label>
            <Input
              type="number"
              value={value.east}
              onChange={(event) => updateBounds("east", event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>North</Label>
            <Input
              type="number"
              value={value.north}
              onChange={(event) => updateBounds("north", event.target.value)}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function areaOfInterestToDraft(
  areaOfInterest: ConsoleAreaOfInterest,
): AreaOfInterestDraft {
  const [west, south, east, north] = areaOfInterestToBBox(areaOfInterest);
  return {
    kind: areaOfInterest.kind,
    west: String(west),
    south: String(south),
    east: String(east),
    north: String(north),
  };
}

export function draftToAreaOfInterest(
  draft: AreaOfInterestDraft,
): ConsoleAreaOfInterest | null {
  if (draft.kind === "world") return { kind: "world" };
  try {
    return normalizeAreaOfInterest({
      kind: "bbox",
      bbox: [
        Number(draft.west),
        Number(draft.south),
        Number(draft.east),
        Number(draft.north),
      ],
    });
  } catch {
    return null;
  }
}
