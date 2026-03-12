import { Hono } from "hono";
import {
  sendInvitationEmail,
  sendPasswordResetEmail,
  sendQuotaWarningEmail,
  sendWelcomeEmail,
} from "../lib/email";

// Internal-only email endpoints (not exposed publicly, no auth required)
// Called by auth hooks and background workers within the platform

export const emailRoute = new Hono();

emailRoute.post("/internal/send-invitation-email", async (c) => {
  const body = await c.req.json();
  await sendInvitationEmail(body);
  return c.json({ ok: true });
});

emailRoute.post("/internal/send-welcome-email", async (c) => {
  const body = await c.req.json();
  await sendWelcomeEmail(body);
  return c.json({ ok: true });
});

emailRoute.post("/internal/send-password-reset-email", async (c) => {
  const body = await c.req.json();
  await sendPasswordResetEmail(body);
  return c.json({ ok: true });
});

emailRoute.post("/internal/send-quota-warning-email", async (c) => {
  const body = await c.req.json();
  await sendQuotaWarningEmail(body);
  return c.json({ ok: true });
});
