import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";

const jsonSchema = z.record(z.string(), z.unknown()).openapi("JsonObject");
const errorSchema = z
  .object({
    error: z.object({
      code: z.string().openapi({ example: "BAD_REQUEST" }),
      message: z.string().openapi({ example: "Invalid request" }),
      details: z.unknown().optional(),
    }),
  })
  .openapi("ApiError");

const coordinatesParamSchema = z.object({
  coords: z.string().openapi({
    param: { name: "coords", in: "path" },
    example: "-73.9857,40.7484;-73.9851,40.7580",
  }),
});

const ownerStyleParamsSchema = z.object({
  owner: z.string().openapi({
    param: { name: "owner", in: "path" },
    example: "planisfy",
  }),
  handle: z.string().openapi({
    param: { name: "handle", in: "path" },
    example: "streets",
  }),
});

const ownerTilesetParamsSchema = z.object({
  owner: z.string().openapi({
    param: { name: "owner", in: "path" },
    example: "planisfy",
  }),
  handle: z.string().openapi({
    param: { name: "handle", in: "path" },
    example: "places",
  }),
});

const profileParamSchema = z.object({
  profile: z.string().openapi({
    param: { name: "profile", in: "path" },
    example: "driving",
  }),
});

const geocodingForwardQuerySchema = z.object({
  q: z.string().openapi({ example: "Lagos" }),
  limit: z.coerce.number().int().min(1).max(25).optional(),
  bbox: z.string().optional(),
  language: z.string().optional(),
  country: z.string().optional(),
});

const geocodingReverseQuerySchema = z.object({
  lon: z.coerce.number().min(-180).max(180),
  lat: z.coerce.number().min(-90).max(90),
  limit: z.coerce.number().int().min(1).max(10).optional(),
  language: z.string().optional(),
});

const geocodingAutocompleteQuerySchema = z.object({
  text: z.string().openapi({ example: "Ikoyi" }),
  limit: z.coerce.number().int().min(1).max(10).optional(),
  language: z.string().optional(),
  "focus.lon": z.coerce.number().min(-180).max(180).optional(),
  "focus.lat": z.coerce.number().min(-90).max(90).optional(),
});

const routeBodySchema = z
  .object({
    locations: z
      .array(
        z.object({
          lon: z.number().min(-180).max(180),
          lat: z.number().min(-90).max(90),
        }),
      )
      .min(2),
    costing: z.string().optional(),
    units: z.enum(["kilometers", "miles"]).optional(),
    language: z.string().optional(),
  })
  .passthrough();

const staticMapParamsSchema = z.object({
  owner: z.string().openapi({ param: { name: "owner", in: "path" } }),
  style: z.string().openapi({ param: { name: "style", in: "path" } }),
  center: z.string().openapi({
    param: { name: "center", in: "path" },
    example: "-73.9857,40.7484,12",
  }),
  size: z.string().openapi({
    param: { name: "size", in: "path" },
    example: "800x600.png",
  }),
});

const jsonResponse = (description: string) => ({
  content: {
    "application/json": {
      schema: jsonSchema,
    },
  },
  description,
});

const errorResponse = {
  content: {
    "application/json": {
      schema: errorSchema,
    },
  },
  description: "Error response",
};

const pbfResponse = {
  content: {
    "application/x-protobuf": {
      schema: z.string().openapi({ format: "binary" }),
    },
  },
  description: "Protocol buffer payload",
};

const pngResponse = {
  content: {
    "image/png": {
      schema: z.string().openapi({ format: "binary" }),
    },
  },
  description: "PNG image",
};

const routeConfigs = [
  createRoute({
    method: "get",
    path: "/styles/v1/{owner}/{handle}",
    request: { params: ownerStyleParamsSchema },
    responses: { 200: jsonResponse("Published style JSON"), 404: errorResponse },
    tags: ["Styles"],
  }),
  createRoute({
    method: "get",
    path: "/styles/v1/{owner}/{handle}/sprite.json",
    request: { params: ownerStyleParamsSchema },
    responses: { 200: jsonResponse("Style sprite metadata"), 404: errorResponse },
    tags: ["Styles"],
  }),
  createRoute({
    method: "get",
    path: "/styles/v1/{owner}/{handle}/sprite.png",
    request: { params: ownerStyleParamsSchema },
    responses: { 200: pngResponse, 404: errorResponse },
    tags: ["Styles"],
  }),
  createRoute({
    method: "get",
    path: "/tiles/v1/{owner}/{handle}.json",
    request: { params: ownerTilesetParamsSchema },
    responses: { 200: jsonResponse("TileJSON for the current tileset version"), 404: errorResponse },
    tags: ["Tiles"],
  }),
  createRoute({
    method: "get",
    path: "/tiles/v1/{owner}/{handle}/versions/{version}.json",
    request: {
      params: ownerTilesetParamsSchema.extend({
        version: z.coerce.number().int().positive().openapi({
          param: { name: "version", in: "path" },
        }),
      }),
    },
    responses: { 200: jsonResponse("TileJSON for an immutable tileset version"), 404: errorResponse },
    tags: ["Tiles"],
  }),
  createRoute({
    method: "get",
    path: "/tiles/v1/{owner}/{handle}/{z}/{x}/{y}",
    request: {
      params: ownerTilesetParamsSchema.extend({
        z: z.coerce.number().int().nonnegative().openapi({ param: { name: "z", in: "path" } }),
        x: z.coerce.number().int().nonnegative().openapi({ param: { name: "x", in: "path" } }),
        y: z.string().openapi({ param: { name: "y", in: "path" }, example: "192.png" }),
      }),
    },
    responses: { 200: pbfResponse, 400: errorResponse, 404: errorResponse },
    tags: ["Tiles"],
  }),
  createRoute({
    method: "get",
    path: "/fonts/v1/{fontstack}/{range}",
    request: {
      params: z.object({
        fontstack: z.string().openapi({ param: { name: "fontstack", in: "path" } }),
        range: z.string().openapi({ param: { name: "range", in: "path" }, example: "0-255.pbf" }),
      }),
    },
    responses: { 200: pbfResponse, 400: errorResponse },
    tags: ["Fonts"],
  }),
  createRoute({
    method: "get",
    path: "/geocoding/v1/forward",
    request: { query: geocodingForwardQuerySchema },
    responses: { 200: jsonResponse("Forward geocoding results"), 400: errorResponse, 503: errorResponse },
    tags: ["Geocoding"],
  }),
  createRoute({
    method: "get",
    path: "/geocoding/v1/reverse",
    request: { query: geocodingReverseQuerySchema },
    responses: { 200: jsonResponse("Reverse geocoding results"), 400: errorResponse, 503: errorResponse },
    tags: ["Geocoding"],
  }),
  createRoute({
    method: "get",
    path: "/geocoding/v1/autocomplete",
    request: { query: geocodingAutocompleteQuerySchema },
    responses: { 200: jsonResponse("Geocoding autocomplete results"), 400: errorResponse, 503: errorResponse },
    tags: ["Geocoding"],
  }),
  createRoute({
    method: "get",
    path: "/directions/v1/{profile}/{coords}",
    request: { params: profileParamSchema.merge(coordinatesParamSchema) },
    responses: { 200: jsonResponse("Route result"), 400: errorResponse, 503: errorResponse },
    tags: ["Routing"],
  }),
  createRoute({
    method: "post",
    path: "/directions/v1/{profile}",
    request: {
      params: profileParamSchema,
      body: { content: { "application/json": { schema: routeBodySchema } }, required: true },
    },
    responses: { 200: jsonResponse("Route result"), 400: errorResponse, 503: errorResponse },
    tags: ["Routing"],
  }),
  createRoute({
    method: "get",
    path: "/isochrone/v1/{profile}/{coords}",
    request: { params: profileParamSchema.merge(coordinatesParamSchema) },
    responses: { 200: jsonResponse("Isochrone GeoJSON"), 400: errorResponse, 503: errorResponse },
    tags: ["Routing"],
  }),
  createRoute({
    method: "get",
    path: "/matching/v1/{profile}/{coords}",
    request: { params: profileParamSchema.merge(coordinatesParamSchema) },
    responses: { 200: jsonResponse("Map matching result"), 400: errorResponse, 503: errorResponse },
    tags: ["Routing"],
  }),
  createRoute({
    method: "get",
    path: "/matrix/v1/{profile}/{coords}",
    request: { params: profileParamSchema.merge(coordinatesParamSchema) },
    responses: { 200: jsonResponse("Route matrix result"), 400: errorResponse, 503: errorResponse },
    tags: ["Routing"],
  }),
  createRoute({
    method: "get",
    path: "/optimized-trips/v1/{profile}/{coords}",
    request: { params: profileParamSchema.merge(coordinatesParamSchema) },
    responses: { 200: jsonResponse("Optimized trip result"), 400: errorResponse, 503: errorResponse },
    tags: ["Routing"],
  }),
  createRoute({
    method: "get",
    path: "/elevation/v1/{coords}",
    request: { params: coordinatesParamSchema },
    responses: { 200: jsonResponse("Elevation lookup result"), 400: errorResponse, 503: errorResponse },
    tags: ["Elevation"],
  }),
  createRoute({
    method: "get",
    path: "/elevation/v1/along/{coords}",
    request: { params: coordinatesParamSchema },
    responses: { 200: jsonResponse("Elevation profile result"), 400: errorResponse, 503: errorResponse },
    tags: ["Elevation"],
  }),
  createRoute({
    method: "get",
    path: "/static/v1/{owner}/{style}/{center}/{size}",
    request: { params: staticMapParamsSchema },
    responses: { 200: pngResponse, 400: errorResponse, 501: errorResponse },
    tags: ["Static Maps"],
  }),
] as const;

const publicOpenApi = new OpenAPIHono();
for (const route of routeConfigs) {
  publicOpenApi.openAPIRegistry.registerPath(route);
}

type PublicOpenApiDocument = Record<string, unknown> & {
  components?: {
    securitySchemes?: Record<string, unknown>;
  };
};

export function buildPublicOpenApiDocument(): PublicOpenApiDocument {
  const document = publicOpenApi.getOpenAPI31Document({
    openapi: "3.1.0",
    info: {
      title: "Planisfy Public API",
      version: "0.1.0",
      description:
        "Public customer-facing APIs for map styles, tiles, glyphs, geocoding, routing, elevation, and static maps.",
    },
    tags: [
      { name: "Styles" },
      { name: "Tiles" },
      { name: "Fonts" },
      { name: "Geocoding" },
      { name: "Routing" },
      { name: "Elevation" },
      { name: "Static Maps" },
    ],
    security: [{ ApiKeyAuth: [] }, { CookieAuth: [] }],
  });

  const mutableDocument = document as unknown as PublicOpenApiDocument;
  mutableDocument.components ??= {};
  mutableDocument.components.securitySchemes = {
    ...mutableDocument.components.securitySchemes,
    ApiKeyAuth: {
      type: "apiKey",
      in: "header",
      name: "x-api-key",
    },
    CookieAuth: {
      type: "apiKey",
      in: "cookie",
      name: "planisfy.session_token",
    },
  };

  return mutableDocument;
}
