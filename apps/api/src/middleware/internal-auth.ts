import { createMiddleware } from "hono/factory";

export function isInternalRequestAuthorized(headers: Headers): boolean {
  const configuredSecret = process.env.INTERNAL_API_SECRET;

  if (!configuredSecret) {
    return process.env.NODE_ENV !== "production";
  }

  return headers.get("x-internal-secret") === configuredSecret;
}

export const internalAuthMiddleware = createMiddleware(async (c, next) => {
  if (!isInternalRequestAuthorized(c.req.raw.headers)) {
    return c.json(
      { error: { code: "UNAUTHORIZED", message: "Internal route access denied" } },
      401
    );
  }

  await next();
});
