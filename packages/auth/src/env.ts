import { getRuntimeSecret } from "@planisfy/env";

const BUILD_ONLY_AUTH_SECRET =
  "planisfy-build-only-auth-secret-not-used-at-runtime";
const DEV_AUTH_SECRET = "planisfy-local-dev-auth-secret-change-me";

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function authUrlFromAppUrl(value: string | undefined) {
  return value ? `${trimTrailingSlash(value)}/api/auth` : undefined;
}

export function getAuthSecret() {
  return getRuntimeSecret("BETTER_AUTH_SECRET", {
    buildPlaceholder: BUILD_ONLY_AUTH_SECRET,
    developmentFallback: DEV_AUTH_SECRET,
  });
}

export function getAuthBaseURL() {
  return (
    process.env.BETTER_AUTH_URL ||
    process.env.BETTER_AUTH_BASE_URL ||
    authUrlFromAppUrl(process.env.NEXT_PUBLIC_APP_URL) ||
    authUrlFromAppUrl(process.env.CONSOLE_URL) ||
    "https://console.planisfy.localhost/api/auth"
  );
}
