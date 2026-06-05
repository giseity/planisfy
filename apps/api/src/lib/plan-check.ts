import { db, styles, tilesets, apiKeys } from "@planisfy/database";
import { eq, and, isNull, count } from "drizzle-orm";
import { getPlanLimits } from "./billing";

export async function checkResourceLimit(
  userId: string,
  ownerId: string,
  resource: "styles" | "tilesets" | "apiKeys",
): Promise<{ allowed: boolean; current: number; limit: number }> {
  const limits = await getPlanLimits(userId);

  const limitMap = {
    styles: limits.maxStyles,
    tilesets: limits.maxSources,
    apiKeys: limits.maxApiKeys,
  };

  const max = limitMap[resource];
  if (max === Infinity) {
    return { allowed: true, current: 0, limit: max };
  }

  let current = 0;
  if (resource === "styles") {
    const [row] = await db
      .select({ count: count() })
      .from(styles)
      .where(and(eq(styles.ownerId, ownerId), isNull(styles.deletedAt)));
    current = row?.count ?? 0;
  } else if (resource === "tilesets") {
    const [row] = await db
      .select({ count: count() })
      .from(tilesets)
      .where(and(eq(tilesets.accountId, ownerId), isNull(tilesets.deletedAt)));
    current = row?.count ?? 0;
  } else {
    const [row] = await db
      .select({ count: count() })
      .from(apiKeys)
      .where(and(eq(apiKeys.ownerId, ownerId), isNull(apiKeys.deletedAt)));
    current = row?.count ?? 0;
  }

  return { allowed: current < max, current, limit: max };
}
