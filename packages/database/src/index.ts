import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import * as relations from "./relations";

const connectionString = process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/planisfy";

// Disable prefetch as it is not supported for "Transaction" pool mode
const client = postgres(connectionString, { prepare: false });

export const db = drizzle(client, {
  schema: { ...schema, ...relations }
});

export * from "./schema";
export * from "./relations";
