import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db, accounts, sessions, authAccounts, verifications } from "@planisfy/database";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: accounts,
      session: sessions,
      account: authAccounts,
      verification: verifications
    },
  }),
  emailAndPassword: {
    enabled: true,
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 minutes cache
    },
  },
  advanced: {
    defaultCookieAttributes: {
      sameSite: "lax", // Required for cross-subdomain
      secure: process.env.NODE_ENV === "production",
      domain: process.env.NODE_ENV === "production" ? ".planisfy.com" : undefined, // Shared cookie
    }
  }
});
