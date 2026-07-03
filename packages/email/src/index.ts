export interface RenderedEmail {
  subject: string
  html: string
  text: string
}

export function escapeHtml(value: unknown) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function htmlParagraphFromText(value: string) {
  return `<p>${escapeHtml(value).replaceAll('\n', '<br />')}</p>`
}

function emailParagraph(html: string) {
  return `<p style="color: #374151; font-size: 15px; line-height: 24px; margin: 0 0 16px;">${html}</p>`
}

function renderLayout(options: {
  subject: string
  previewText: string
  heading: string
  body: string
  cta?: { label: string; href: string }
  footerNote?: string
  accountSettingsUrl?: string
  text: string
}): RenderedEmail {
  const cta = options.cta
    ? `
              <tr>
                <td style="padding: 8px 0 20px;">
                  <a href="${escapeHtml(options.cta.href)}" style="display: inline-block; padding: 12px 24px; background: #111827; color: #ffffff; text-decoration: none; border-radius: 12px; font-size: 14px; line-height: 16px; font-weight: 650;">
                    ${escapeHtml(options.cta.label)}
                  </a>
                </td>
              </tr>`
    : ''
  const footerNote = options.footerNote
    ? `<p style="color: #6b7280; font-size: 13px; line-height: 20px; margin: 24px 0 0;">${escapeHtml(options.footerNote)}</p>`
    : ''
  const accountSettings = options.accountSettingsUrl
    ? `
              <span style="padding: 0 8px; color: #d1d5db;">|</span>
              <a href="${escapeHtml(options.accountSettingsUrl)}" style="color: #6b7280;">Account settings</a>`
    : ''

  return {
    subject: options.subject,
    html: `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(options.subject)}</title>
  </head>
  <body style="margin: 0; padding: 0; background: #f9fafb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
    <div style="display: none; max-height: 0; overflow: hidden; opacity: 0;">${escapeHtml(options.previewText)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: #f9fafb; padding: 32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 560px; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 16px; overflow: hidden;">
            <tr>
              <td style="padding: 28px 28px 10px;">
                <div style="font-size: 15px; line-height: 20px; font-weight: 700; color: #111827; margin: 0 0 22px;">Planisfy</div>
                <h1 style="font-size: 20px; line-height: 28px; font-weight: 650; color: #111827; margin: 0 0 14px;">${escapeHtml(options.heading)}</h1>
                ${options.body}
              </td>
            </tr>
            ${cta}
            <tr>
              <td style="padding: 0 28px 28px;">
                ${footerNote}
              </td>
            </tr>
          </table>
          <p style="color: #6b7280; font-size: 12px; line-height: 18px; margin: 18px 0 0;">
            Planisfy account email${accountSettings}
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`,
    text: options.text,
  }
}

export function renderInvitationEmail(params: {
  organizationName: string
  inviterName: string
  role: string
  acceptUrl: string
  accountSettingsUrl?: string
}) {
  const organizationName = escapeHtml(params.organizationName)
  const inviterName = escapeHtml(params.inviterName)
  const role = escapeHtml(params.role)

  return renderLayout({
    subject: `You've been invited to ${params.organizationName} on Planisfy`,
    previewText: `${params.inviterName} invited you to join ${params.organizationName}.`,
    heading: `Join ${params.organizationName} on Planisfy`,
    body: [
      emailParagraph(
        `${inviterName} invited you to join <strong>${organizationName}</strong> as a <strong>${role}</strong>.`
      ),
      emailParagraph("If you don't have a Planisfy account, you'll be asked to create one first."),
    ].join(''),
    cta: { label: 'Accept invitation', href: params.acceptUrl },
    accountSettingsUrl: params.accountSettingsUrl,
    text: `${params.inviterName} invited you to join ${params.organizationName} as a ${params.role}.\n\nAccept invitation: ${params.acceptUrl}`,
  })
}

export function renderPasswordResetEmail(params: {
  name: string
  resetUrl: string
  accountSettingsUrl?: string
}) {
  const name = escapeHtml(params.name)

  return renderLayout({
    subject: 'Reset your Planisfy password',
    previewText: 'Use this link to reset your Planisfy password.',
    heading: 'Reset your password',
    body: [
      emailParagraph(`Hi ${name},`),
      emailParagraph('We received a request to reset your Planisfy password.'),
      emailParagraph("This link expires in 1 hour. If you didn't request this, you can ignore this email."),
    ].join(''),
    cta: { label: 'Reset password', href: params.resetUrl },
    accountSettingsUrl: params.accountSettingsUrl,
    text: `Hi ${params.name},\n\nReset your Planisfy password: ${params.resetUrl}\n\nThis link expires in 1 hour.`,
  })
}

export function renderQuotaWarningEmail(params: {
  name: string
  usedUnits: number
  totalUnits: number
  percentUsed: number
  billingUrl: string
  accountSettingsUrl?: string
}) {
  const name = escapeHtml(params.name)
  const percentUsed = Math.min(Math.max(params.percentUsed, 0), 100)
  const barColor = percentUsed >= 90 ? '#dc2626' : '#d97706'

  return renderLayout({
    subject: `Planisfy quota warning: ${params.percentUsed}% used`,
    previewText: `You've used ${params.percentUsed}% of your monthly Planisfy credits.`,
    heading: 'Quota warning',
    body: [
      emailParagraph(`Hi ${name},`),
      emailParagraph(
        `You've used <strong>${params.usedUnits.toLocaleString()}</strong> of your <strong>${params.totalUnits.toLocaleString()}</strong> monthly Planisfy credits (<strong>${params.percentUsed}%</strong>).`
      ),
      `<div style="background: #f3f4f6; border-radius: 999px; padding: 4px; margin: 18px 0 18px;">
        <div style="background: ${barColor}; height: 8px; border-radius: 999px; width: ${percentUsed}%;"></div>
      </div>`,
      emailParagraph('To avoid service interruptions, consider updating your plan.'),
    ].join(''),
    cta: { label: 'View plan options', href: params.billingUrl },
    accountSettingsUrl: params.accountSettingsUrl,
    text: `Hi ${params.name},\n\nYou've used ${params.usedUnits.toLocaleString()} of ${params.totalUnits.toLocaleString()} monthly Planisfy credits (${params.percentUsed}%).\n\nView plan options: ${params.billingUrl}`,
  })
}

export function renderGenericNotificationEmail(params: {
  title: string
  body: string
  accountSettingsUrl?: string
}) {
  return renderLayout({
    subject: params.title,
    previewText: params.body,
    heading: params.title,
    body: emailParagraph(escapeHtml(params.body).replaceAll('\n', '<br />')),
    accountSettingsUrl: params.accountSettingsUrl,
    text: params.body,
  })
}

export function renderVerificationEmail(params: {
  name: string
  verifyUrl: string
  accountSettingsUrl?: string
}) {
  const name = escapeHtml(params.name)

  return renderLayout({
    subject: 'Verify your Planisfy email address',
    previewText: 'Confirm your email address to finish setting up your Planisfy account.',
    heading: 'Verify your email address',
    body: [
      emailParagraph(`Hi ${name},`),
      emailParagraph('Please verify your email address to get full access to Planisfy.'),
      emailParagraph("If you didn't create a Planisfy account, you can ignore this email."),
    ].join(''),
    cta: { label: 'Verify email', href: params.verifyUrl },
    accountSettingsUrl: params.accountSettingsUrl,
    text: `Hi ${params.name},\n\nVerify your Planisfy email address: ${params.verifyUrl}`,
  })
}

export function renderWelcomeEmail(params: {
  name: string
  stylesUrl: string
  accountSettingsUrl?: string
}) {
  const name = escapeHtml(params.name)

  return renderLayout({
    subject: 'Welcome to Planisfy',
    previewText: 'Your Planisfy account is ready.',
    heading: 'Welcome to Planisfy',
    body: [
      emailParagraph(`Hi ${name},`),
      emailParagraph('Your account is ready. You can now create map styles, generate API keys, and invite your team.'),
    ].join(''),
    cta: { label: 'Get started', href: params.stylesUrl },
    accountSettingsUrl: params.accountSettingsUrl,
    text: `Hi ${params.name},\n\nWelcome to Planisfy. Get started: ${params.stylesUrl}`,
  })
}
