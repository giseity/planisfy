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
  const authFailures = [];
  const responseListener = async (response) => {
    const url = response.url();
    if (!url.includes("/api/auth/") || response.ok()) return;

    let body = "";
    try {
      body = (await response.text()).slice(0, 500);
    } catch {
      body = "<unreadable response body>";
    }
    authFailures.push(`${response.status()} ${url}: ${body}`);
  };

  page.on("response", responseListener);
  await page.goto(`${consoleUrl}/sign-in`, { waitUntil: "domcontentloaded" });
  try {
    const emailInput = page.locator("input#email");
    const passwordInput = page.locator("input#password");
    await emailInput.fill(email);
    await passwordInput.fill(password);
    if ((await emailInput.inputValue()) !== email) {
      throw new Error("Sign-in email field did not retain the smoke user");
    }
    if ((await passwordInput.inputValue()) !== password) {
      throw new Error("Sign-in password field did not retain the smoke password");
    }
    const [signInResponse] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes("/api/auth/sign-in/email") &&
          response.request().method() === "POST",
        { timeout: 20_000 },
      ),
      page.getByRole("button", { name: /sign in|login/i }).click(),
    ]);
    if (!signInResponse.ok()) {
      throw new Error(
        `Sign-in request failed with ${signInResponse.status()}: ${await signInResponse.text()}`,
      );
    }
    await waitForBrowserSession(page);
    await waitForProtectedConsoleEntry(page, consoleUrl);
  } catch (error) {
    const notices = await page
      .locator('[data-sonner-toast], [role="alert"], [role="status"]')
      .allTextContents()
      .catch(() => []);
    const details = [
      error instanceof Error ? error.message : String(error),
      authFailures.length > 0
        ? `auth failures: ${authFailures.join(" | ")}`
        : null,
      notices.length > 0 ? `visible notices: ${notices.join(" | ")}` : null,
    ].filter(Boolean);
    throw new Error(details.join("; "));
  } finally {
    page.off("response", responseListener);
  }
}

async function waitForProtectedConsoleEntry(page, consoleUrl) {
  let lastSession = "";
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    await page.goto(consoleUrl, { waitUntil: "domcontentloaded" });
    if (new URL(page.url()).pathname !== "/sign-in") return;
    lastSession = await page
      .evaluate(async () => {
        const response = await fetch("/api/auth/get-session", {
          credentials: "include",
        });
        return `${response.status} ${(await response.text()).slice(0, 300)}`;
      })
      .catch((error) =>
        error instanceof Error ? error.message : String(error),
      );
    await delay(500);
  }
  throw new Error(
    `Sign-in completed but Console route protection rejected the session; get-session=${lastSession}`,
  );
}

async function waitForBrowserSession(page) {
  let lastStatus = 0;
  let lastText = "";
  for (let attempt = 1; attempt <= 40; attempt += 1) {
    const result = await page
      .evaluate(async () => {
        const response = await fetch("/api/auth/get-session", {
          credentials: "include",
        });
        const text = await response.text();
        let hasSession = false;
        try {
          const json = JSON.parse(text);
          hasSession = Boolean(json?.session?.token);
        } catch {
          hasSession = false;
        }
        return {
          ok: response.ok,
          status: response.status,
          hasSession,
          text,
        };
      })
      .catch((error) => ({
        ok: false,
        status: 0,
        hasSession: false,
        text: error instanceof Error ? error.message : String(error),
      }));
    lastStatus = result.status;
    lastText = result.text;
    if (result.ok && result.hasSession) return;
    await delay(500);
  }
  throw new Error(
    `Session did not become visible after sign-in (${lastStatus}): ${lastText.slice(0, 500)}`,
  );
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

  const renderResult = await page.evaluate(
    async ({ styleUrl, center, zoom, timeoutMs }) => {
      return await new Promise((resolve, reject) => {
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
          resolve({
            renderedFeatureCount: map.queryRenderedFeatures().length,
          });
        });
      });
    },
    { styleUrl, center, zoom, timeoutMs },
  );

  if (renderResult.renderedFeatureCount < 1) {
    throw new Error("MapLibre rendered no visible features");
  }

  const screenshot = await page.screenshot({ type: "png" });
  if (screenshot.byteLength < 1_000) {
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
