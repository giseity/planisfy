import { createAuthClient } from "better-auth/react";
import { organizationClient } from "better-auth/client/plugins";

const authOrigin = process.env.NEXT_PUBLIC_AUTH_ORIGIN;
if (!authOrigin) {
  throw new Error("NEXT_PUBLIC_AUTH_ORIGIN is required.");
}

export const authClient = createAuthClient({
  baseURL: authOrigin,
  plugins: [organizationClient()],
});

export const { signIn, signUp, useSession } = authClient;
export const { organization } = authClient;
