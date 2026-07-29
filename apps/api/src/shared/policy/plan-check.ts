import { db, styles, tilesets, apiKeys } from "@planisfy/database";
import { eq, and, isNull, count } from "drizzle-orm";
import { getAccountPlanLimits } from "../../domains/billing/billing";

type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function checkResourceLimit(
  userId: string,
  ownerId: string,
  resource: "styles" | "tilesets" | "apiKeys",
  database: typeof db | DatabaseTransaction = db,
): Promise<{ allowed: boolean; current: number; limit: number }> {
  void userId;
  const limits = await getAccountPlanLimits(ownerId);

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
    const [row] = await database
      .select({ count: count() })
      .from(styles)
      .where(and(eq(styles.ownerId, ownerId), isNull(styles.deletedAt)));
    current = row?.count ?? 0;
  } else if (resource === "tilesets") {
    const [row] = await database
      .select({ count: count() })
      .from(tilesets)
      .where(and(eq(tilesets.accountId, ownerId), isNull(tilesets.deletedAt)));
    current = row?.count ?? 0;
  } else {
    const [row] = await database
      .select({ count: count() })
      .from(apiKeys)
      .where(and(eq(apiKeys.referenceId, ownerId), eq(apiKeys.enabled, true)));
    current = row?.count ?? 0;
  }

  return { allowed: current < max, current, limit: max };
}
