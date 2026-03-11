"use client"

import { useEffect, useRef, useCallback } from "react"
import maplibregl from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"
import { useStyleStore } from "@/lib/store/style-store"

interface MapPreviewProps {
  inspectMode?: boolean
  onFeatureInspect?: (features: InspectedFeature[]) => void
}

export interface InspectedFeature {
  layer: string
  source: string
  sourceLayer: string
  properties: Record<string, unknown>
}

export function MapPreview({ inspectMode, onFeatureInspect }: MapPreviewProps) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const popupRef = useRef<maplibregl.Popup | null>(null)
  const style = useStyleStore((s) => s.style)
  const setMapLoaded = useStyleStore((s) => s.setMapLoaded)
  const setSelectedLayer = useStyleStore((s) => s.setSelectedLayer)
  const setMapPosition = useStyleStore((s) => s.setMapPosition)

  const handleMapClick = useCallback(
    (e: maplibregl.MapMouseEvent) => {
      if (!inspectMode) return
      const map = mapRef.current
      if (!map) return

      const features = map.queryRenderedFeatures(e.point)
      if (!features.length) {
        popupRef.current?.remove()
        return
      }

      const inspected: InspectedFeature[] = features.slice(0, 10).map((f) => ({
        layer: f.layer.id,
        source: f.source ?? "",
        sourceLayer: f.sourceLayer ?? "",
        properties: f.properties ?? {},
      }))

      onFeatureInspect?.(inspected)

      // Show popup with feature info
      const html = inspected
        .map(
          (f) =>
            `<div style="margin-bottom:6px;font-size:11px;font-family:monospace">` +
            `<strong style="cursor:pointer;color:#3b82f6" data-layer="${f.layer}">${f.layer}</strong>` +
            `<div style="color:#888;font-size:10px">${f.source}${f.sourceLayer ? ` / ${f.sourceLayer}` : ""}</div>` +
            Object.entries(f.properties)
              .slice(0, 8)
              .map(([k, v]) => `<div><span style="color:#888">${k}:</span> ${String(v)}</div>`)
              .join("") +
            (Object.keys(f.properties).length > 8 ? `<div style="color:#888">…${Object.keys(f.properties).length - 8} more</div>` : "") +
            `</div>`
        )
        .join('<hr style="margin:4px 0;border-color:#333">')

      popupRef.current?.remove()
      popupRef.current = new maplibregl.Popup({ maxWidth: "320px" })
        .setLngLat(e.lngLat)
        .setHTML(`<div style="max-height:250px;overflow:auto">${html}</div>`)
        .addTo(map)

      // Add click handlers to layer names in popup
      const popupEl = popupRef.current.getElement()
      popupEl?.querySelectorAll("[data-layer]").forEach((el) => {
        el.addEventListener("click", () => {
          const layerId = el.getAttribute("data-layer")
          if (layerId) setSelectedLayer(layerId)
        })
      })
    },
    [inspectMode, onFeatureInspect, setSelectedLayer]
  )

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || !style) return

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: JSON.parse(JSON.stringify(style)),
      center: [9.18, 48.78], // Stuttgart
      zoom: 11,
      attributionControl: {},
    })

    map.addControl(new maplibregl.NavigationControl(), "top-right")

    map.on("load", () => {
      setMapLoaded(true)
    })

    map.on("moveend", () => {
      const center = map.getCenter()
      setMapPosition({
        center: [center.lng, center.lat],
        zoom: map.getZoom(),
        bearing: map.getBearing(),
        pitch: map.getPitch(),
      })
    })

    mapRef.current = map

    return () => {
      popupRef.current?.remove()
      setMapLoaded(false)
      map.remove()
      mapRef.current = null
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync style changes to map
  useEffect(() => {
    const map = mapRef.current
    if (!map || !style || !map.isStyleLoaded()) return

    try {
      map.setStyle(JSON.parse(JSON.stringify(style)), { diff: true })
    } catch {
      map.setStyle(JSON.parse(JSON.stringify(style)))
    }
  }, [style])

  // Inspect mode click handler
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    map.on("click", handleMapClick)

    // Change cursor in inspect mode
    if (inspectMode) {
      map.getCanvas().style.cursor = "crosshair"
    } else {
      map.getCanvas().style.cursor = ""
      popupRef.current?.remove()
    }

    return () => {
      map.off("click", handleMapClick)
    }
  }, [handleMapClick, inspectMode])

  return (
    <div className="relative h-full w-full">
      <div ref={mapContainer} className="h-full w-full" />
      {inspectMode && (
        <div className="absolute left-2 top-2 rounded bg-background/80 px-2 py-1 text-[10px] font-medium text-muted-foreground backdrop-blur">
          Inspect mode — click features on map
        </div>
      )}
    </div>
  )
}
