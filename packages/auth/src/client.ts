import { createAuthClient } from "better-auth/react";
import { organizationClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL:
    process.env.NEXT_PUBLIC_APP_URL || "https://console.planisfy.localhost",
  plugins: [organizationClient()],
});

export const { signIn, signUp, useSession } = authClient;
export const { organization } = authClient;
