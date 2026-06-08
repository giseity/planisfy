import { betterFetch } from "@better-fetch/fetch";
import type { Session } from "better-auth/types";
import { NextResponse, type NextRequest } from "next/server";

export default async function authMiddleware(request: NextRequest) {
  const { data: session } = await betterFetch<Session>(
    "/api/auth/get-session",
    {
      baseURL: request.nextUrl.origin,
      headers: {
        cookie: request.headers.get("cookie") || "",
      },
    },
  );

  if (!session) {
    const authOrigin =
      process.env.NEXT_PUBLIC_AUTH_ORIGIN ||
      process.env.NEXT_PUBLIC_APP_URL ||
      request.nextUrl.origin;
    const signInUrl = new URL("/sign-in", authOrigin);
    signInUrl.searchParams.set("callbackUrl", request.nextUrl.href);
    return NextResponse.redirect(signInUrl);
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
    "/studio/:path*",
  ],
};
