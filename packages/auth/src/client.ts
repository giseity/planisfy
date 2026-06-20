import { createAuthClient } from "better-auth/react";
import { organizationClient } from "better-auth/client/plugins";

const authOrigin = process.env.NEXT_PUBLIC_AUTH_ORIGIN;
if (!authOrigin) {
  throw new Error("NEXT_PUBLIC_AUTH_ORIGIN is required.");
}

// Better Auth's inferred client type currently leaks non-portable internals
// when this source package is consumed by another workspace app.
/* eslint-disable @typescript-eslint/no-explicit-any */
type AuthResult = Promise<{ data?: any; error?: any }>;
type AuthMethod = (...args: any[]) => AuthResult;
type AuthHook = (...args: any[]) => any;
/* eslint-enable @typescript-eslint/no-explicit-any */

export type AuthClient = {
  changePassword: AuthMethod;
  listSessions: AuthMethod;
  organization: {
    cancelInvitation: AuthMethod;
    create: AuthMethod;
    delete: AuthMethod;
    getFullOrganization: AuthMethod;
    inviteMember: AuthMethod;
    list: AuthMethod;
    removeMember: AuthMethod;
    setActive: AuthMethod;
    update: AuthMethod;
    updateMemberRole: AuthMethod;
  };
  requestPasswordReset: AuthMethod;
  resetPassword: AuthMethod;
  revokeOtherSessions: AuthMethod;
  revokeSession: AuthMethod;
  sendVerificationEmail: AuthMethod;
  signOut: AuthMethod;
  signIn: { email: AuthMethod; social: AuthMethod };
  signUp: { email: AuthMethod };
  useSession: AuthHook;
};

export const authClient = createAuthClient({
  baseURL: authOrigin,
  plugins: [organizationClient()],
}) as unknown as AuthClient;

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
