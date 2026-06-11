import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import {
  db,
  users,
  accounts,
  organizations,
  members,
  invitations,
  sessions,
  oauthAccounts,
  verifications,
} from "@planisfy/database";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { getAuthBaseURL, getAuthSecret } from "./env";

const apiUrl = process.env.NEXT_PUBLIC_API_URL;
if (!apiUrl) {
  throw new Error("NEXT_PUBLIC_API_URL is required.");
}

// ============================================================================
// Handle generation (OAuth users — no handle provided at signup)
// ============================================================================

function generateHandle(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48);
  const suffix = randomUUID().slice(0, 8);
  return `${base || "user"}_${suffix}`;
}

function internalHeaders(): HeadersInit {
  return {
    "Content-Type": "application/json",
    ...(process.env.INTERNAL_API_SECRET
      ? { "X-Internal-Secret": process.env.INTERNAL_API_SECRET }
      : {}),
  };
}

// ============================================================================
// Better-Auth instance
// ============================================================================

export const auth = betterAuth({
  secret: getAuthSecret(),
  baseURL: getAuthBaseURL(),

  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: users,
      session: sessions,
      account: oauthAccounts,
      verification: verifications,
      organization: organizations,
      member: members,
      invitation: invitations,
    },
  }),

  plugins: [
    organization({
      sendInvitationEmail: async ({ invitation, organization, inviter }) => {
        // Email sending delegated to API email service
        // The API hooks into this via the onInviteSent callback pattern
        console.log(
          `[invite] ${invitation.email} invited to ${organization.name} by ${inviter.user.name} (role: ${invitation.role}, id: ${invitation.id})`
        );
        // When RESEND_API_KEY is set, the API's email service sends the actual email
        // via a fire-and-forget fetch to the internal email endpoint
        if (process.env.RESEND_API_KEY) {
          try {
            await fetch(`${apiUrl}/internal/send-invitation-email`, {
              method: "POST",
              headers: internalHeaders(),
              body: JSON.stringify({
                email: invitation.email,
                organizationName: organization.name,
                inviterName: inviter.user.name,
                role: invitation.role,
                invitationId: invitation.id,
              }),
            }).catch(() => {/* fire and forget */});
          } catch {
            // Ignore — email delivery is best-effort
          }
        }
      },
      organizationHooks: {
        beforeCreateOrganization: async ({ organization }) => {
          if (!organization.slug || !organization.name) {
            throw new Error("Organization slug and name are required");
          }

          // Check for duplicate slug before creating the account,
          // since better-auth's org insert happens *after* this hook.
          const [existing] = await db
            .select({ id: organizations.id })
            .from(organizations)
            .where(eq(organizations.slug, organization.slug))
            .limit(1);
          if (existing) {
            throw new Error("Organization with this slug already exists");
          }

          // Generate a shared ID for both account and organization
          const id = randomUUID();
          const handle = generateHandle(organization.name);

          // Create the account anchor row first
          await db.insert(accounts).values({
            id,
            type: "ORGANIZATION",
            handle,
            displayName: organization.name,
            avatarUrl: organization.logo ?? null,
          });

          // Set the org's ID to match the account
          return {
            data: { ...organization, id },
          };
        },
      },
    }),
  ],

  emailAndPassword: {
    enabled: true,
    sendResetPassword: async ({ user, url }) => {
      console.log(`[password-reset] Sending reset link to ${user.email}`);
      if (process.env.RESEND_API_KEY) {
        try {
          await fetch(`${apiUrl}/internal/send-password-reset-email`, {
            method: "POST",
            headers: internalHeaders(),
            body: JSON.stringify({
              email: user.email,
              name: user.name,
              resetUrl: url,
            }),
          }).catch(() => {/* fire and forget */});
        } catch {
          // Ignore — email delivery is best-effort
        }
      }
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      console.log(`[email-verify] Sending verification to ${user.email}`);
      if (process.env.RESEND_API_KEY) {
        try {
          await fetch(`${apiUrl}/internal/send-verification-email`, {
            method: "POST",
            headers: internalHeaders(),
            body: JSON.stringify({
              email: user.email,
              name: user.name,
              verifyUrl: url,
            }),
          }).catch(() => {/* fire and forget */});
        } catch {
          // Ignore — email delivery is best-effort
        }
      }
    },
  },

  user: {
    additionalFields: {
      handle: {
        type: "string",
        required: false,
        input: true,
      },
    },
  },

  databaseHooks: {
    user: {
      create: {
        before: async (userData) => {
          // Check for duplicate email before creating the account,
          // since better-auth's user insert happens *after* this hook
          // and we can't catch its constraint violations from here.
          const [existing] = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.email, userData.email))
            .limit(1);
          if (existing) {
            throw new Error("User with this email already exists");
          }

          const rawHandle = (userData as Record<string, unknown>).handle as
            | string
            | undefined;
          const handle = rawHandle ?? generateHandle(userData.name);

          // Generate a shared ID for both account and user
          const id = randomUUID();

          // Create the account anchor row first
          await db.insert(accounts).values({
            id,
            type: "USER",
            handle,
            displayName: userData.name,
            avatarUrl: userData.image ?? null,
          });

          // Set the user's ID to match the account, strip handle
          const userFields = { ...(userData as Record<string, unknown>) };
          delete userFields.handle;
          return {
            data: {
              ...userFields,
              id,
            } as typeof userData,
          };
        },
      },
    },
  },

  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },

  advanced: {
    // Force all better-auth generated IDs to be UUIDs so they fit our uuid columns
    generateId: () => randomUUID(),
    defaultCookieAttributes: {
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      domain:
        process.env.NODE_ENV === "production" ? ".planisfy.com" : undefined,
    },
  },
});
