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

export function createDeadline(label, timeoutMs) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error(`${label} timeout must be a positive finite number`);
  }

  const expiresAt = Date.now() + timeoutMs;

  const deadline = {
    remainingMs() {
      return Math.max(0, expiresAt - Date.now());
    },
    throwIfExpired(phase = label) {
      if (deadline.remainingMs() === 0) {
        throw new Error(`${phase} exceeded its ${timeoutMs}ms deadline`);
      }
    },
    async run(phase, task) {
      deadline.throwIfExpired(phase);
      const controller = new AbortController();
      const remaining = deadline.remainingMs();
      let timer;
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error(
            `${phase} exceeded its ${timeoutMs}ms deadline`,
          );
          controller.abort(error);
          reject(error);
        }, remaining);
      });

      try {
        return await Promise.race([
          Promise.resolve().then(() => task(controller.signal, deadline)),
          timeout,
        ]);
      } finally {
        clearTimeout(timer);
      }
    },
    async delay(intervalMs, phase = `${label} retry delay`) {
      await deadline.run(phase, (signal) => abortableDelay(intervalMs, signal));
    },
  };

  return deadline;
}

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

export async function waitForJson(url, label, options = {}) {
  await waitForHttp(
    url,
    label,
    async (response) => {
      await response.json();
    },
    options,
  );
}

export async function waitForHttp(
  url,
  label,
  validate = async () => {},
  options = {},
) {
  const timeoutMs = options.timeoutMs ?? 90_000;
  const intervalMs = options.intervalMs ?? 1_000;
  const deadline = options.deadline ?? createDeadline(label, timeoutMs);
  let lastError;

  while (deadline.remainingMs() > 0) {
    try {
      return await deadline.run(`${label} request`, async (signal) => {
        const response = await fetch(url, {
          ...options.fetchOptions,
          signal,
        });
        if (!response.ok) {
          throw new Error(`${label} returned HTTP ${response.status}`);
        }
        await validate(response, signal);
        return response;
      });
    } catch (error) {
      lastError = error;
    }

    if (deadline.remainingMs() === 0) break;
    await deadline.delay(Math.min(intervalMs, deadline.remainingMs()));
  }

  throw new Error(`${label} did not become reachable before its deadline`, {
    cause: lastError,
  });
}

export async function signIn(page, { consoleUrl, email, password }) {
  const deadline = createDeadline("browser sign-in", 60_000);
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
      throw new Error(
        "Sign-in password field did not retain the smoke password",
      );
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
    await waitForBrowserSession(page, deadline);
    await waitForProtectedConsoleEntry(page, consoleUrl, deadline);
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

async function waitForProtectedConsoleEntry(page, consoleUrl, deadline) {
  let lastSession = "";
  while (deadline.remainingMs() > 0) {
    await page.goto(consoleUrl, {
      waitUntil: "domcontentloaded",
      timeout: deadline.remainingMs(),
    });
    if (new URL(page.url()).pathname !== "/sign-in") return;
    lastSession = await browserFetch(
      page,
      {
        url: "/api/auth/get-session",
        credentials: "include",
        readBody: true,
      },
      { deadline, label: "protected Console session probe" },
    )
      .then((response) => `${response.status} ${response.text.slice(0, 300)}`)
      .catch((error) =>
        error instanceof Error ? error.message : String(error),
      );
    if (deadline.remainingMs() > 0) {
      await deadline.delay(Math.min(500, deadline.remainingMs()));
    }
  }
  throw new Error(
    `Sign-in completed but Console route protection rejected the session; get-session=${lastSession}`,
  );
}

async function waitForBrowserSession(page, deadline) {
  let lastStatus = 0;
  let lastText = "";
  while (deadline.remainingMs() > 0) {
    const result = await browserFetch(
      page,
      {
        url: "/api/auth/get-session",
        credentials: "include",
        readBody: true,
      },
      { deadline, label: "browser session probe" },
    )
      .then((response) => {
        const text = response.text;
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
    if (deadline.remainingMs() > 0) {
      await deadline.delay(Math.min(500, deadline.remainingMs()));
    }
  }
  throw new Error(
    `Session did not become visible after sign-in (${lastStatus}): ${lastText.slice(0, 500)}`,
  );
}

export async function expectText(page, text, options = {}) {
  const timeout = options.timeout ?? 20_000;
  const deadline = Date.now() + timeout;
  const locator = page.getByText(text, { exact: false });
  let matchCount = 0;

  while (Date.now() < deadline) {
    matchCount = await locator.count().catch(() => 0);
    for (let index = 0; index < matchCount; index += 1) {
      if (
        await locator
          .nth(index)
          .isVisible()
          .catch(() => false)
      )
        return;
    }
    await delay(250);
  }

  throw new Error(
    `Timed out waiting for visible text "${text}" (${matchCount} matching element${matchCount === 1 ? "" : "s"})`,
  );
}

export async function browserFetch(page, request, options = {}) {
  const label = options.label ?? "browser fetch";
  const deadline =
    options.deadline ?? createDeadline(label, options.timeoutMs ?? 20_000);
  const browserTimeoutMs = Math.max(1, deadline.remainingMs() - 10);
  const result = await deadline.run(label, () =>
    page.evaluate(
      async ({ request, timeoutMs }) => {
        const controller = new AbortController();
        let timedOut = false;
        const timer = globalThis.setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, timeoutMs);

        try {
          const response = await fetch(request.url, {
            method: request.method ?? "GET",
            headers: request.headers,
            body: request.body,
            credentials: request.credentials,
            signal: controller.signal,
          });
          const shouldReadBody = request.readBody || !response.ok;
          return {
            ok: response.ok,
            status: response.status,
            contentType: response.headers.get("content-type"),
            text: shouldReadBody ? await response.text() : "",
          };
        } catch (error) {
          return {
            ok: false,
            status: 0,
            contentType: null,
            text: timedOut
              ? `request exceeded its ${timeoutMs}ms browser deadline`
              : error instanceof Error
                ? error.message
                : String(error),
          };
        } finally {
          globalThis.clearTimeout(timer);
        }
      },
      { request, timeoutMs: browserTimeoutMs },
    ),
  );

  return result;
}

export async function expectBrowserFetch(page, url, label, options = {}) {
  const result = await browserFetch(
    page,
    { url, readBody: false },
    { ...options, label },
  );

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
  const result = await browserFetch(
    page,
    {
      url: `${apiPath}${path}`,
      method: options.method,
      headers: options.body
        ? { "Content-Type": "application/json" }
        : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined,
      credentials: "include",
      readBody: true,
    },
    {
      deadline: options.deadline,
      label: `Console API ${path}`,
      timeoutMs: options.timeoutMs,
    },
  );
  if (result.status === 0) {
    throw new Error(`Console API ${path} fetch failed: ${result.text}`);
  }

  let json;
  try {
    json = JSON.parse(result.text);
  } catch {
    throw new Error(
      `Console API ${path} returned invalid JSON with ${result.status}`,
    );
  }

  if (!result.ok) {
    throw new Error(
      `Console API ${path} failed with ${result.status}: ${
        json?.error?.message ?? JSON.stringify(json)
      }`,
    );
  }
  return json;
}

export async function poll(label, fn, options = {}) {
  const timeoutMs = options.timeoutMs ?? 120_000;
  const intervalMs = options.intervalMs ?? 2_000;
  const deadline = options.deadline ?? createDeadline(label, timeoutMs);
  let lastError;

  while (deadline.remainingMs() > 0) {
    try {
      const value = await deadline.run(`${label} poll attempt`, (signal) =>
        fn({ deadline, signal }),
      );
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    if (deadline.remainingMs() > 0) {
      await deadline.delay(Math.min(intervalMs, deadline.remainingMs()));
    }
  }

  throw lastError ?? new Error(`Timed out waiting for ${label}`);
}

export function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

function abortableDelay(ms, signal) {
  return new Promise((resolveDelay, rejectDelay) => {
    const timer = setTimeout(resolveDelay, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        rejectDelay(signal.reason ?? new Error("Delay aborted"));
      },
      { once: true },
    );
  });
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
