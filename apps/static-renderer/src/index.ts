import { serve } from "@hono/node-server";
import { loadWorkspaceEnv } from "@planisfy/env/node";
import { Hono } from "hono";
import { z } from "zod";
import { forwardedAuthHeaders, renderStaticMap } from "./render";

loadWorkspaceEnv();

const port = Number(process.env.PORT ?? "4300");
const hostname = process.env.HOST ?? "0.0.0.0";
const apiBaseUrl = process.env.PLANISFY_API_URL ?? "http://api:4000";

const app = new Hono();

const renderQuerySchema = z.object({
  owner: z.string().min(1),
  style: z.string().min(1),
  center: z
    .string()
    .regex(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/)
    .transform((value) => value.split(",").map(Number) as [number, number]),
  zoom: z.coerce.number().min(0).max(24),
  width: z.coerce.number().int().min(1).max(2048),
  height: z.coerce.number().int().min(1).max(2048),
});

app.get("/health", (c) => {
  return c.json({ ok: true });
});

app.get("/render", async (c) => {
  const parsed = renderQuerySchema.safeParse({
    owner: c.req.query("owner"),
    style: c.req.query("style"),
    center: c.req.query("center"),
    zoom: c.req.query("zoom"),
    width: c.req.query("width"),
    height: c.req.query("height"),
  });

  if (!parsed.success) {
    return c.json(
      {
        error: {
          code: "BAD_REQUEST",
          message:
            "Expected owner, style, center=lon,lat, zoom, width, and height",
        },
      },
      400,
    );
  }

  try {
    const forwardedHeaders = forwardedAuthHeaders(c.req.raw.headers);
    const png = await renderStaticMap({
      ...parsed.data,
      apiBaseUrl,
      forwardedHeaders,
    });

    return new Response(new Uint8Array(png), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control":
          Object.keys(forwardedHeaders).length > 0
            ? "private, no-store"
            : "public, max-age=3600",
      },
    });
  } catch (err) {
    console.error("[static-renderer] Render failed:", err);
    return c.json(
      {
        error: {
          code: "RENDER_FAILED",
          message: err instanceof Error ? err.message : "Static render failed",
        },
      },
      502,
    );
  }
});

serve({ fetch: app.fetch, hostname, port }, (info) => {
  console.log(`Planisfy static renderer listening on ${hostname}:${info.port}`);
});
