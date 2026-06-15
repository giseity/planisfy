"use client";

import { useStyleStore } from "@/lib/store/style-store";
import { ScrollArea } from "@planisfy/ui/components/scroll-area";
import {
  Eye,
  EyeOff,
  Square,
  Minus,
  Type,
  Circle,
  Layers,
  Copy,
  Trash2,
  GripVertical,
  Plus,
  ChevronRight,
  ChevronDown,
  Group,
} from "lucide-react";
import { cn } from "@planisfy/ui/lib/utils";
import { Button } from "@planisfy/ui/components/button";
import { Input } from "@planisfy/ui/components/input";
import { useState, useMemo } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { LayerSpecification } from "maplibre-gl";

type LayerRecord = LayerSpecification & {
  layout?: { visibility?: string };
  "source-layer"?: string;
};

const layerTypeIcons: Record<string, React.ElementType> = {
  background: Square,
  fill: Square,
  line: Minus,
  symbol: Type,
  circle: Circle,
  "fill-extrusion": Layers,
  raster: Layers,
  hillshade: Layers,
  heatmap: Layers,
};

const layerTypeColors: Record<string, string> = {
  background: "text-slate-400",
  fill: "text-blue-400",
  line: "text-orange-400",
  symbol: "text-purple-400",
  circle: "text-green-400",
  "fill-extrusion": "text-cyan-400",
  raster: "text-amber-400",
  hillshade: "text-emerald-400",
  heatmap: "text-red-400",
};

export function LayerList() {
  const style = useStyleStore((s) => s.style);
  const selectedLayerId = useStyleStore((s) => s.selectedLayerId);
  const setSelectedLayer = useStyleStore((s) => s.setSelectedLayer);
  const setLayerVisibility = useStyleStore((s) => s.setLayerVisibility);
  const deleteLayer = useStyleStore((s) => s.deleteLayer);
  const duplicateLayer = useStyleStore((s) => s.duplicateLayer);
  const reorderLayers = useStyleStore((s) => s.reorderLayers);
  const addLayer = useStyleStore((s) => s.addLayer);
  const [filter, setFilter] = useState("");
  const [groupBySource, setGroupBySource] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set(),
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const layers = useMemo(() => {
    if (!style) return [];
    if (!filter) return style.layers;
    return style.layers.filter((l) =>
      l.id.toLowerCase().includes(filter.toLowerCase()),
    );
  }, [style, filter]);

  const groups = useMemo(() => {
    if (!groupBySource) return null;
    const map = new Map<string, LayerSpecification[]>();
    for (const layer of layers) {
      const key = layerSourceLayer(layer) ?? "(no source-layer)";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(layer);
    }
    return map;
  }, [layers, groupBySource]);

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (!style) return null;

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const allLayers = style.layers;
    const fromIndex = allLayers.findIndex((l) => l.id === active.id);
    const toIndex = allLayers.findIndex((l) => l.id === over.id);
    if (fromIndex !== -1 && toIndex !== -1) {
      reorderLayers(fromIndex, toIndex);
    }
  };

  const handleAddLayer = () => {
    const newLayer: LayerSpecification = {
      id: `new-layer-${Date.now()}`,
      type: "background",
      paint: { "background-color": "#ffffff" },
    };
    addLayer(newLayer);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b p-2 space-y-1">
        <div className="flex gap-1">
          <Input
            placeholder="Filter layers..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="h-7 text-xs flex-1"
          />
          <Button
            variant={groupBySource ? "secondary" : "ghost"}
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={() => setGroupBySource(!groupBySource)}
            title="Group by source-layer"
          >
            <Group className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <ScrollArea className="flex-1">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={layers.map((l) => l.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="p-1">
              {groups
                ? Array.from(groups.entries()).map(
                    ([groupName, groupLayers]) => (
                      <div key={groupName}>
                        <button
                          className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-accent/50"
                          onClick={() => toggleGroup(groupName)}
                        >
                          {collapsedGroups.has(groupName) ? (
                            <ChevronRight className="h-3 w-3" />
                          ) : (
                            <ChevronDown className="h-3 w-3" />
                          )}
                          <span className="truncate">{groupName}</span>
                          <span className="text-[9px] text-muted-foreground/60 ml-auto">
                            {groupLayers.length}
                          </span>
                        </button>
                        {!collapsedGroups.has(groupName) &&
                          groupLayers.map((layer) => (
                            <SortableLayerItem
                              key={layer.id}
                              layer={layer}
                              isSelected={layer.id === selectedLayerId}
                              onSelect={() => setSelectedLayer(layer.id)}
                              onToggleVisibility={() => {
                                const isVisible = isLayerVisible(layer);
                                setLayerVisibility(layer.id, !isVisible);
                              }}
                              onDuplicate={() => duplicateLayer(layer.id)}
                              onDelete={() => deleteLayer(layer.id)}
                            />
                          ))}
                      </div>
                    ),
                  )
                : layers.map((layer) => (
                    <SortableLayerItem
                      key={layer.id}
                      layer={layer}
                      isSelected={layer.id === selectedLayerId}
                      onSelect={() => setSelectedLayer(layer.id)}
                      onToggleVisibility={() => {
                        const isVisible = isLayerVisible(layer);
                        setLayerVisibility(layer.id, !isVisible);
                      }}
                      onDuplicate={() => duplicateLayer(layer.id)}
                      onDelete={() => deleteLayer(layer.id)}
                    />
                  ))}
            </div>
          </SortableContext>
        </DndContext>
      </ScrollArea>
      <div className="border-t p-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-full gap-1 text-xs"
          onClick={handleAddLayer}
        >
          <Plus className="h-3 w-3" /> Add layer
        </Button>
      </div>
    </div>
  );
}

function SortableLayerItem({
  layer,
  isSelected,
  onSelect,
  onToggleVisibility,
  onDuplicate,
  onDelete,
}: {
  layer: LayerSpecification;
  isSelected: boolean;
  onSelect: () => void;
  onToggleVisibility: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: layer.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const Icon = layerTypeIcons[layer.type] || Layers;
  const iconColor = layerTypeColors[layer.type] || "text-muted-foreground";
  const isVisible = isLayerVisible(layer);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group flex items-center gap-1 rounded-md px-1 py-1 text-xs cursor-pointer hover:bg-accent",
        isSelected && "bg-accent",
        !isVisible && "opacity-50",
      )}
      onClick={onSelect}
    >
      <button
        className="cursor-grab touch-none text-muted-foreground opacity-0 group-hover:opacity-100"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3 w-3" />
      </button>
      <Icon className={cn("h-3 w-3 shrink-0", iconColor)} />
      <span className="flex-1 truncate">{layer.id}</span>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5"
          onClick={(e) => {
            e.stopPropagation();
            onDuplicate();
          }}
        >
          <Copy className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 text-destructive"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
      <button
        className="shrink-0 p-0.5 text-muted-foreground hover:text-foreground"
        onClick={(e) => {
          e.stopPropagation();
          onToggleVisibility();
        }}
      >
        {isVisible ? (
          <Eye className="h-3 w-3" />
        ) : (
          <EyeOff className="h-3 w-3" />
        )}
      </button>
    </div>
  );
}

function layerSourceLayer(layer: LayerSpecification) {
  return (layer as LayerRecord)["source-layer"];
}

function isLayerVisible(layer: LayerSpecification) {
  return (layer as LayerRecord).layout?.visibility !== "none";
}
