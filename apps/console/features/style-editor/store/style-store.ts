import { create } from "zustand";
import { produce } from "immer";
import type {
  StyleSpecification,
  LayerSpecification,
  SourceSpecification,
} from "maplibre-gl";
import { changeLayerType } from "@/features/style-editor/style-spec/layer";
import {
  insertSource,
  type SourceInsertResult,
} from "@/features/style-editor/style-spec/source";
import { api, ApiRequestError } from "@/lib/api";
import type { ApiEnvelope } from "@/lib/api";
import { fetchStyleDetail } from "@/features/style-editor/workflow/style-api";

const MAX_UNDO = 50;

export type SaveStatus = "idle" | "saving" | "saved" | "error" | "conflict";

export interface MapPosition {
  center: [number, number];
  zoom: number;
  bearing: number;
  pitch: number;
}

export interface StyleStore {
  // State
  style: StyleSpecification | null;
  selectedLayerId: string | null;
  mapLoaded: boolean;
  mapPosition: MapPosition | null;

  // Persistence state
  styleId: string | null;
  styleVersion: number | null;
  sessionToken: number;
  sessionStyleId: string | null;
  readOnly: boolean;
  documentRevision: number;
  persistedRevision: number;
  serverRevision: number | null;
  saveStatus: SaveStatus;
  lastSavedAt: Date | null;
  isPublic: boolean;
  styleHandle: string | null;
  publishedVersion: number | null;

  // Undo/redo
  undoStack: StyleSpecification[];
  redoStack: StyleSpecification[];

  // Actions
  loadStyle: (style: StyleSpecification) => void;
  replaceStyleDocument: (style: StyleSpecification) => void;
  beginStyleSession: (styleId: string | null, readOnly?: boolean) => number;
  setSelectedLayer: (layerId: string | null) => void;
  setMapLoaded: (loaded: boolean) => void;
  setMapPosition: (pos: MapPosition) => void;

  // Persistence actions
  loadStyleFromApi: (id: string, sessionToken?: number) => Promise<void>;
  saveStyle: () => Promise<void>;
  publishStyle: () => Promise<boolean>;
  setSaveStatus: (status: SaveStatus) => void;

  // Layer mutations
  updateLayerPaint: (layerId: string, property: string, value: unknown) => void;
  updateLayerLayout: (
    layerId: string,
    property: string,
    value: unknown,
  ) => void;
  updateLayerTopLevel: (layerId: string, key: string, value: unknown) => void;
  setLayerVisibility: (layerId: string, visible: boolean) => void;
  reorderLayers: (fromIndex: number, toIndex: number) => void;
  deleteLayer: (layerId: string) => void;
  duplicateLayer: (layerId: string) => void;
  addLayer: (layer: LayerSpecification, position?: number) => void;
  addLayerFromSource: (sourceId: string, options?: SourceLayerOptions) => void;

  // Source mutations
  addSource: (
    sourceId: string,
    source: SourceSpecification,
  ) => SourceInsertResult;
  updateSource: (sourceId: string, source: SourceSpecification) => void;
  deleteSource: (sourceId: string) => void;

  // Style-level mutations
  updateStyleMetadata: (key: string, value: unknown) => void;
  updateStyleName: (name: string) => void;
  updateStyleTopLevel: (key: string, value: unknown) => void;

  // Undo/redo
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // Computed helpers
  getLayer: (layerId: string) => LayerSpecification | undefined;
  getSelectedLayer: () => LayerSpecification | undefined;
}

export interface SourceLayerOptions {
  layerId?: string;
  layerType?: "circle" | "line" | "fill" | "symbol" | "raster" | "hillshade";
  sourceLayer?: string;
}

interface StyleSaveResponse {
  version: number;
}

type MutableLayer = LayerSpecification & {
  [key: string]: unknown;
  paint?: Record<string, unknown>;
  layout?: Record<string, unknown>;
};

type MutableStyle = StyleSpecification & {
  [key: string]: unknown;
  metadata?: Record<string, unknown>;
};

let activeLoadController: AbortController | null = null;
let saveWorker: Promise<void> | null = null;
let saveRequested = false;

// Helper: produce-based setter that avoids immer middleware type issues
const immerSet =
  (set: (fn: (s: StyleStore) => Partial<StyleStore>) => void) =>
  (fn: (draft: StyleStore) => void) => {
    set((state) => produce(state, fn));
  };

export const useStyleStore = create<StyleStore>()((set, get) => {
  const update = immerSet(set);

  /** Push current style onto undo stack before mutation */
  const pushUndo = () => {
    const { style, undoStack } = get();
    if (!style) return;
    const snapshot = JSON.parse(JSON.stringify(style));
    const stack = [...undoStack, snapshot];
    if (stack.length > MAX_UNDO) stack.shift();
    set({ undoStack: stack, redoStack: [] });
  };

  /** Update with undo support */
  const tracked = (fn: (draft: StyleStore) => void) => {
    if (get().readOnly) return;
    pushUndo();
    update((draft) => {
      fn(draft);
      draft.documentRevision += 1;
      if (draft.saveStatus === "saved") draft.saveStatus = "idle";
    });
    if (saveWorker) saveRequested = true;
  };

  return {
    // Initial state
    style: null,
    selectedLayerId: null,
    mapLoaded: false,
    mapPosition: null,
    undoStack: [],
    redoStack: [],

    // Persistence state
    styleId: null,
    styleVersion: null,
    sessionToken: 0,
    sessionStyleId: null,
    readOnly: false,
    documentRevision: 0,
    persistedRevision: 0,
    serverRevision: null,
    saveStatus: "idle",
    lastSavedAt: null,
    isPublic: false,
    styleHandle: null,
    publishedVersion: null,

    // Actions
    loadStyle: (style) =>
      set({
        style: JSON.parse(JSON.stringify(style)),
        selectedLayerId: style.layers?.[0]?.id ?? null,
        undoStack: [],
        redoStack: [],
        documentRevision: 0,
        persistedRevision: 0,
        saveStatus: "idle",
      }),

    replaceStyleDocument: (style) =>
      tracked((draft) => {
        draft.style = JSON.parse(JSON.stringify(style));
        draft.selectedLayerId = style.layers?.[0]?.id ?? null;
      }),

    beginStyleSession: (styleId, readOnly = false) => {
      activeLoadController?.abort();
      activeLoadController = new AbortController();
      saveRequested = false;
      const token = get().sessionToken + 1;
      set({
        sessionToken: token,
        sessionStyleId: styleId,
        readOnly,
        style: null,
        styleId: null,
        styleVersion: null,
        serverRevision: null,
        documentRevision: 0,
        persistedRevision: 0,
        styleHandle: null,
        isPublic: false,
        publishedVersion: null,
        selectedLayerId: null,
        undoStack: [],
        redoStack: [],
        saveStatus: "idle",
        lastSavedAt: null,
      });
      return token;
    },

    loadStyleFromApi: async (id, providedToken) => {
      const token =
        providedToken ?? get().beginStyleSession(id);
      const controller = activeLoadController ?? new AbortController();
      activeLoadController = controller;
      const data = await fetchStyleDetail(id, controller.signal);
      const state = get();
      if (
        state.sessionToken !== token ||
        state.sessionStyleId !== id ||
        controller.signal.aborted
      ) {
        return;
      }
      const {
        styleJson,
        version,
        id: styleId,
        handle,
        isPublic,
        publishedVersion,
      } = data;
      set({
        style: JSON.parse(JSON.stringify(styleJson)),
        styleId,
        styleVersion: version,
        serverRevision: version,
        documentRevision: 0,
        persistedRevision: 0,
        styleHandle: handle ?? null,
        isPublic: isPublic ?? false,
        publishedVersion: publishedVersion ?? null,
        selectedLayerId:
          (styleJson as StyleSpecification).layers?.[0]?.id ?? null,
        undoStack: [],
        redoStack: [],
        saveStatus: "saved",
        lastSavedAt: null,
      });
    },

    saveStyle: async () => {
      if (get().readOnly) return;
      saveRequested = true;
      if (saveWorker) return saveWorker;

      saveWorker = (async () => {
        while (saveRequested) {
          saveRequested = false;
          const state = get();
          if (
            !state.style ||
            !state.styleId ||
            state.serverRevision === null
          ) {
            return;
          }
          const token = state.sessionToken;
          const styleId = state.styleId;
          const serverRevision = state.serverRevision;
          const documentRevision = state.documentRevision;
          const snapshot = JSON.parse(JSON.stringify(state.style));
          set({ saveStatus: "saving" });
          try {
            const res = await api.put<ApiEnvelope<StyleSaveResponse>>(
              `/styles/${styleId}`,
              {
                styleJson: snapshot,
                version: serverRevision,
              },
            );
            const current = get();
            if (
              current.sessionToken !== token ||
              current.styleId !== styleId
            ) {
              continue;
            }
            const clean = current.documentRevision === documentRevision;
            set({
              styleVersion: res.data.version,
              serverRevision: res.data.version,
              persistedRevision: documentRevision,
              saveStatus: clean ? "saved" : "idle",
              lastSavedAt: new Date(),
            });
            if (!clean) saveRequested = true;
          } catch (err) {
            const current = get();
            if (
              current.sessionToken === token &&
              current.styleId === styleId
            ) {
              set({
                saveStatus:
                  err instanceof ApiRequestError && err.status === 409
                    ? "conflict"
                    : "error",
              });
            }
            throw err;
          }
        }
      })().finally(() => {
        saveWorker = null;
      });
      return saveWorker;
    },

    publishStyle: async () => {
      if (get().readOnly) return false;
      if (get().documentRevision !== get().persistedRevision) {
        await get().saveStyle();
      }
      const { styleId, sessionToken } = get();
      if (!styleId) return false;

      const res = await api.publishStyle(styleId);
      if (
        get().sessionToken !== sessionToken ||
        get().styleId !== styleId
      ) {
        return false;
      }
      set({
        isPublic: res.data.isPublic,
        styleHandle: res.data.handle,
        styleVersion: res.data.version,
        serverRevision: res.data.version,
        publishedVersion: res.data.publishedVersion,
      });
      return res.data.isPublic;
    },

    setSaveStatus: (status) => set({ saveStatus: status }),

    setSelectedLayer: (layerId) => set({ selectedLayerId: layerId }),

    setMapLoaded: (loaded) => set({ mapLoaded: loaded }),

    setMapPosition: (pos) => set({ mapPosition: pos }),

    // Layer mutations
    updateLayerPaint: (layerId, property, value) =>
      tracked((state) => {
        if (!state.style) return;
        const layer = state.style.layers.find((l) => l.id === layerId) as
          | MutableLayer
          | undefined;
        if (!layer) return;
        if (!layer.paint) layer.paint = {};
        layer.paint[property] = value;
      }),

    updateLayerLayout: (layerId, property, value) =>
      tracked((state) => {
        if (!state.style) return;
        const layer = state.style.layers.find((l) => l.id === layerId) as
          | MutableLayer
          | undefined;
        if (!layer) return;
        if (!layer.layout) layer.layout = {};
        layer.layout[property] = value;
      }),

    updateLayerTopLevel: (layerId, key, value) =>
      tracked((state) => {
        if (!state.style) return;
        const idx = state.style.layers.findIndex((l) => l.id === layerId);
        if (idx === -1) return;

        if (key === "type") {
          // Type change: rebuild layer with compatible properties
          const original = JSON.parse(JSON.stringify(state.style.layers[idx]));
          state.style.layers[idx] = changeLayerType(
            original,
            value as LayerSpecification["type"],
          );
        } else {
          (state.style.layers[idx] as MutableLayer)[key] = value;
        }
      }),

    setLayerVisibility: (layerId, visible) =>
      tracked((state) => {
        if (!state.style) return;
        const layer = state.style.layers.find((l) => l.id === layerId) as
          | MutableLayer
          | undefined;
        if (!layer) return;
        if (!layer.layout) layer.layout = {};
        layer.layout.visibility = visible ? "visible" : "none";
      }),

    reorderLayers: (fromIndex, toIndex) =>
      tracked((state) => {
        if (!state.style) return;
        const layers = state.style.layers;
        const [removed] = layers.splice(fromIndex, 1);
        if (removed) layers.splice(toIndex, 0, removed);
      }),

    deleteLayer: (layerId) =>
      tracked((state) => {
        if (!state.style) return;
        const idx = state.style.layers.findIndex((l) => l.id === layerId);
        if (idx === -1) return;
        state.style.layers.splice(idx, 1);
        if (state.selectedLayerId === layerId) {
          state.selectedLayerId = state.style.layers[0]?.id ?? null;
        }
      }),

    duplicateLayer: (layerId) =>
      tracked((state) => {
        if (!state.style) return;
        const idx = state.style.layers.findIndex((l) => l.id === layerId);
        if (idx === -1) return;
        const original = state.style.layers[idx]!;
        const copy = JSON.parse(JSON.stringify(original));
        copy.id = `${original.id}-copy-${Date.now()}`;
        state.style.layers.splice(idx + 1, 0, copy);
        state.selectedLayerId = copy.id;
      }),

    addLayer: (layer, position) =>
      tracked((state) => {
        if (!state.style) return;
        if (position !== undefined) {
          state.style.layers.splice(position, 0, layer);
        } else {
          state.style.layers.push(layer);
        }
        state.selectedLayerId = layer.id;
      }),

    addLayerFromSource: (sourceId, options = {}) =>
      tracked((state) => {
        if (!state.style) return;
        const source = state.style.sources[sourceId];
        if (!source) return;

        const layerType =
          options.layerType ?? defaultLayerTypeForSource(source);
        const layerId =
          options.layerId ??
          uniqueLayerId(
            `${sourceId}-${options.sourceLayer ?? layerType ?? "layer"}`,
            state.style.layers.map((layer) => layer.id),
          );
        const layer = buildLayerFromSource(
          sourceId,
          source,
          layerType,
          { ...options, layerId },
        );
        state.style.layers.push(layer);
        state.selectedLayerId = layer.id;
      }),

    // Source mutations
    addSource: (sourceId, source) =>
      (() => {
        const style = get().style;
        if (!style) return { ok: false, code: "INVALID_SOURCE_ID" };
        const result = insertSource(style, sourceId, source);
        if (!result.ok) return result;
        tracked((state) => {
          state.style = result.style;
        });
        return result;
      })(),

    updateSource: (sourceId, source) =>
      tracked((state) => {
        if (!state.style) return;
        state.style.sources[sourceId] = source;
      }),

    deleteSource: (sourceId) =>
      tracked((state) => {
        if (!state.style) return;
        delete state.style.sources[sourceId];
      }),

    // Style-level
    updateStyleMetadata: (key, value) =>
      tracked((state) => {
        if (!state.style) return;
        if (!state.style.metadata) state.style.metadata = {};
        (state.style.metadata as Record<string, unknown>)[key] = value;
      }),

    updateStyleName: (name) =>
      tracked((state) => {
        if (!state.style) return;
        state.style.name = name;
      }),

    updateStyleTopLevel: (key, value) =>
      tracked((state) => {
        if (!state.style) return;
        (state.style as MutableStyle)[key] = value;
      }),

    // Undo/redo
    undo: () => {
      if (get().readOnly) return;
      const { style, undoStack, redoStack } = get();
      if (undoStack.length === 0 || !style) return;
      const prev = undoStack[undoStack.length - 1]!;
      set({
        style: prev,
        undoStack: undoStack.slice(0, -1),
        redoStack: [...redoStack, JSON.parse(JSON.stringify(style))],
        documentRevision: get().documentRevision + 1,
        saveStatus: "idle",
      });
      if (saveWorker) saveRequested = true;
    },

    redo: () => {
      if (get().readOnly) return;
      const { style, undoStack, redoStack } = get();
      if (redoStack.length === 0 || !style) return;
      const next = redoStack[redoStack.length - 1]!;
      set({
        style: next,
        redoStack: redoStack.slice(0, -1),
        undoStack: [...undoStack, JSON.parse(JSON.stringify(style))],
        documentRevision: get().documentRevision + 1,
        saveStatus: "idle",
      });
      if (saveWorker) saveRequested = true;
    },

    canUndo: () => get().undoStack.length > 0,
    canRedo: () => get().redoStack.length > 0,

    // Computed
    getLayer: (layerId) => {
      return get().style?.layers.find((l) => l.id === layerId);
    },

    getSelectedLayer: () => {
      const { style, selectedLayerId } = get();
      if (!style || !selectedLayerId) return undefined;
      return style.layers.find((l) => l.id === selectedLayerId);
    },
  };
});

function slugifyLayerId(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "layer"
  );
}

export function uniqueLayerId(value: string, existingIds: string[]): string {
  const base = slugifyLayerId(value);
  const existing = new Set(existingIds);
  if (!existing.has(base)) return base;

  let index = 2;
  while (existing.has(`${base}-${index}`)) index += 1;
  return `${base}-${index}`;
}

function defaultLayerTypeForSource(
  source: SourceSpecification,
): SourceLayerOptions["layerType"] {
  if (source.type === "raster") return "raster";
  if (source.type === "raster-dem") return "hillshade";
  if (source.type === "vector" || source.type === "geojson") return "circle";
  return undefined;
}

function buildLayerFromSource(
  sourceId: string,
  source: SourceSpecification,
  layerType: SourceLayerOptions["layerType"],
  options: SourceLayerOptions,
): LayerSpecification {
  const id = slugifyLayerId(
    options.layerId ?? `${sourceId}-${layerType ?? "layer"}`,
  );

  switch (layerType) {
    case "line":
      return {
        id,
        type: "line",
        source: sourceId,
        ...(source.type === "vector" && options.sourceLayer
          ? { "source-layer": options.sourceLayer }
          : {}),
        paint: { "line-color": "#2563eb", "line-width": 2 },
      } as LayerSpecification;
    case "fill":
      return {
        id,
        type: "fill",
        source: sourceId,
        ...(source.type === "vector" && options.sourceLayer
          ? { "source-layer": options.sourceLayer }
          : {}),
        paint: { "fill-color": "#2563eb", "fill-opacity": 0.35 },
      } as LayerSpecification;
    case "symbol":
      return {
        id,
        type: "symbol",
        source: sourceId,
        ...(source.type === "vector" && options.sourceLayer
          ? { "source-layer": options.sourceLayer }
          : {}),
        layout: {
          "text-field": ["coalesce", ["get", "name"], ""],
          "text-size": 12,
        },
        paint: { "text-color": "#111827" },
      } as LayerSpecification;
    case "raster":
      return { id, type: "raster", source: sourceId } as LayerSpecification;
    case "hillshade":
      return { id, type: "hillshade", source: sourceId } as LayerSpecification;
    case "circle":
    default:
      return {
        id,
        type: "circle",
        source: sourceId,
        ...(source.type === "vector" && options.sourceLayer
          ? { "source-layer": options.sourceLayer }
          : {}),
        paint: {
          "circle-color": "#2563eb",
          "circle-radius": 5,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1,
        },
      } as LayerSpecification;
  }
}
