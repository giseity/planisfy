import { Hono } from 'hono'
import {
  sendInvitationEmail,
  sendPasswordResetEmail,
  sendQuotaWarningEmail,
  sendVerificationEmail,
  sendWelcomeEmail,
} from './email'

// Internal-only email endpoints.
// Called by auth hooks and background workers within the platform.
// Access is enforced by internalAuthMiddleware in app.ts.

export const emailRoute = new Hono()

emailRoute.post('/internal/send-invitation-email', async (c) => {
  const body = await c.req.json()
  return emailResponse(c, await sendInvitationEmail(body))
})

emailRoute.post('/internal/send-welcome-email', async (c) => {
  const body = await c.req.json()
  return emailResponse(c, await sendWelcomeEmail(body))
})

emailRoute.post('/internal/send-password-reset-email', async (c) => {
  const body = await c.req.json()
  return emailResponse(c, await sendPasswordResetEmail(body))
})

emailRoute.post('/internal/send-verification-email', async (c) => {
  const body = await c.req.json()
  return emailResponse(c, await sendVerificationEmail(body))
})

emailRoute.post('/internal/send-quota-warning-email', async (c) => {
  const body = await c.req.json()
  return emailResponse(c, await sendQuotaWarningEmail(body))
})

function emailResponse(
  c: { json: (body: { ok: boolean }, status?: number) => Response },
  ok: boolean
) {
  return c.json({ ok }, ok ? 200 : 502)
}
