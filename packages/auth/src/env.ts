import { getRuntimeSecret } from "@planisfy/env";

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function authUrlFromAppUrl(value: string | undefined) {
  return value ? `${trimTrailingSlash(value)}/api/auth` : undefined;
}

export function getAuthSecret() {
  return getRuntimeSecret("BETTER_AUTH_SECRET");
}

export function getAuthBaseURL() {
  const authOrigin = process.env.NEXT_PUBLIC_AUTH_ORIGIN;
  if (!authOrigin) {
    throw new Error("NEXT_PUBLIC_AUTH_ORIGIN is required.");
  }
  return authUrlFromAppUrl(authOrigin)!;
}
