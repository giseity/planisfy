#!/usr/bin/env node
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const staticRendererRequire = createRequire(
  resolve(root, "apps/static-renderer/package.json"),
);
const { chromium } = staticRendererRequire("playwright");

const stylePath = resolve(
  root,
  process.env.PLANISFY_BROWSER_SMOKE_STYLE ??
    "packages/map-styles/styles/planisfy-streets-v1.json",
);
const outputPath = resolve(
  root,
  process.env.PLANISFY_BROWSER_SMOKE_SCREENSHOT ??
    "dogfood-output/screenshots/default-map-browser-smoke.png",
);
const center = parsePair(
  process.env.PLANISFY_BROWSER_SMOKE_CENTER ?? "9.1829,48.7758",
);
const zoom = Number(process.env.PLANISFY_BROWSER_SMOKE_ZOOM ?? "13");
const width = Number(process.env.PLANISFY_BROWSER_SMOKE_WIDTH ?? "960");
const height = Number(process.env.PLANISFY_BROWSER_SMOKE_HEIGHT ?? "640");

const [maplibreJs, maplibreCss, rawStyle] = await Promise.all([
  readFile(
    staticRendererRequire.resolve("maplibre-gl/dist/maplibre-gl.js"),
    "utf8",
  ),
  readFile(
    staticRendererRequire.resolve("maplibre-gl/dist/maplibre-gl.css"),
    "utf8",
  ),
  readFile(stylePath, "utf8"),
]);

const style = JSON.parse(rawStyle);
const browser = await chromium.launch({
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({
  viewport: { width, height },
  deviceScaleFactor: 1,
});
const errors = [];

page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

try {
  await page.setContent(renderHtml({ js: maplibreJs, css: maplibreCss }), {
    waitUntil: "domcontentloaded",
  });

  await page.evaluate(
    async ({ style, center, zoom }) => {
      await new Promise((resolve, reject) => {
        const map = new window.maplibregl.Map({
          container: "map",
          style,
          center,
          zoom,
          attributionControl: false,
          interactive: false,
        });

        const timeout = window.setTimeout(() => {
          reject(new Error("Timed out waiting for MapLibre idle"));
        }, 15_000);

        map.once("error", (event) => {
          window.clearTimeout(timeout);
          reject(event.error ?? new Error("MapLibre emitted an error"));
        });

        map.once("idle", () => {
          window.clearTimeout(timeout);
          resolve();
        });
      });
    },
    { style, center, zoom },
  );

  if (errors.length > 0) {
    throw new Error(`Browser reported errors: ${errors.join("; ")}`);
  }

  const screenshot = await page.screenshot({ type: "png" });
  if (screenshot.byteLength < 10_000) {
    throw new Error(
      `Browser screenshot was unexpectedly small: ${screenshot.byteLength} bytes`,
    );
  }

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, screenshot);
  console.log("Default map browser smoke passed");
  console.log(`style=${stylePath}`);
  console.log(`screenshot=${outputPath}`);
  console.log(`bytes=${screenshot.byteLength}`);
} finally {
  await page.close();
  await browser.close();
}

function parsePair(value) {
  const parts = value.split(",").map(Number);
  if (parts.length !== 2 || parts.some((part) => !Number.isFinite(part))) {
    throw new Error(`Expected lon,lat pair but received '${value}'`);
  }
  return parts;
}

function renderHtml({ js, css }) {
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
