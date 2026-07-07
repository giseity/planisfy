import type { LayerSpecification, SourceSpecification, StyleSpecification } from "maplibre-gl";

export type DeploymentMode = "self_host" | "managed";
export type StyleTemplateId =
  | "planisfy-streets-light"
  | "planisfy-streets-dark"
  | "blank";

export interface StyleTemplateOption {
  id: StyleTemplateId;
  name: string;
  description: string;
}

export interface PlatformStyleSource {
  id: string;
  sourceId: string;
  name: string;
  description: string;
  source: SourceSpecification;
  vectorLayers: Array<{ id: string }>;
}

export const MANAGED_BASEMAP_SOURCE_ID = "planisfy-streets";
export const MANAGED_BASEMAP_TILEJSON_PATH = "/tiles/v1/planet-osm-basemap.json";

export const STYLE_TEMPLATE_OPTIONS: StyleTemplateOption[] = [
  {
    id: "planisfy-streets-light",
    name: "Planisfy Streets Light",
    description: "A ready-to-edit light street map backed by the managed planet basemap.",
  },
  {
    id: "planisfy-streets-dark",
    name: "Planisfy Streets Dark",
    description: "A dark street map backed by the managed planet basemap.",
  },
  {
    id: "blank",
    name: "Blank style",
    description: "Start from an empty MapLibre style.",
  },
];

export const MANAGED_BASEMAP_VECTOR_LAYERS = [
  { id: "water" },
  { id: "landcover" },
  { id: "landuse" },
  { id: "building" },
  { id: "transportation" },
  { id: "boundary" },
  { id: "place" },
];

export function isManagedDeploymentMode(mode: string | undefined): mode is "managed" {
  return mode === "managed";
}

export function defaultStyleTemplateId(mode: DeploymentMode): StyleTemplateId {
  return mode === "managed" ? "planisfy-streets-light" : "blank";
}

export function buildStyleTemplate(input: {
  templateId: StyleTemplateId;
  name: string;
  apiRoot: string;
}): StyleSpecification {
  const name = input.name.trim() || "Untitled style";
  if (input.templateId === "blank") return blankStyle(name);

  const dark = input.templateId === "planisfy-streets-dark";
  return {
    version: 8,
    name,
    metadata: {
      "planisfy:template": input.templateId,
      "planisfy:managedDefault": true,
      "planisfy:source": "planet-osm-basemap",
    },
    sources: {
      [MANAGED_BASEMAP_SOURCE_ID]: managedBasemapSource(input.apiRoot),
    },
    glyphs: `${apiRoot(input.apiRoot)}/fonts/v1/{fontstack}/{range}.pbf`,
    center: [9.18, 48.78],
    zoom: 11,
    bearing: 0,
    pitch: 0,
    layers: managedBasemapLayers(dark),
  };
}

export function managedPlatformSources(apiRootValue: string): PlatformStyleSource[] {
  return [
    {
      id: "planet-osm-basemap",
      sourceId: MANAGED_BASEMAP_SOURCE_ID,
      name: "Planet OSM Basemap",
      description: "Managed OpenMapTiles-compatible planet basemap.",
      source: managedBasemapSource(apiRootValue),
      vectorLayers: MANAGED_BASEMAP_VECTOR_LAYERS,
    },
  ];
}

export function blankStyle(name: string): StyleSpecification {
  return {
    version: 8,
    name,
    sources: {},
    layers: [],
  };
}

function managedBasemapSource(apiRootValue: string): SourceSpecification {
  return {
    type: "vector",
    url: `${apiRoot(apiRootValue)}${MANAGED_BASEMAP_TILEJSON_PATH}`,
  } as SourceSpecification;
}

function apiRoot(value: string) {
  return value.replace(/\/$/, "");
}

function managedBasemapLayers(dark: boolean): LayerSpecification[] {
  const palette = dark
    ? {
        background: "#101820",
        water: "#173f5f",
        grass: "#20362b",
        wood: "#1f3b2f",
        park: "#244736",
        building: "#2a2f35",
        buildingOutline: "#3b444d",
        roadMinor: "#39424d",
        roadMajor: "#657286",
        motorway: "#8b6f47",
        boundary: "#7d8793",
        label: "#d7dde5",
        halo: "rgba(16, 24, 32, 0.85)",
      }
    : {
        background: "#dbe7ef",
        water: "#8cc7e8",
        grass: "#d8e8c8",
        wood: "#aed1a0",
        park: "#c8facc",
        building: "#d9d0c9",
        buildingOutline: "#b9b0a9",
        roadMinor: "#ffffff",
        roadMajor: "#ffe9a8",
        motorway: "#ffc47a",
        boundary: "#a090a0",
        label: "#333333",
        halo: "rgba(255, 255, 255, 0.85)",
      };

  return [
    {
      id: "background",
      type: "background",
      paint: { "background-color": palette.background },
    },
    {
      id: "water",
      type: "fill",
      source: MANAGED_BASEMAP_SOURCE_ID,
      "source-layer": "water",
      paint: { "fill-color": palette.water },
    },
    {
      id: "landcover-grass",
      type: "fill",
      source: MANAGED_BASEMAP_SOURCE_ID,
      "source-layer": "landcover",
      filter: ["==", "class", "grass"],
      paint: { "fill-color": palette.grass, "fill-opacity": dark ? 0.7 : 0.6 },
    },
    {
      id: "landcover-wood",
      type: "fill",
      source: MANAGED_BASEMAP_SOURCE_ID,
      "source-layer": "landcover",
      filter: ["==", "class", "wood"],
      paint: { "fill-color": palette.wood, "fill-opacity": dark ? 0.72 : 0.6 },
    },
    {
      id: "landuse-park",
      type: "fill",
      source: MANAGED_BASEMAP_SOURCE_ID,
      "source-layer": "landuse",
      filter: ["==", "class", "park"],
      paint: { "fill-color": palette.park, "fill-opacity": dark ? 0.62 : 0.5 },
    },
    {
      id: "building",
      type: "fill",
      source: MANAGED_BASEMAP_SOURCE_ID,
      "source-layer": "building",
      minzoom: 13,
      paint: {
        "fill-color": palette.building,
        "fill-opacity": dark ? 0.78 : 0.7,
        "fill-outline-color": palette.buildingOutline,
      },
    },
    {
      id: "road-minor",
      type: "line",
      source: MANAGED_BASEMAP_SOURCE_ID,
      "source-layer": "transportation",
      filter: ["all", ["==", "$type", "LineString"], ["in", "class", "minor", "service"]],
      paint: { "line-color": palette.roadMinor, "line-width": 1 },
    },
    {
      id: "road-major",
      type: "line",
      source: MANAGED_BASEMAP_SOURCE_ID,
      "source-layer": "transportation",
      filter: [
        "all",
        ["==", "$type", "LineString"],
        ["in", "class", "primary", "secondary", "tertiary", "trunk"],
      ],
      paint: { "line-color": palette.roadMajor, "line-width": 2 },
    },
    {
      id: "road-motorway",
      type: "line",
      source: MANAGED_BASEMAP_SOURCE_ID,
      "source-layer": "transportation",
      filter: ["all", ["==", "$type", "LineString"], ["==", "class", "motorway"]],
      paint: { "line-color": palette.motorway, "line-width": 3 },
    },
    {
      id: "boundary-country",
      type: "line",
      source: MANAGED_BASEMAP_SOURCE_ID,
      "source-layer": "boundary",
      filter: ["==", "admin_level", 2],
      paint: {
        "line-color": palette.boundary,
        "line-width": 1.5,
        "line-dasharray": [3, 2],
      },
    },
    {
      id: "place-city",
      type: "symbol",
      source: MANAGED_BASEMAP_SOURCE_ID,
      "source-layer": "place",
      filter: ["==", "class", "city"],
      layout: {
        "text-field": "{name:latin}",
        "text-font": ["Open Sans Regular"],
        "text-size": 14,
        "text-max-width": 10,
      },
      paint: {
        "text-color": palette.label,
        "text-halo-color": palette.halo,
        "text-halo-width": 1.5,
      },
    },
    {
      id: "place-country",
      type: "symbol",
      source: MANAGED_BASEMAP_SOURCE_ID,
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
        "text-color": palette.label,
        "text-halo-color": palette.halo,
        "text-halo-width": 2,
      },
    },
  ] as LayerSpecification[];
}
