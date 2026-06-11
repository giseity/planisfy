import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const AUTH_ENV_KEYS = [
  "NEXT_PUBLIC_AUTH_ORIGIN",
  "NEXT_PUBLIC_APP_URL",
] as const;

const originalEnv = Object.fromEntries(
  AUTH_ENV_KEYS.map((key) => [key, process.env[key]]),
);

beforeEach(() => {
  vi.resetModules();
  for (const key of AUTH_ENV_KEYS) {
    delete process.env[key];
  }
});

afterEach(() => {
  vi.resetModules();
  for (const key of AUTH_ENV_KEYS) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

async function loadMiddleware() {
  return import("../middleware");
}

describe("Console auth middleware helpers", () => {
  it("uses public auth origin for sign-in redirects when configured", async () => {
    process.env.NEXT_PUBLIC_AUTH_ORIGIN = "https://planisfy.localhost";
    process.env.NEXT_PUBLIC_APP_URL = "https://console.planisfy.localhost";

    const { buildSignInRedirectURL } = await loadMiddleware();
    const redirect = buildSignInRedirectURL(
      "https://console.planisfy.localhost/styles",
      "https://console.planisfy.localhost",
    );

    expect(redirect.toString()).toBe(
      "https://planisfy.localhost/sign-in?callbackUrl=https%3A%2F%2Fconsole.planisfy.localhost%2Fstyles",
    );
  });

  it("uses the public app URL as the canonical callback origin", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://console.planisfy.localhost";

    const { buildSignInRedirectURL, getConsoleAppOrigin } =
      await loadMiddleware();

    expect(getConsoleAppOrigin("https://localhost:4404")).toBe(
      "https://console.planisfy.localhost",
    );

    const redirect = buildSignInRedirectURL(
      "https://localhost:4404/platform?tab=checks#summary",
      "https://localhost:4404",
    );

    expect(redirect.toString()).toBe(
      "https://console.planisfy.localhost/sign-in?callbackUrl=https%3A%2F%2Fconsole.planisfy.localhost%2Fplatform%3Ftab%3Dchecks%23summary",
    );
  });

  it("defaults to the canonical console origin", async () => {
    const { getConsoleAuthOrigin, getSessionBaseURL } = await loadMiddleware();

    expect(getConsoleAuthOrigin("https://localhost:4404")).toBe(
      "https://console.planisfy.localhost",
    );
    expect(getSessionBaseURL("https://localhost:4404")).toBe(
      "https://console.planisfy.localhost",
    );
  });
});
