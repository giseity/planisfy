import { clientEnv } from "@/env.client";

export function docsUrl(path = "/docs") {
  const base = clientEnv.NEXT_PUBLIC_DOCS_URL.replace(/\/+$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}
