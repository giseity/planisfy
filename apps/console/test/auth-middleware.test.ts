import { afterEach, describe, expect, it } from "vitest";
import {
  buildSignInRedirectURL,
  getConsoleAuthOrigin,
  getSessionBaseURL,
} from "../middleware";

const AUTH_ENV_KEYS = [
  "BETTER_AUTH_URL",
  "BETTER_AUTH_BASE_URL",
  "NEXT_PUBLIC_AUTH_ORIGIN",
  "NEXT_PUBLIC_APP_URL",
] as const;

const originalEnv = Object.fromEntries(
  AUTH_ENV_KEYS.map((key) => [key, process.env[key]]),
);

afterEach(() => {
  for (const key of AUTH_ENV_KEYS) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("Console auth middleware helpers", () => {
  it("prefers Better Auth base URLs and normalizes /api/auth suffixes", () => {
    process.env.BETTER_AUTH_URL = "https://console.planisfy.localhost/api/auth";
    process.env.NEXT_PUBLIC_AUTH_ORIGIN = "https://planisfy.localhost";

    expect(getConsoleAuthOrigin("https://console.planisfy.localhost")).toBe(
      "https://console.planisfy.localhost",
    );
    expect(getSessionBaseURL("https://console.planisfy.localhost")).toBe(
      "https://console.planisfy.localhost",
    );
  });

  it("uses public auth origin for sign-in redirects when configured", () => {
    process.env.NEXT_PUBLIC_AUTH_ORIGIN = "https://planisfy.localhost";

    const redirect = buildSignInRedirectURL(
      "https://console.planisfy.localhost/styles",
      "https://console.planisfy.localhost",
    );

    expect(redirect.toString()).toBe(
      "https://planisfy.localhost/sign-in?callbackUrl=https%3A%2F%2Fconsole.planisfy.localhost%2Fstyles",
    );
  });

  it("falls back to the current request origin for local self-host installs", () => {
    expect(getConsoleAuthOrigin("https://console.planisfy.localhost")).toBe(
      "https://console.planisfy.localhost",
    );
  });
});
