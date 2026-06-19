export type OvertureGeometry =
  | "Point"
  | "LineString"
  | "Polygon"
  | "MultiPolygon";

export type OvertureTypeCatalogEntry = {
  theme: string;
  type: string;
  label: string;
  description: string;
  geometry: OvertureGeometry[];
  defaultLayerId: string;
  defaultMaxFeatures?: number;
};

export type OvertureThemeCatalogEntry = {
  theme: string;
  label: string;
  description: string;
  types: OvertureTypeCatalogEntry[];
};

export const OVERTURE_CATALOG = [
  theme("addresses", "Addresses", "Structured address point labels.", [
    type("addresses", "address", "Address", "Point", "Geocoding and address display."),
  ]),
  theme("base", "Base", "Land, water, land use, land cover, infrastructure, and bathymetry.", [
    type("base", "bathymetry", "Bathymetry", "Polygon", "Ocean depth and seafloor polygons."),
    type("base", "infrastructure", "Infrastructure", ["Point", "LineString", "Polygon"], "Infrastructure features such as towers, piers, bridges, and lines."),
    type("base", "land", "Land", "Polygon", "Land polygons derived from coastlines."),
    type("base", "land_cover", "Land cover", "Polygon", "Earth observation land-cover classifications."),
    type("base", "land_use", "Land use", "Polygon", "Human use classifications such as parks and residential areas."),
    type("base", "water", "Water", "Polygon", "Ocean and inland water features."),
  ]),
  theme("buildings", "Buildings", "Building footprints and building parts.", [
    type("buildings", "building", "Building", "Polygon", "Building footprints."),
    type("buildings", "building_part", "Building part", "Polygon", "Parts associated with parent buildings."),
  ]),
  theme("divisions", "Divisions", "Administrative and settlement divisions.", [
    type("divisions", "division", "Division", "Point", "Point representation of countries, regions, localities, and neighborhoods."),
    type("divisions", "division_area", "Division area", "Polygon", "Area geometry belonging to a division."),
    type("divisions", "division_boundary", "Division boundary", "LineString", "Boundary geometry between divisions."),
  ]),
  theme("places", "Places", "Facilities, businesses, services, and amenities.", [
    type("places", "place", "Place", "Point", "Point places with categories and operating status."),
  ]),
  theme("transportation", "Transportation", "Transportation network segments and connectors.", [
    type("transportation", "segment", "Segment", "LineString", "Road, rail, waterway, and ferry route centerlines."),
    type("transportation", "connector", "Connector", "Point", "Network connection points used by transportation segments."),
  ]),
] as const satisfies OvertureThemeCatalogEntry[];

export type OvertureCatalog = typeof OVERTURE_CATALOG;

export class UnsupportedOvertureTypeError extends Error {
  constructor(
    readonly theme: string,
    readonly type?: string,
  ) {
    super(
      type
        ? `Unsupported Overture theme/type pair: ${theme}/${type}`
        : `Overture theme ${theme} requires an explicit feature type`,
    );
    this.name = "UnsupportedOvertureTypeError";
  }
}

export function findOvertureType(
  themeName: string,
  typeName: string | undefined,
): OvertureTypeCatalogEntry | null {
  const themeEntry = OVERTURE_CATALOG.find((entry) => entry.theme === themeName);
  if (!themeEntry || !typeName) return null;
  return themeEntry.types.find((entry) => entry.type === typeName) ?? null;
}

export function validateOvertureThemeType(params: {
  theme: string;
  type?: string;
  allowExperimental?: boolean;
}): OvertureTypeCatalogEntry | null {
  const entry = findOvertureType(params.theme, params.type);
  if (entry) return entry;

  if (params.allowExperimental && params.type) {
    return null;
  }

  throw new UnsupportedOvertureTypeError(params.theme, params.type);
}

export function overtureCatalogResponse() {
  return {
    data: {
      themes: OVERTURE_CATALOG,
    },
  };
}

function theme(
  themeName: string,
  label: string,
  description: string,
  types: OvertureTypeCatalogEntry[],
): OvertureThemeCatalogEntry {
  return { theme: themeName, label, description, types };
}

function type(
  themeName: string,
  typeName: string,
  label: string,
  geometry: OvertureGeometry | OvertureGeometry[],
  description: string,
): OvertureTypeCatalogEntry {
  return {
    theme: themeName,
    type: typeName,
    label,
    description,
    geometry: Array.isArray(geometry) ? geometry : [geometry],
    defaultLayerId: typeName,
  };
}
