import { create } from "zustand"
import { produce } from "immer"
import type { StyleSpecification, LayerSpecification } from "maplibre-gl"

export interface StyleStore {
  // State
  style: StyleSpecification | null
  selectedLayerId: string | null
  mapLoaded: boolean

  // Actions
  loadStyle: (style: StyleSpecification) => void
  setSelectedLayer: (layerId: string | null) => void
  setMapLoaded: (loaded: boolean) => void

  // Layer mutations
  updateLayerPaint: (layerId: string, property: string, value: unknown) => void
  updateLayerLayout: (layerId: string, property: string, value: unknown) => void
  setLayerVisibility: (layerId: string, visible: boolean) => void
  reorderLayers: (fromIndex: number, toIndex: number) => void
  deleteLayer: (layerId: string) => void
  duplicateLayer: (layerId: string) => void

  // Style-level mutations
  updateStyleMetadata: (key: string, value: unknown) => void
  updateStyleName: (name: string) => void

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

  return {
    // Initial state
    style: null,
    selectedLayerId: null,
    mapLoaded: false,

    // Actions
    loadStyle: (style) =>
      set({
        style: JSON.parse(JSON.stringify(style)),
        selectedLayerId: style.layers?.[0]?.id ?? null,
      }),

    setSelectedLayer: (layerId) => set({ selectedLayerId: layerId }),

    setMapLoaded: (loaded) => set({ mapLoaded: loaded }),

    // Layer mutations
    updateLayerPaint: (layerId, property, value) =>
      update((state) => {
        if (!state.style) return
        const layer = state.style.layers.find((l) => l.id === layerId)
        if (!layer || !("paint" in layer)) return
        if (!layer.paint) layer.paint = {} as any
        ;(layer.paint as any)[property] = value
      }),

    updateLayerLayout: (layerId, property, value) =>
      update((state) => {
        if (!state.style) return
        const layer = state.style.layers.find((l) => l.id === layerId)
        if (!layer || !("layout" in layer)) return
        if (!layer.layout) layer.layout = {} as any
        ;(layer.layout as any)[property] = value
      }),

    setLayerVisibility: (layerId, visible) =>
      update((state) => {
        if (!state.style) return
        const layer = state.style.layers.find((l) => l.id === layerId)
        if (!layer || !("layout" in layer)) return
        if (!layer.layout) layer.layout = {} as any
        ;(layer.layout as any).visibility = visible ? "visible" : "none"
      }),

    reorderLayers: (fromIndex, toIndex) =>
      update((state) => {
        if (!state.style) return
        const layers = state.style.layers
        const [removed] = layers.splice(fromIndex, 1)
        if (removed) layers.splice(toIndex, 0, removed)
      }),

    deleteLayer: (layerId) =>
      update((state) => {
        if (!state.style) return
        const idx = state.style.layers.findIndex((l) => l.id === layerId)
        if (idx === -1) return
        state.style.layers.splice(idx, 1)
        if (state.selectedLayerId === layerId) {
          state.selectedLayerId = state.style.layers[0]?.id ?? null
        }
      }),

    duplicateLayer: (layerId) =>
      update((state) => {
        if (!state.style) return
        const idx = state.style.layers.findIndex((l) => l.id === layerId)
        if (idx === -1) return
        const original = state.style.layers[idx]!
        const copy = JSON.parse(JSON.stringify(original))
        copy.id = `${original.id}-copy-${Date.now()}`
        state.style.layers.splice(idx + 1, 0, copy)
        state.selectedLayerId = copy.id
      }),

    // Style-level
    updateStyleMetadata: (key, value) =>
      update((state) => {
        if (!state.style) return
        if (!state.style.metadata) state.style.metadata = {}
        ;(state.style.metadata as any)[key] = value
      }),

    updateStyleName: (name) =>
      update((state) => {
        if (!state.style) return
        state.style.name = name
      }),

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
