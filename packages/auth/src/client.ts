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

export type SocialProvider = "github" | "google";

export const enabledSocialProviders = parseEnabledSocialProviders(
  process.env.NEXT_PUBLIC_AUTH_SOCIAL_PROVIDERS,
);

export function isSocialProviderEnabled(provider: SocialProvider) {
  return enabledSocialProviders.has(provider);
}

function parseEnabledSocialProviders(value: string | undefined) {
  const providers = new Set<SocialProvider>();

  for (const candidate of (value ?? "").split(",")) {
    const provider = candidate.trim().toLowerCase();
    if (provider === "github" || provider === "google") {
      providers.add(provider);
    }
  }

  return providers;
}

export const { signIn, signUp, useSession } = authClient;
export const { organization } = authClient;
