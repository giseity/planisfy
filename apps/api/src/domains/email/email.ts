// ── Email service via ZeptoMail ──────────────────────────────────────────────

import {
  renderInvitationEmail,
  renderPasswordResetEmail,
  renderQuotaWarningEmail,
  renderVerificationEmail,
  renderWelcomeEmail,
} from '@planisfy/email'
import { env } from '../../env'

const ZEPTOMAIL_SEND_MAIL_TOKEN = env.ZEPTOMAIL_SEND_MAIL_TOKEN
const consoleUrl = env.NEXT_PUBLIC_CONSOLE_URL
const allowedActionUrlOrigins = new Set(
  [env.NEXT_PUBLIC_CONSOLE_URL, env.NEXT_PUBLIC_API_URL].map((value) => new URL(value).origin)
)

type EmailSender = 'auth' | 'notifications'

const senderDisplayNames = {
  auth: 'Planisfy Auth',
  notifications: 'Planisfy Notifications',
} satisfies Record<EmailSender, string>

interface SendEmailOptions {
  to: string | string[]
  subject: string
  html: string
  text?: string
  from?: EmailSender
}

export async function sendEmail(options: SendEmailOptions): Promise<boolean> {
  if (!ZEPTOMAIL_SEND_MAIL_TOKEN) {
    console.log(`[email] (dry run) To: ${options.to} | Subject: ${options.subject}`)
    return true
  }

  const sender = fromAddress(options.from ?? 'auth')
  if (!sender) {
    console.error(`[email] Send failed: missing ${options.from ?? 'auth'} sender address`)
    return false
  }

  try {
    const res = await fetch('https://api.zeptomail.com/v1.1/email', {
      method: 'POST',
      headers: {
        Authorization: zeptoMailAuthorizationHeader(ZEPTOMAIL_SEND_MAIL_TOKEN),
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: sender,
        to: recipients(options.to),
        subject: options.subject,
        htmlbody: options.html,
        ...(options.text ? { textbody: options.text } : {}),
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('[email] Send failed:', {
        status: res.status,
        statusText: res.statusText,
        body: err,
      })
      return false
    }

    return true
  } catch (err) {
    console.error('[email] Send error:', err)
    return false
  }
}

function zeptoMailAuthorizationHeader(value: string) {
  return /^Zoho-enczapikey\s+/i.test(value) ? value : `Zoho-enczapikey ${value}`
}

function fromAddress(sender: EmailSender) {
  const value =
    sender === 'notifications' ? env.ZEPTOMAIL_FROM_NOTIFICATIONS : env.ZEPTOMAIL_FROM_AUTH
  return value ? parseMailbox(value, senderDisplayNames[sender]) : null
}

function recipients(to: string | string[]) {
  return (Array.isArray(to) ? to : [to]).map((address) => ({
    email_address: parseMailbox(address),
  }))
}

function parseMailbox(value: string, fallbackName?: string) {
  const match = value.match(/^\s*(.*?)\s*<([^<>]+)>\s*$/)
  const rawName = match?.[1]
  const rawAddress = match?.[2]
  if (rawAddress) {
    return {
      address: rawAddress.trim(),
      name: rawName?.trim() || fallbackName,
    }
  }

  return { address: value.trim(), name: fallbackName }
}

export function validateEmailActionUrl(value: string) {
  const parsed = new URL(value)
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Email action URL must use http or https')
  }
  if (!allowedActionUrlOrigins.has(parsed.origin)) {
    throw new Error('Email action URL origin is not allowed')
  }
  return parsed.toString()
}

function consoleActionUrl(pathname: string, params?: Record<string, string>) {
  const url = new URL(pathname, consoleUrl)
  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value)
  }
  return validateEmailActionUrl(url.toString())
}

// ── Email Templates ─────────────────────────────────────────────────────────

export async function sendInvitationEmail(params: {
  email: string
  organizationName: string
  inviterName: string
  role: string
  invitationId: string
}) {
  const acceptUrl = consoleActionUrl('/organization', {
    accept: params.invitationId,
  })
  const rendered = renderInvitationEmail({
    organizationName: params.organizationName,
    inviterName: params.inviterName,
    role: params.role,
    acceptUrl,
    accountSettingsUrl: consoleActionUrl('/settings/profile'),
  })

  return sendEmail({
    from: 'auth',
    to: params.email,
    ...rendered,
  })
}

export async function sendPasswordResetEmail(params: {
  email: string
  resetUrl: string
  name: string
}) {
  const resetUrl = validateEmailActionUrl(params.resetUrl)
  const rendered = renderPasswordResetEmail({
    name: params.name,
    resetUrl,
    accountSettingsUrl: consoleActionUrl('/settings/profile'),
  })

  return sendEmail({
    from: 'auth',
    to: params.email,
    ...rendered,
  })
}

export async function sendQuotaWarningEmail(params: {
  email: string
  name: string
  usedUnits: number
  totalUnits: number
  percentUsed: number
}) {
  const billingUrl = consoleActionUrl('/billing')
  const rendered = renderQuotaWarningEmail({
    name: params.name,
    usedUnits: params.usedUnits,
    totalUnits: params.totalUnits,
    percentUsed: params.percentUsed,
    billingUrl,
    accountSettingsUrl: consoleActionUrl('/settings/profile'),
  })

  return sendEmail({
    from: 'notifications',
    to: params.email,
    ...rendered,
  })
}

export async function sendVerificationEmail(params: {
  email: string
  name: string
  verifyUrl: string
}) {
  const verifyUrl = validateEmailActionUrl(params.verifyUrl)
  const rendered = renderVerificationEmail({
    name: params.name,
    verifyUrl,
    accountSettingsUrl: consoleActionUrl('/settings/profile'),
  })

  return sendEmail({
    from: 'auth',
    to: params.email,
    ...rendered,
  })
}

export async function sendWelcomeEmail(params: { email: string; name: string }) {
  const stylesUrl = consoleActionUrl('/styles')
  const rendered = renderWelcomeEmail({
    name: params.name,
    stylesUrl,
    accountSettingsUrl: consoleActionUrl('/settings/profile'),
  })

  return sendEmail({
    from: 'auth',
    to: params.email,
    ...rendered,
  })
}
