import { clientEnv } from "@/env.client";
import { hc } from "hono/client";
import type { ConsoleAppType } from "../../../api/src/domains/console/route";

export const CONSOLE_API_BASE =
  typeof window !== "undefined"
    ? clientEnv.NEXT_PUBLIC_CONSOLE_API_PATH
    : `${process.env.CONSOLE_API_INTERNAL_ORIGIN ?? clientEnv.NEXT_PUBLIC_API_URL}/console`;

export const API_ROOT = CONSOLE_API_BASE.replace(/\/console\/?$/, "");

export const consoleRpc = hc<ConsoleAppType>(CONSOLE_API_BASE, {
  fetch: (input: RequestInfo | URL, init?: RequestInit) =>
    fetch(input, {
      ...init,
      credentials: "include",
    }),
});
