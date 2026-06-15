#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const staticRendererRequire = createRequire(
  resolve(root, "apps/static-renderer/package.json"),
);
const { chromium } = staticRendererRequire("playwright");

const consoleUrl =
  process.env.PLANISFY_E2E_CONSOLE_URL ?? "http://localhost:3001";
const apiUrl = process.env.PLANISFY_E2E_API_URL ?? "http://localhost:4000";
const email = process.env.PLANISFY_SEED_EMAIL ?? "demo@planisfy.localhost";
const password = process.env.PLANISFY_SEED_PASSWORD ?? "Planisfy-demo-12345";
const seedBeforeRun = process.env.PLANISFY_E2E_SKIP_SEED !== "true";
const failureScreenshotPath = resolve(
  root,
  "dogfood-output/screenshots/product-loop-browser-smoke-failure.png",
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
  await page.goto(`${consoleUrl}/sign-in`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await Promise.all([
    page.waitForURL((url) => url.pathname !== "/sign-in", {
      timeout: 20_000,
    }),
    page.getByRole("button", { name: /sign in/i }).click(),
  ]);

  await expectText("Dashboard");
  await expectText("Planisfy Demo");
  await expectText("Stuttgart Demo Style");
  await expectText("Stuttgart Base");

  await page.goto(`${consoleUrl}/styles`, { waitUntil: "domcontentloaded" });
  await expectText("Stuttgart Demo Style");
  await expectText("Public");

  await page.goto(`${consoleUrl}/tilesets`, { waitUntil: "domcontentloaded" });
  await expectText("Stuttgart Base");
  await expectText("PUBLISHED");

  await page.goto(`${consoleUrl}/integration`, { waitUntil: "domcontentloaded" });
  await expectText("API base URL");
  await expectText("Public style URL");
  await expectText("TileJSON URL");

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

async function expectText(text) {
  await page.getByText(text, { exact: false }).first().waitFor({
    state: "visible",
    timeout: 20_000,
  });
}

async function waitForJson(url, label) {
  await waitForHttp(url, label, async (response) => {
    await response.json();
  });
}

async function waitForHttp(url, label, validate = async () => {}) {
  let lastError;
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        await validate(response);
        return;
      }
      lastError = new Error(`${label} returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 1000));
  }
  throw lastError ?? new Error(`${label} did not become reachable`);
}

async function run(command, args) {
  await new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: root,
      env: process.env,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.on("error", rejectRun);
    child.on("exit", (code) => {
      if (code === 0) resolveRun();
      else rejectRun(new Error(`${command} ${args.join(" ")} exited ${code}`));
    });
  });
}
