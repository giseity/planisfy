#!/usr/bin/env node
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  chromium,
  expectBrowserFetch,
  expectText,
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
const allowMissingTileset =
  process.env.PLANISFY_E2E_ALLOW_MISSING_TILESET === "true";
const failureScreenshotPath = resolve(
  root,
  "dogfood-output/screenshots/product-loop-browser-smoke-failure.png",
);
const renderScreenshotPath = resolve(
  root,
  "dogfood-output/screenshots/product-loop-browser-smoke-map.png",
);

if (seedBeforeRun) {
  await run("pnpm", ["dev:seed"]);
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

  await expectText(page, "Dashboard");
  await expectText(page, "Planisfy Demo");
  await expectText(page, "Stuttgart Demo Style");
  await expectText(page, "Stuttgart Base");

  await page.goto(`${consoleUrl}/styles`, { waitUntil: "domcontentloaded" });
  await expectText(page, "Stuttgart Demo Style");
  await expectText(page, "Public");

  await page.goto(`${consoleUrl}/tilesets`, { waitUntil: "domcontentloaded" });
  await expectText(page, "Stuttgart Base");

  const hasPublishedTileset = await page
    .getByText("PUBLISHED", { exact: false })
    .first()
    .isVisible()
    .catch(() => false);
  if (!hasPublishedTileset && !allowMissingTileset) {
    throw new Error(
      "Seeded tileset is not published. Add infra/docker/data/pmtiles/stuttgart.pmtiles or set PLANISFY_E2E_ALLOW_MISSING_TILESET=true.",
    );
  }

  await page.goto(`${consoleUrl}/integration`, {
    waitUntil: "domcontentloaded",
  });
  await expectText(page, "API base URL");
  await expectText(page, "Public style URL");

  const publicStyleUrl = await readOptionalTestId(
    page,
    "style-public-url-value",
  );
  if (!publicStyleUrl) {
    throw new Error("Integration page did not expose a public style URL");
  }
  await expectBrowserFetch(page, publicStyleUrl, "Public style URL");

  const tilejsonUrl = await readOptionalTestId(page, "tilejson-url-value");
  if (tilejsonUrl) {
    await expectBrowserFetch(page, tilejsonUrl, "TileJSON URL");
    const bytes = await renderMapLibreStyle(page, {
      styleUrl: publicStyleUrl,
      outputPath: renderScreenshotPath,
    });
    console.log(`Rendered seeded public style screenshot bytes=${bytes}`);
  } else if (allowMissingTileset) {
    console.warn(
      "Skipping TileJSON and MapLibre render checks because no published seeded tileset is available.",
    );
  } else {
    throw new Error("Integration page did not expose a TileJSON URL");
  }

  if (errors.length > 0) {
    throw new Error(`Browser reported errors: ${errors.join("; ")}`);
  }

  console.log("Product-loop browser smoke passed");
  console.log(`console=${consoleUrl}`);
  console.log(`api=${apiUrl}`);
  console.log(`user=${email}`);
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

async function readOptionalTestId(page, testId) {
  const locator = page.getByTestId(testId);
  if (!(await locator.isVisible().catch(() => false))) return null;
  const value = await locator.textContent();
  return value?.trim() || null;
}
