import type { StyleSpecification } from "maplibre-gl"

/**
 * Sample MapLibre style for development.
 * Uses OpenFreeMap tiles (free, no API key required).
 */
export const sampleStyle: StyleSpecification = {
  version: 8,
  name: "Planisfy Basic",
  metadata: {
    "planisfy:author": "system",
    "planisfy:description": "A clean basic style for development",
  },
  sources: {
    openmaptiles: {
      type: "vector",
      url: "https://tiles.openfreemap.org/planet",
    },
  },
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
  layers: [
    {
      id: "background",
      type: "background",
      paint: {
        "background-color": "#f8f4f0",
      },
    },
    {
      id: "water",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "water",
      paint: {
        "fill-color": "#a0c8f0",
        "fill-opacity": 1,
      },
    },
    {
      id: "landcover-grass",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "landcover",
      filter: ["==", "class", "grass"],
      paint: {
        "fill-color": "#d8e8c8",
        "fill-opacity": 0.6,
      },
    },
    {
      id: "landcover-wood",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "landcover",
      filter: ["==", "class", "wood"],
      paint: {
        "fill-color": "#aed1a0",
        "fill-opacity": 0.6,
      },
    },
    {
      id: "landuse-park",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "landuse",
      filter: ["==", "class", "park"],
      paint: {
        "fill-color": "#c8facc",
        "fill-opacity": 0.5,
      },
    },
    {
      id: "building",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "building",
      minzoom: 13,
      paint: {
        "fill-color": "#d9d0c9",
        "fill-opacity": 0.7,
        "fill-outline-color": "#b9b0a9",
      },
    },
    {
      id: "road-minor",
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      filter: ["all", ["==", "$type", "LineString"], ["in", "class", "minor", "service"]],
      paint: {
        "line-color": "#ffffff",
        "line-width": 1,
      },
    },
    {
      id: "road-major",
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      filter: [
        "all",
        ["==", "$type", "LineString"],
        ["in", "class", "primary", "secondary", "tertiary", "trunk"],
      ],
      paint: {
        "line-color": "#fea",
        "line-width": 2,
      },
    },
    {
      id: "road-motorway",
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      filter: ["all", ["==", "$type", "LineString"], ["==", "class", "motorway"]],
      paint: {
        "line-color": "#fc8",
        "line-width": 3,
      },
    },
    {
      id: "boundary-country",
      type: "line",
      source: "openmaptiles",
      "source-layer": "boundary",
      filter: ["==", "admin_level", 2],
      paint: {
        "line-color": "#a090a0",
        "line-width": 1.5,
        "line-dasharray": [3, 2],
      },
    },
    {
      id: "place-city",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "place",
      filter: ["==", "class", "city"],
      layout: {
        "text-field": "{name:latin}",
        "text-font": ["Open Sans Regular"],
        "text-size": 14,
        "text-max-width": 10,
      },
      paint: {
        "text-color": "#333",
        "text-halo-color": "rgba(255, 255, 255, 0.8)",
        "text-halo-width": 1.5,
      },
    },
    {
      id: "place-country",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "place",
      filter: ["==", "class", "country"],
      layout: {
        "text-field": "{name:latin}",
        "text-font": ["Open Sans Regular"],
        "text-size": 16,
        "text-transform": "uppercase",
        "text-max-width": 10,
      },
      paint: {
        "text-color": "#555",
        "text-halo-color": "rgba(255, 255, 255, 0.8)",
        "text-halo-width": 2,
      },
    },
  ],
}
