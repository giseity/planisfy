import { create } from "zustand"
import { produce } from "immer"
import type { StyleSpecification, LayerSpecification, SourceSpecification } from "maplibre-gl"
import { changeLayerType } from "@/lib/style-spec/layer"

const MAX_UNDO = 50

export interface StyleStore {
  // State
  style: StyleSpecification | null
  selectedLayerId: string | null
  mapLoaded: boolean

  // Undo/redo
  undoStack: StyleSpecification[]
  redoStack: StyleSpecification[]

  // Actions
  loadStyle: (style: StyleSpecification) => void
  setSelectedLayer: (layerId: string | null) => void
  setMapLoaded: (loaded: boolean) => void

  // Layer mutations
  updateLayerPaint: (layerId: string, property: string, value: unknown) => void
  updateLayerLayout: (layerId: string, property: string, value: unknown) => void
  updateLayerTopLevel: (layerId: string, key: string, value: unknown) => void
  setLayerVisibility: (layerId: string, visible: boolean) => void
  reorderLayers: (fromIndex: number, toIndex: number) => void
  deleteLayer: (layerId: string) => void
  duplicateLayer: (layerId: string) => void
  addLayer: (layer: LayerSpecification, position?: number) => void

  // Source mutations
  addSource: (sourceId: string, source: SourceSpecification) => void
  updateSource: (sourceId: string, source: SourceSpecification) => void
  deleteSource: (sourceId: string) => void

  // Style-level mutations
  updateStyleMetadata: (key: string, value: unknown) => void
  updateStyleName: (name: string) => void

  // Undo/redo
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean

  // Computed helpers
  getLayer: (layerId: string) => LayerSpecification | undefined
  getSelectedLayer: () => LayerSpecification | undefined
}

// Helper: produce-based setter that avoids immer middleware type issues
const immerSet =
  (set: (fn: (s: StyleStore) => Partial<StyleStore>) => void) =>
  (fn: (draft: StyleStore) => void) => {
    set((state) => produce(state, fn))
  }

export const useStyleStore = create<StyleStore>()((set, get) => {
  const update = immerSet(set)

  /** Push current style onto undo stack before mutation */
  const pushUndo = () => {
    const { style, undoStack } = get()
    if (!style) return
    const snapshot = JSON.parse(JSON.stringify(style))
    const stack = [...undoStack, snapshot]
    if (stack.length > MAX_UNDO) stack.shift()
    set({ undoStack: stack, redoStack: [] })
  }

  /** Update with undo support */
  const tracked = (fn: (draft: StyleStore) => void) => {
    pushUndo()
    update(fn)
  }

  return {
    // Initial state
    style: null,
    selectedLayerId: null,
    mapLoaded: false,
    undoStack: [],
    redoStack: [],

    // Actions
    loadStyle: (style) =>
      set({
        style: JSON.parse(JSON.stringify(style)),
        selectedLayerId: style.layers?.[0]?.id ?? null,
        undoStack: [],
        redoStack: [],
      }),

    setSelectedLayer: (layerId) => set({ selectedLayerId: layerId }),

    setMapLoaded: (loaded) => set({ mapLoaded: loaded }),

    // Layer mutations
    updateLayerPaint: (layerId, property, value) =>
      tracked((state) => {
        if (!state.style) return
        const layer = state.style.layers.find((l) => l.id === layerId) as any
        if (!layer) return
        if (!layer.paint) layer.paint = {}
        layer.paint[property] = value
      }),

    updateLayerLayout: (layerId, property, value) =>
      tracked((state) => {
        if (!state.style) return
        const layer = state.style.layers.find((l) => l.id === layerId) as any
        if (!layer) return
        if (!layer.layout) layer.layout = {}
        layer.layout[property] = value
      }),

    updateLayerTopLevel: (layerId, key, value) =>
      tracked((state) => {
        if (!state.style) return
        const idx = state.style.layers.findIndex((l) => l.id === layerId)
        if (idx === -1) return

        if (key === "type") {
          // Type change: rebuild layer with compatible properties
          const original = JSON.parse(JSON.stringify(state.style.layers[idx]))
          state.style.layers[idx] = changeLayerType(original, value as LayerSpecification["type"])
        } else {
          ;(state.style.layers[idx] as any)[key] = value
        }
      }),

    setLayerVisibility: (layerId, visible) =>
      tracked((state) => {
        if (!state.style) return
        const layer = state.style.layers.find((l) => l.id === layerId) as any
        if (!layer) return
        if (!layer.layout) layer.layout = {}
        layer.layout.visibility = visible ? "visible" : "none"
      }),

    reorderLayers: (fromIndex, toIndex) =>
      tracked((state) => {
        if (!state.style) return
        const layers = state.style.layers
        const [removed] = layers.splice(fromIndex, 1)
        if (removed) layers.splice(toIndex, 0, removed)
      }),

    deleteLayer: (layerId) =>
      tracked((state) => {
        if (!state.style) return
        const idx = state.style.layers.findIndex((l) => l.id === layerId)
        if (idx === -1) return
        state.style.layers.splice(idx, 1)
        if (state.selectedLayerId === layerId) {
          state.selectedLayerId = state.style.layers[0]?.id ?? null
        }
      }),

    duplicateLayer: (layerId) =>
      tracked((state) => {
        if (!state.style) return
        const idx = state.style.layers.findIndex((l) => l.id === layerId)
        if (idx === -1) return
        const original = state.style.layers[idx]!
        const copy = JSON.parse(JSON.stringify(original))
        copy.id = `${original.id}-copy-${Date.now()}`
        state.style.layers.splice(idx + 1, 0, copy)
        state.selectedLayerId = copy.id
      }),

    addLayer: (layer, position) =>
      tracked((state) => {
        if (!state.style) return
        if (position !== undefined) {
          state.style.layers.splice(position, 0, layer)
        } else {
          state.style.layers.push(layer)
        }
        state.selectedLayerId = layer.id
      }),

    // Source mutations
    addSource: (sourceId, source) =>
      tracked((state) => {
        if (!state.style) return
        state.style.sources[sourceId] = source
      }),

    updateSource: (sourceId, source) =>
      tracked((state) => {
        if (!state.style) return
        state.style.sources[sourceId] = source
      }),

    deleteSource: (sourceId) =>
      tracked((state) => {
        if (!state.style) return
        delete state.style.sources[sourceId]
      }),

    // Style-level
    updateStyleMetadata: (key, value) =>
      tracked((state) => {
        if (!state.style) return
        if (!state.style.metadata) state.style.metadata = {}
        ;(state.style.metadata as any)[key] = value
      }),

    updateStyleName: (name) =>
      tracked((state) => {
        if (!state.style) return
        state.style.name = name
      }),

    // Undo/redo
    undo: () => {
      const { style, undoStack, redoStack } = get()
      if (undoStack.length === 0 || !style) return
      const prev = undoStack[undoStack.length - 1]!
      set({
        style: prev,
        undoStack: undoStack.slice(0, -1),
        redoStack: [...redoStack, JSON.parse(JSON.stringify(style))],
      })
    },

    redo: () => {
      const { style, undoStack, redoStack } = get()
      if (redoStack.length === 0 || !style) return
      const next = redoStack[redoStack.length - 1]!
      set({
        style: next,
        redoStack: redoStack.slice(0, -1),
        undoStack: [...undoStack, JSON.parse(JSON.stringify(style))],
      })
    },

    canUndo: () => get().undoStack.length > 0,
    canRedo: () => get().redoStack.length > 0,

    // Computed
    getLayer: (layerId) => {
      return get().style?.layers.find((l) => l.id === layerId)
    },

    getSelectedLayer: () => {
      const { style, selectedLayerId } = get()
      if (!style || !selectedLayerId) return undefined
      return style.layers.find((l) => l.id === selectedLayerId)
    },
  }
})
