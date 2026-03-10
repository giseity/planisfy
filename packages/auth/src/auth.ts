import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import {
  db,
  users,
  profiles,
  sessions,
  accounts,
  verifications,
} from "@planisfy/database";
import { randomBytes } from "crypto";

// ============================================================================
// Handle generation (OAuth users — no handle provided at signup)
// ============================================================================

function generateHandle(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48);
  const suffix = randomBytes(4).toString("hex");
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
    },
  }),

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
          const rawHandle = (userData as Record<string, unknown>).handle as
            | string
            | undefined;
          const handle = rawHandle ?? generateHandle(userData.name);

          // Create the profile first
          const [profile] = await db
            .insert(profiles)
            .values({
              handle,
              displayName: userData.name,
              avatarUrl: userData.image ?? null,
            })
            .returning({ id: profiles.id });

          // Set profileId on the user, strip handle (it lives on profiles)
          const { handle: _h, ...userFields } = userData as Record<
            string,
            unknown
          >;
          return {
            data: {
              ...userFields,
              profileId: profile.id,
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
    defaultCookieAttributes: {
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      domain:
        process.env.NODE_ENV === "production" ? ".planisfy.com" : undefined,
    },
  },
});
