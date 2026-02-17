import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000", // Central Auth URL (Console)
});

export const { signIn, signUp, useSession } = authClient;
