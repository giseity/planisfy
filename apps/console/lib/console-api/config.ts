import { clientEnv } from "@/env.client";

export const CONSOLE_API_BASE =
  typeof window !== "undefined"
    ? clientEnv.NEXT_PUBLIC_CONSOLE_API_PATH
    : `${process.env.CONSOLE_API_INTERNAL_ORIGIN ?? clientEnv.NEXT_PUBLIC_API_URL}/console`;

export const API_ROOT = CONSOLE_API_BASE.replace(/\/console\/?$/, "");
