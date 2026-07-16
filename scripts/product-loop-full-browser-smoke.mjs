#!/usr/bin/env node
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  chromium,
  consoleApi,
  expectBrowserFetch,
  expectText,
  poll,
  renderMapLibreStyle,
  root,
  run,
  signIn,
  waitForHttp,
  waitForJson,
} from "./browser-smoke-lib.mjs";

const consoleUrl =
  process.env.PLANISFY_E2E_CONSOLE_URL ?? "http://localhost:3001";
const apiUrl = process.env.PLANISFY_E2E_API_URL ?? "http://localhost:4000";
const email = process.env.PLANISFY_SEED_EMAIL ?? "demo@planisfy.localhost";
const password = process.env.PLANISFY_SEED_PASSWORD ?? "Planisfy-demo-12345";
const seedBeforeRun = process.env.PLANISFY_E2E_SKIP_SEED !== "true";
const suffix =
  process.env.PLANISFY_E2E_RESOURCE_SUFFIX ??
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const tilesetHandle = `smoke-tileset-${suffix}`.slice(0, 64);
const styleHandle = `smoke-style-${suffix}`.slice(0, 64);
const failureScreenshotPath = resolve(
  root,
  "dogfood-output/screenshots/product-loop-full-browser-smoke-failure.png",
);
const renderScreenshotPath = resolve(
  root,
  "dogfood-output/screenshots/product-loop-full-browser-smoke-map.png",
);

if (seedBeforeRun) {
  await run("pnpm", ["dev:seed"]);
  await run("scripts/self-host-setup.sh", []);
}

await waitForJson(`${apiUrl}/health`, "API health");
await waitForHttp(consoleUrl, "Console");

const browser = await chromium.launch({
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({
  viewport: { width: 1280, height: 900 },
});
const errors = [];

page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

try {
  await signIn(page, { consoleUrl, email, password });
  await cleanupSmokeResources(page);
  await page.getByRole("heading", { name: "Dashboard" }).waitFor({
    state: "visible",
    timeout: 20_000,
  });

  await uploadTilesetThroughUi(page);
  const readyTileset = await waitForTilesetReady(page, tilesetHandle);
  await publishTilesetThroughUi(page, readyTileset);
  const publishedTileset = await waitForTilesetPublished(page, tilesetHandle);

  if (!publishedTileset.tilejsonUrl) {
    throw new Error("Published tileset did not expose a TileJSON URL");
  }
  const tilejsonUrl = publicApiUrl(publishedTileset.tilejsonUrl);
  await expectBrowserFetch(
    page,
    tilejsonUrl,
    "Full loop TileJSON URL",
  );

  const publicStyleUrl = await createAndPublishStyle(page, {
    ...publishedTileset,
    tilejsonUrl,
  });
  await expectBrowserFetch(page, publicStyleUrl, "Full loop public style URL");
  const bytes = await renderMapLibreStyle(page, {
    styleUrl: publicStyleUrl,
    outputPath: renderScreenshotPath,
    center: [9.1829, 48.7758],
    zoom: 12,
  });

  await gotoProtectedPage(page, "/integration");
  await expectText(page, "Public style URL");
  await expectText(page, "TileJSON URL");

  if (errors.length > 0) {
    throw new Error(`Browser reported errors: ${errors.join("; ")}`);
  }

  console.log("Full product-loop browser smoke passed");
  console.log(`console=${consoleUrl}`);
  console.log(`api=${apiUrl}`);
  console.log(`tileset=${tilesetHandle}`);
  console.log(`style=${styleHandle}`);
  console.log(`styleUrl=${publicStyleUrl}`);
  console.log(`renderBytes=${bytes}`);
} catch (error) {
  await mkdir(dirname(failureScreenshotPath), { recursive: true });
  await page.screenshot({ path: failureScreenshotPath, fullPage: true });
  throw new Error(
    `${error instanceof Error ? error.message : String(error)}; url=${page.url()}; screenshot=${failureScreenshotPath}`,
  );
} finally {
  await page.close();
  await browser.close();
}

async function uploadTilesetThroughUi(page) {
  await gotoProtectedPage(page, "/tilesets");
  await page.getByTestId("create-tileset").click();
  await page.getByLabel("Name", { exact: true }).fill(`Smoke Tileset ${suffix}`);
  await page.getByLabel("Handle", { exact: true }).fill(tilesetHandle);
  await page.getByLabel("Description").fill("Browser smoke upload.");
  const [createResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/api/v1/console/tilesets") &&
        response.request().method() === "POST",
      { timeout: 20_000 },
    ),
    page.getByTestId("create-tileset-submit").click(),
  ]);
  if (!createResponse.ok()) {
    throw new Error(
      `Create tileset failed with ${createResponse.status()}: ${await createResponse.text()}`,
    );
  }
  const createdTileset = await poll(
    `tileset ${tilesetHandle} to be created`,
    async () => {
      const tileset = await findTileset(page, tilesetHandle);
      return tileset ?? null;
    },
    { timeoutMs: 20_000, intervalMs: 1_000 },
  );
  await page.goto(`${consoleUrl}/tilesets/${createdTileset.id}`, {
    waitUntil: "domcontentloaded",
  });
  await expectText(page, "Upload source");

  await page.getByTestId("upload-tileset").click();
  await page.locator("#tileset-upload-file").setInputFiles({
    name: `${tilesetHandle}.geojson`,
    mimeType: "application/geo+json",
    buffer: Buffer.from(JSON.stringify(smokeGeoJson())),
  });
  const uploadSubmit = page.getByTestId("upload-tileset-submit");
  await poll(
    "tileset upload submit button to become enabled",
    async () => ((await uploadSubmit.isEnabled().catch(() => false)) ? true : null),
    { timeoutMs: 20_000, intervalMs: 500 },
  );
  await uploadSubmit.click();
  await poll(
    `tileset upload ${tilesetHandle} to be queued`,
    async () => {
      const tileset = await findTileset(page, tilesetHandle);
      return tileset?.latestUpload ? true : null;
    },
    { timeoutMs: 30_000, intervalMs: 1_000 },
  );
}

async function publishTilesetThroughUi(page, tileset) {
  await gotoProtectedPage(page, "/tilesets");
  const publishButton = page.getByTestId(
    `publish-tileset-version-${tileset.handle}`,
  );
  await poll(
    `publish button for ${tileset.handle}`,
    async () => {
      if (!(await publishButton.isVisible().catch(() => false))) return false;
      return (await publishButton.isEnabled()) ? true : false;
    },
    { timeoutMs: 60_000, intervalMs: 1_000 },
  );
  await publishButton.click();
}

async function waitForTilesetReady(page, handle) {
  return poll(
    `tileset ${handle} to finish processing`,
    async () => {
      const tileset = await findTileset(page, handle);
      if (!tileset) return null;
      if (tileset.status === "ERROR") {
        throw new Error(
          `Tileset failed: ${JSON.stringify(tileset.latestUpload)}`,
        );
      }
      if (
        tileset.status === "READY" &&
        tileset.latestVersion?.artifact?.availability?.ok
      ) {
        return tileset;
      }
      return null;
    },
    { timeoutMs: 180_000, intervalMs: 3_000 },
  );
}

async function waitForTilesetPublished(page, handle) {
  return poll(
    `tileset ${handle} to publish`,
    async () => {
      const tileset = await findTileset(page, handle);
      return tileset?.isPublished && tileset.tilejsonUrl ? tileset : null;
    },
    { timeoutMs: 90_000, intervalMs: 2_000 },
  );
}

async function findTileset(page, handle) {
  const response = await consoleApi(page, "/tilesets");
  return response.data.find((tileset) => tileset.handle === handle) ?? null;
}

async function gotoProtectedPage(page, path) {
  await page.goto(`${consoleUrl}${path}`, { waitUntil: "domcontentloaded" });
  if (new URL(page.url()).pathname !== "/sign-in") return;

  await signIn(page, { consoleUrl, email, password });
  await page.goto(`${consoleUrl}${path}`, { waitUntil: "domcontentloaded" });
  if (new URL(page.url()).pathname === "/sign-in") {
    throw new Error(`Authentication redirect loop while opening ${path}`);
  }
}

async function cleanupSmokeResources(page) {
  const [tilesetsResponse, stylesResponse] = await Promise.all([
    consoleApi(page, "/tilesets"),
    consoleApi(page, "/styles"),
  ]);

  await Promise.all(
    tilesetsResponse.data
      .filter((tileset) => tileset.handle?.startsWith("smoke-tileset-"))
      .map((tileset) =>
        consoleApi(page, `/tilesets/${tileset.id}`, { method: "DELETE" }),
      ),
  );
  await Promise.all(
    stylesResponse.data
      .filter((style) => style.handle?.startsWith("smoke-style-"))
      .map((style) =>
        consoleApi(page, `/styles/${style.id}`, { method: "DELETE" }),
      ),
  );
}

async function createAndPublishStyle(page, tileset) {
  const profile = (await consoleApi(page, "/profile")).data;
  const sourceId = "smoke-upload";
  const styleJson = {
    version: 8,
    name: `Smoke Style ${suffix}`,
    center: [9.1829, 48.7758],
    zoom: 12,
    sources: {
      [sourceId]: {
        type: "vector",
        url: tileset.tilejsonUrl,
      },
    },
    layers: [
      {
        id: "smoke-points",
        type: "circle",
        source: sourceId,
        "source-layer": "data",
        paint: {
          "circle-radius": 7,
          "circle-color": "#0f766e",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        },
      },
    ],
  };

  const created = await consoleApi(page, "/styles", {
    method: "POST",
    body: {
      name: `Smoke Style ${suffix}`,
      handle: styleHandle,
      description: "Browser smoke style.",
      styleJson,
    },
  });
  const published = await consoleApi(
    page,
    `/styles/${created.data.id}/publish`,
    {
      method: "POST",
    },
  );
  if (!published.data.isPublic) {
    throw new Error("Published style response did not mark the style public");
  }

  return `${apiUrl}/styles/v1/${encodeURIComponent(profile.handle)}/${encodeURIComponent(published.data.handle)}`;
}

function publicApiUrl(pathOrUrl) {
  if (/^https?:\/\//.test(pathOrUrl)) return pathOrUrl;
  return `${apiUrl}${pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`}`;
}

function smokeGeoJson() {
  return {
    type: "FeatureCollection",
    features: [
      point("Depot", [9.179, 48.776]),
      point("Hub", [9.189, 48.782]),
      point("Station", [9.171, 48.771]),
    ],
  };
}

function point(name, coordinates) {
  return {
    type: "Feature",
    properties: { name },
    geometry: { type: "Point", coordinates },
  };
}
