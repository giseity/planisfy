import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import type { Browser } from "playwright";
import { chromium } from "playwright";

const require = createRequire(import.meta.url);

export type RenderRequest = {
  owner: string;
  style: string;
  center: [number, number];
  zoom: number;
  width: number;
  height: number;
  apiBaseUrl: string;
  forwardedHeaders: Record<string, string>;
};

let browserPromise: Promise<Browser> | null = null;
let assetsPromise: Promise<{ js: string; css: string }> | null = null;

export async function renderStaticMap(request: RenderRequest) {
  const browser = await getBrowser();
  const { js, css } = await getMapLibreAssets();
  const styleJson = await fetchStyle(request);
  const normalizedStyle = normalizeStyleUrls(styleJson, request.apiBaseUrl);
  const apiOrigin = new URL(request.apiBaseUrl).origin;
  const page = await browser.newPage({
    viewport: {
      width: request.width,
      height: request.height,
    },
    deviceScaleFactor: 1,
  });

  try {
    await page.route("**/*", async (route) => {
      const headers = headersForRouteRequest(
        route.request().url(),
        route.request().headers(),
        request.forwardedHeaders,
        apiOrigin,
      );
      await route.continue({ headers });
    });

    await page.setContent(renderHtml({ js, css }), {
      waitUntil: "domcontentloaded",
    });

    await page.evaluate(
      async ({ style, center, zoom }) => {
        await new Promise<void>((resolve, reject) => {
          const map = new window.maplibregl.Map({
            container: "map",
            style,
            center,
            zoom,
            attributionControl: false,
            interactive: false,
          });

          const timeout = window.setTimeout(() => {
            reject(new Error("Timed out waiting for map render"));
          }, 12_000);

          map.once("error", (event) => {
            window.clearTimeout(timeout);
            reject(event.error ?? new Error("Map render failed"));
          });

          map.once("idle", () => {
            window.clearTimeout(timeout);
            resolve();
          });
        });
      },
      {
        style: normalizedStyle,
        center: request.center,
        zoom: request.zoom,
      },
    );

    return await page.screenshot({ type: "png" });
  } finally {
    await page.close();
  }
}

export function normalizeStyleUrls(
  value: unknown,
  apiBaseUrl: string,
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeStyleUrls(item, apiBaseUrl));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        normalizeStyleUrls(item, apiBaseUrl),
      ]),
    );
  }

  if (typeof value === "string" && value.startsWith("/")) {
    return `${apiBaseUrl}${value}`;
  }

  return value;
}

export function forwardedAuthHeaders(headers: Headers) {
  const forwarded: Record<string, string> = {};
  for (const name of ["x-api-key", "authorization", "cookie"]) {
    const value = headers.get(name);
    if (value) forwarded[name] = value;
  }
  return forwarded;
}

export function headersForRouteRequest(
  requestUrl: string,
  requestHeaders: Record<string, string>,
  forwardedHeaders: Record<string, string>,
  apiOrigin: string,
) {
  if (new URL(requestUrl).origin !== apiOrigin) return requestHeaders;
  return {
    ...requestHeaders,
    ...forwardedHeaders,
  };
}

async function fetchStyle(request: RenderRequest) {
  const url = `${request.apiBaseUrl}/styles/v1/${encodeURIComponent(request.owner)}/${encodeURIComponent(request.style)}`;
  const response = await fetch(url, {
    headers: request.forwardedHeaders,
  });

  if (!response.ok) {
    throw new Error(`Style fetch failed with ${response.status}`);
  }

  return response.json() as Promise<unknown>;
}

async function getBrowser() {
  browserPromise ??= chromium.launch({
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  return browserPromise;
}

async function getMapLibreAssets() {
  assetsPromise ??= Promise.all([
    readFile(require.resolve("maplibre-gl/dist/maplibre-gl.js"), "utf8"),
    readFile(require.resolve("maplibre-gl/dist/maplibre-gl.css"), "utf8"),
  ]).then(([js, css]) => ({ js, css }));
  return assetsPromise;
}

function renderHtml({ js, css }: { js: string; css: string }) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>${css}</style>
  <style>
    html, body, #map {
      width: 100%;
      height: 100%;
      margin: 0;
      padding: 0;
      overflow: hidden;
      background: transparent;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>${js}</script>
</body>
</html>`;
}

declare global {
  interface Window {
    maplibregl: {
      Map: new (options: {
        container: string;
        style: unknown;
        center: [number, number];
        zoom: number;
        attributionControl: boolean;
        interactive: boolean;
      }) => {
        once: (
          event: "idle" | "error",
          handler: (event: { error?: Error }) => void,
        ) => void;
      };
    };
  }
}
