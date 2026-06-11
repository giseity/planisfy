import { betterFetch } from "@better-fetch/fetch";
import type { Session } from "better-auth/types";
import { NextResponse, type NextRequest } from "next/server";

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function authOriginFromBaseUrl(value: string | undefined) {
  if (!value) return undefined;
  return trimTrailingSlash(value).replace(/\/api\/auth$/, "");
}

export function getConsoleAuthOrigin(requestOrigin: string) {
  return (
    authOriginFromBaseUrl(process.env.BETTER_AUTH_URL) ||
    authOriginFromBaseUrl(process.env.BETTER_AUTH_BASE_URL) ||
    process.env.NEXT_PUBLIC_AUTH_ORIGIN ||
    process.env.NEXT_PUBLIC_APP_URL ||
    requestOrigin
  );
}

export function getSessionBaseURL(requestOrigin: string) {
  return getConsoleAuthOrigin(requestOrigin);
}

export function buildSignInRedirectURL(requestUrl: string, requestOrigin: string) {
  const signInUrl = new URL("/sign-in", getConsoleAuthOrigin(requestOrigin));
  signInUrl.searchParams.set("callbackUrl", requestUrl);
  return signInUrl;
}

export default async function authMiddleware(request: NextRequest) {
  let session: Session | null = null;

  try {
    const response = await betterFetch<Session>("/api/auth/get-session", {
      baseURL: getSessionBaseURL(request.nextUrl.origin),
      headers: {
        cookie: request.headers.get("cookie") || "",
      },
    });
    session = response.data ?? null;
  } catch {
    session = null;
  }

  if (!session) {
    return NextResponse.redirect(
      buildSignInRedirectURL(request.nextUrl.href, request.nextUrl.origin),
    );
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/styles/:path*",
    "/tilesets/:path*",
    "/keys/:path*",
    "/usage/:path*",
    "/operations/:path*",
    "/platform/:path*",
    "/organization/:path*",
    "/settings/:path*",
    "/billing/:path*",
    "/team/:path*",
    "/integration/:path*",
  ],
};
