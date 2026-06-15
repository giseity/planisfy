import { and, eq, or } from "drizzle-orm";
import { billingTransactions, db } from "@planisfy/database";

type BillingTransactionStatus =
  typeof billingTransactions.$inferInsert.status;
type BillingTransactionType = typeof billingTransactions.$inferInsert.type;

export interface RecordDodoBillingTransactionInput {
  accountId: string;
  initiatedByAccountId?: string | null;
  type: BillingTransactionType;
  status: BillingTransactionStatus;
  providerCheckoutId?: string | null;
  providerOrderId?: string | null;
  providerCustomerId?: string | null;
  providerCustomerExternalId?: string | null;
  providerProductId: string;
  productKey: string;
  productLabel: string;
  amountCents?: number | null;
  currency?: string | null;
  metadata?: Record<string, unknown> | null;
  webhookId?: string | null;
  webhookType?: string | null;
  webhookAt?: Date | null;
}

export async function recordDodoBillingTransaction(
  input: RecordDodoBillingTransactionInput,
): Promise<void> {
  await db.transaction(async (tx) => {
    const predicates = [];
    if (input.providerOrderId) {
      predicates.push(
        and(
          eq(billingTransactions.provider, "DODO"),
          eq(billingTransactions.providerOrderId, input.providerOrderId),
        ),
      );
    }
    if (input.providerCheckoutId) {
      predicates.push(
        and(
          eq(billingTransactions.provider, "DODO"),
          eq(billingTransactions.providerCheckoutId, input.providerCheckoutId),
        ),
      );
    }

    const existing = predicates.length
      ? await tx
          .select({
            id: billingTransactions.id,
            paidAt: billingTransactions.paidAt,
          })
          .from(billingTransactions)
          .where(predicates.length === 1 ? predicates[0]! : or(...predicates))
          .limit(1)
      : [];

    const paidAt =
      input.status === "PAID" ? (existing[0]?.paidAt ?? new Date()) : null;

    const insertValues = {
      accountId: input.accountId,
      initiatedByAccountId: input.initiatedByAccountId ?? null,
      provider: "DODO" as const,
      type: input.type,
      status: input.status,
      providerCheckoutId: input.providerCheckoutId ?? null,
      providerOrderId: input.providerOrderId ?? null,
      providerCustomerId: input.providerCustomerId ?? null,
      providerCustomerExternalId: input.providerCustomerExternalId ?? null,
      providerProductId: input.providerProductId,
      productKey: input.productKey,
      productLabel: input.productLabel,
      amountCents: input.amountCents ?? null,
      currency: input.currency?.toUpperCase() ?? null,
      metadata: input.metadata ?? null,
      lastWebhookId: input.webhookId ?? null,
      lastWebhookType: input.webhookType ?? null,
      lastWebhookAt: input.webhookAt ?? null,
      paidAt,
      updatedAt: new Date(),
    };

    if (existing[0]) {
      await tx
        .update(billingTransactions)
        .set(
          compactUndefined({
            accountId: input.accountId,
            initiatedByAccountId:
              input.initiatedByAccountId === undefined
                ? undefined
                : input.initiatedByAccountId,
            type: input.type,
            status: input.status,
            providerCheckoutId: input.providerCheckoutId || undefined,
            providerOrderId: input.providerOrderId || undefined,
            providerCustomerId: input.providerCustomerId || undefined,
            providerCustomerExternalId:
              input.providerCustomerExternalId || undefined,
            providerProductId: input.providerProductId,
            productKey: input.productKey,
            productLabel: input.productLabel,
            amountCents:
              input.amountCents == null ? undefined : input.amountCents,
            currency:
              input.currency == null ? undefined : input.currency.toUpperCase(),
            metadata: input.metadata === undefined ? undefined : input.metadata,
            lastWebhookId:
              input.webhookId === undefined ? undefined : input.webhookId,
            lastWebhookType:
              input.webhookType === undefined ? undefined : input.webhookType,
            lastWebhookAt:
              input.webhookAt === undefined ? undefined : input.webhookAt,
            paidAt: paidAt ?? undefined,
            updatedAt: new Date(),
          }),
        )
        .where(eq(billingTransactions.id, existing[0].id));
      return;
    }

    await tx.insert(billingTransactions).values(insertValues);
  });
}

function compactUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}
