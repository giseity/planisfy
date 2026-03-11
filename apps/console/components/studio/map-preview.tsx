"use client"

import { useEffect, useRef } from "react"
import maplibregl from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"
import { useStyleStore } from "@/lib/store/style-store"

export function MapPreview() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const style = useStyleStore((s) => s.style)
  const setMapLoaded = useStyleStore((s) => s.setMapLoaded)

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

    mapRef.current = map

    return () => {
      setMapLoaded(false)
      map.remove()
      mapRef.current = null
    }
    // Only run on mount — style updates handled by the effect below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync style changes to map (granular updates)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !style || !map.isStyleLoaded()) return

    // For the vertical slice, use setStyle with diff: true for efficient updates
    try {
      map.setStyle(JSON.parse(JSON.stringify(style)), { diff: true })
    } catch {
      // Fallback: full style reload if diff fails
      map.setStyle(JSON.parse(JSON.stringify(style)))
    }
  }, [style])

  return (
    <div className="relative h-full w-full">
      <div ref={mapContainer} className="h-full w-full" />
    </div>
  )
}
