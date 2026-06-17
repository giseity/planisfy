import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const staticRendererRequire = createRequire(
  resolve(root, "apps/static-renderer/package.json"),
);

export const { chromium } = staticRendererRequire("playwright");

export async function run(command, args, options = {}) {
  await new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: root,
      env: process.env,
      stdio: "inherit",
      shell: process.platform === "win32",
      ...options,
    });
    child.on("error", rejectRun);
    child.on("exit", (code) => {
      if (code === 0) resolveRun();
      else rejectRun(new Error(`${command} ${args.join(" ")} exited ${code}`));
    });
  });
}

export async function waitForJson(url, label) {
  await waitForHttp(url, label, async (response) => {
    await response.json();
  });
}

export async function waitForHttp(url, label, validate = async () => {}) {
  let lastError;
  for (let attempt = 1; attempt <= 90; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        await validate(response);
        return response;
      }
      lastError = new Error(`${label} returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(1000);
  }
  throw lastError ?? new Error(`${label} did not become reachable`);
}

export async function signIn(page, { consoleUrl, email, password }) {
  await page.goto(`${consoleUrl}/sign-in`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await Promise.all([
    page.waitForURL((url) => url.pathname !== "/sign-in", {
      timeout: 20_000,
    }),
    page.getByRole("button", { name: /sign in/i }).click(),
  ]);
}

export async function expectText(page, text, options = {}) {
  await page
    .getByText(text, { exact: false })
    .first()
    .waitFor({
      state: "visible",
      timeout: options.timeout ?? 20_000,
    });
}

export async function expectBrowserFetch(page, url, label) {
  const result = await page.evaluate(async (targetUrl) => {
    try {
      const response = await fetch(targetUrl);
      return {
        ok: response.ok,
        status: response.status,
        contentType: response.headers.get("content-type"),
        text: response.ok ? "" : await response.text(),
      };
    } catch (error) {
      return {
        ok: false,
        status: 0,
        contentType: null,
        text: error instanceof Error ? error.message : String(error),
      };
    }
  }, url);

  if (!result.ok) {
    throw new Error(
      `${label} fetch failed with ${result.status}: ${result.text}`,
    );
  }
  return result;
}

export async function renderMapLibreStyle(
  page,
  {
    styleUrl,
    outputPath,
    center = [9.1829, 48.7758],
    zoom = 13,
    timeoutMs = 20_000,
  },
) {
  const [maplibreJs, maplibreCss] = await Promise.all([
    readFile(
      staticRendererRequire.resolve("maplibre-gl/dist/maplibre-gl.js"),
      "utf8",
    ),
    readFile(
      staticRendererRequire.resolve("maplibre-gl/dist/maplibre-gl.css"),
      "utf8",
    ),
  ]);

  await page.setContent(renderMapHtml({ js: maplibreJs, css: maplibreCss }), {
    waitUntil: "domcontentloaded",
  });

  await page.evaluate(
    async ({ styleUrl, center, zoom, timeoutMs }) => {
      await new Promise((resolve, reject) => {
        const map = new window.maplibregl.Map({
          container: "map",
          style: styleUrl,
          center,
          zoom,
          attributionControl: false,
          interactive: false,
        });

        const timeout = window.setTimeout(() => {
          reject(new Error("Timed out waiting for MapLibre idle"));
        }, timeoutMs);

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
    { styleUrl, center, zoom, timeoutMs },
  );

  const screenshot = await page.screenshot({ type: "png" });
  if (screenshot.byteLength < 10_000) {
    throw new Error(
      `MapLibre screenshot was unexpectedly small: ${screenshot.byteLength} bytes`,
    );
  }

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, screenshot);
  return screenshot.byteLength;
}

export async function consoleApi(page, path, options = {}) {
  const apiPath =
    process.env.PLANISFY_E2E_CONSOLE_API_PATH ?? "/api/v1/console";
  const result = await page.evaluate(
    async ({ apiPath, path, options }) => {
      const response = await fetch(`${apiPath}${path}`, {
        method: options.method ?? "GET",
        headers: options.body
          ? { "Content-Type": "application/json" }
          : undefined,
        body: options.body ? JSON.stringify(options.body) : undefined,
        credentials: "include",
      });
      const json = await response.json();
      return { ok: response.ok, status: response.status, json };
    },
    { apiPath, path, options },
  );

  if (!result.ok) {
    throw new Error(
      `Console API ${path} failed with ${result.status}: ${
        result.json?.error?.message ?? JSON.stringify(result.json)
      }`,
    );
  }
  return result.json;
}

export async function poll(label, fn, options = {}) {
  const timeoutMs = options.timeoutMs ?? 120_000;
  const intervalMs = options.intervalMs ?? 2_000;
  const started = Date.now();
  let lastError;

  while (Date.now() - started < timeoutMs) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await delay(intervalMs);
  }

  throw lastError ?? new Error(`Timed out waiting for ${label}`);
}

export function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

function renderMapHtml({ js, css }) {
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
