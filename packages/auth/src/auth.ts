import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import {
  db,
  users,
  profiles,
  organizations,
  members,
  invitations,
  sessions,
  accounts,
  verifications,
} from "@planisfy/database";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

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

// ============================================================================
// Better-Auth instance
// ============================================================================

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: users,
      session: sessions,
      account: accounts,
      verification: verifications,
      organization: organizations,
      member: members,
      invitation: invitations,
    },
  }),

  plugins: [
    organization({
      sendInvitationEmail: async ({ invitation, organization }) => {
        // TODO: Wire up Resend to send invitation emails
        console.log(
          `[invite] ${invitation.email} invited to ${organization.name} (invitation: ${invitation.id})`
        );
      },
      organizationHooks: {
        beforeCreateOrganization: async ({ organization }) => {
          if (!organization.slug || !organization.name) {
            throw new Error("Organization slug and name are required");
          }

          // Check for duplicate slug before creating the profile,
          // since better-auth's org insert happens *after* this hook.
          const [existing] = await db
            .select({ id: organizations.id })
            .from(organizations)
            .where(eq(organizations.slug, organization.slug))
            .limit(1);
          if (existing) {
            throw new Error("Organization with this slug already exists");
          }

          // Generate a shared ID for both profile and organization
          const id = randomUUID();
          const handle = generateHandle(organization.name);

          // Create the profile supertype row first
          await db.insert(profiles).values({
            id,
            type: "ORGANIZATION",
            handle,
            displayName: organization.name,
            avatarUrl: organization.logo ?? null,
          });

          // Set the org's ID to match the profile
          return {
            data: { ...organization, id },
          };
        },
      },
    }),
  ],

  emailAndPassword: {
    enabled: true,
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
          // Check for duplicate email before creating the profile,
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

          // Generate a shared ID for both profile and user
          const id = randomUUID();

          // Create the profile first (supertype row)
          await db.insert(profiles).values({
            id,
            type: "USER",
            handle,
            displayName: userData.name,
            avatarUrl: userData.image ?? null,
          });

          // Set the user's ID to match the profile, strip handle
          const { handle: _h, ...userFields } = userData as Record<
            string,
            unknown
          >;
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
