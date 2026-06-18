import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { getStorage } from "@planisfy/storage";
import { env } from "../env";
import {
  isCheckoutConfiguredForPlan,
  listPlanDefinitions,
} from "../lib/billing";

export const internalSmokeRoute = new Hono();

internalSmokeRoute.get("/internal/managed-smoke", async (c) => {
  const storage = await storageSmoke();
  const plans = (await listPlanDefinitions()).map((plan) => ({
    id: plan.id,
    productId: plan.productId,
    checkoutAvailable: isCheckoutConfiguredForPlan(plan.id),
  }));
  const paidPlans = plans.filter((plan) => plan.id !== "free");
  const billing = {
    ok: paidPlans.every((plan) => plan.checkoutAvailable),
    plans,
  };
  const email = {
    ok: Boolean(env.RESEND_API_KEY && env.FROM_EMAIL),
    fromEmail: env.FROM_EMAIL,
  };

  return c.json({
    data: {
      deploymentMode: env.DEPLOYMENT_MODE,
      storage,
      billing,
      email,
    },
  });
});

async function storageSmoke() {
  const storage = getStorage();
  const info = storage.getInfo();
  const key = `smoke/managed-staging/${Date.now()}-${randomUUID()}.txt`;
  const expected = Buffer.from(`planisfy managed smoke ${new Date().toISOString()}`);

  await storage.upload(key, expected, "text/plain; charset=utf-8");
  try {
    const exists = await storage.exists(key);
    const actual = await storage.download(key);
    return {
      ok: exists && actual.equals(expected),
      provider: info.provider,
      bucket: info.bucket,
      key,
      size: actual.length,
    };
  } finally {
    await storage.delete(key);
  }
}
