// ── Email service via Resend ─────────────────────────────────────────────────

import { env } from "../env";

const RESEND_API_KEY = env.RESEND_API_KEY;
const FROM_EMAIL = env.FROM_EMAIL;
const consoleUrl = env.NEXT_PUBLIC_CONSOLE_URL;
const allowedActionUrlOrigins = new Set(
  [env.NEXT_PUBLIC_CONSOLE_URL, env.NEXT_PUBLIC_API_URL].map(
    (value) => new URL(value).origin,
  ),
);

interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(options: SendEmailOptions): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.log(`[email] (dry run) To: ${options.to} | Subject: ${options.subject}`);
    return true;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: Array.isArray(options.to) ? options.to : [options.to],
        subject: options.subject,
        html: options.html,
        text: options.text,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[email] Send failed:", err);
      return false;
    }

    return true;
  } catch (err) {
    console.error("[email] Send error:", err);
    return false;
  }
}

export function escapeHtml(value: unknown) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function htmlParagraphFromText(value: string) {
  return `<p>${escapeHtml(value).replaceAll("\n", "<br />")}</p>`;
}

export function validateEmailActionUrl(value: string) {
  const parsed = new URL(value);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Email action URL must use http or https");
  }
  if (!allowedActionUrlOrigins.has(parsed.origin)) {
    throw new Error("Email action URL origin is not allowed");
  }
  return parsed.toString();
}

function consoleActionUrl(pathname: string, params?: Record<string, string>) {
  const url = new URL(pathname, consoleUrl);
  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value);
  }
  return validateEmailActionUrl(url.toString());
}

// ── Email Templates ─────────────────────────────────────────────────────────

export async function sendInvitationEmail(params: {
  email: string;
  organizationName: string;
  inviterName: string;
  role: string;
  invitationId: string;
}) {
  const acceptUrl = consoleActionUrl("/organization", {
    accept: params.invitationId,
  });
  const organizationName = escapeHtml(params.organizationName);
  const inviterName = escapeHtml(params.inviterName);
  const role = escapeHtml(params.role);

  return sendEmail({
    to: params.email,
    subject: `You've been invited to ${params.organizationName} on Planisfy`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1a1a1a;">Join ${organizationName} on Planisfy</h2>
        <p>${inviterName} has invited you to join <strong>${organizationName}</strong> as a <strong>${role}</strong>.</p>
        <a href="${escapeHtml(acceptUrl)}" style="display: inline-block; padding: 12px 24px; background: #1a1a1a; color: #fff; text-decoration: none; border-radius: 6px; margin: 16px 0;">
          Accept Invitation
        </a>
        <p style="color: #666; font-size: 14px;">If you don't have a Planisfy account, you'll be asked to create one first.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="color: #999; font-size: 12px;">Planisfy — Open-source mapping platform</p>
      </div>
    `,
    text: `${params.inviterName} has invited you to join ${params.organizationName} as a ${params.role}.\n\nAccept: ${acceptUrl}`,
  });
}

export async function sendPasswordResetEmail(params: {
  email: string;
  resetUrl: string;
  name: string;
}) {
  const resetUrl = validateEmailActionUrl(params.resetUrl);
  const name = escapeHtml(params.name);

  return sendEmail({
    to: params.email,
    subject: "Reset your Planisfy password",
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1a1a1a;">Reset your password</h2>
        <p>Hi ${name},</p>
        <p>We received a request to reset your Planisfy password.</p>
        <a href="${escapeHtml(resetUrl)}" style="display: inline-block; padding: 12px 24px; background: #1a1a1a; color: #fff; text-decoration: none; border-radius: 6px; margin: 16px 0;">
          Reset Password
        </a>
        <p style="color: #666; font-size: 14px;">This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="color: #999; font-size: 12px;">Planisfy — Open-source mapping platform</p>
      </div>
    `,
    text: `Hi ${params.name},\n\nReset your Planisfy password: ${resetUrl}\n\nThis link expires in 1 hour.`,
  });
}

export async function sendQuotaWarningEmail(params: {
  email: string;
  name: string;
  usedUnits: number;
  totalUnits: number;
  percentUsed: number;
}) {
  const billingUrl = consoleActionUrl("/billing");
  const name = escapeHtml(params.name);
  const percentUsed = Math.min(Math.max(params.percentUsed, 0), 100);

  return sendEmail({
    to: params.email,
    subject: `Planisfy: You've used ${params.percentUsed}% of your monthly quota`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1a1a1a;">Quota Warning</h2>
        <p>Hi ${name},</p>
        <p>You've used <strong>${params.usedUnits.toLocaleString()}</strong> of your <strong>${params.totalUnits.toLocaleString()}</strong> monthly API units (<strong>${params.percentUsed}%</strong>).</p>
        <div style="background: #f5f5f5; border-radius: 8px; padding: 4px; margin: 16px 0;">
          <div style="background: ${percentUsed >= 90 ? '#ef4444' : '#f59e0b'}; height: 8px; border-radius: 6px; width: ${percentUsed}%;"></div>
        </div>
        <p>To avoid service interruptions, consider upgrading your plan.</p>
        <a href="${escapeHtml(billingUrl)}" style="display: inline-block; padding: 12px 24px; background: #1a1a1a; color: #fff; text-decoration: none; border-radius: 6px; margin: 16px 0;">
          View Plan Options
        </a>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="color: #999; font-size: 12px;">Planisfy — Open-source mapping platform</p>
      </div>
    `,
    text: `Hi ${params.name},\n\nYou've used ${params.usedUnits.toLocaleString()} of ${params.totalUnits.toLocaleString()} monthly units (${params.percentUsed}%).\n\nUpgrade: ${billingUrl}`,
  });
}

export async function sendVerificationEmail(params: {
  email: string;
  name: string;
  verifyUrl: string;
}) {
  const verifyUrl = validateEmailActionUrl(params.verifyUrl);
  const name = escapeHtml(params.name);

  return sendEmail({
    to: params.email,
    subject: "Verify your Planisfy email address",
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1a1a1a;">Verify your email</h2>
        <p>Hi ${name},</p>
        <p>Please verify your email address to get full access to Planisfy.</p>
        <a href="${escapeHtml(verifyUrl)}" style="display: inline-block; padding: 12px 24px; background: #1a1a1a; color: #fff; text-decoration: none; border-radius: 6px; margin: 16px 0;">
          Verify Email
        </a>
        <p style="color: #666; font-size: 14px;">If you didn't create a Planisfy account, you can safely ignore this email.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="color: #999; font-size: 12px;">Planisfy — Open-source mapping platform</p>
      </div>
    `,
    text: `Hi ${params.name},\n\nVerify your email: ${verifyUrl}`,
  });
}

export async function sendWelcomeEmail(params: {
  email: string;
  name: string;
}) {
  const stylesUrl = consoleActionUrl("/styles");
  const name = escapeHtml(params.name);

  return sendEmail({
    to: params.email,
    subject: "Welcome to Planisfy!",
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1a1a1a;">Welcome to Planisfy!</h2>
        <p>Hi ${name},</p>
        <p>Thanks for signing up. Here are some things you can do:</p>
        <ul style="line-height: 1.8;">
          <li><strong>Create a map style</strong> — Use our visual editor to design custom maps</li>
          <li><strong>Generate API keys</strong> — Access tiles, geocoding, and routing APIs</li>
          <li><strong>Invite your team</strong> — Create an organization and collaborate</li>
        </ul>
        <a href="${escapeHtml(stylesUrl)}" style="display: inline-block; padding: 12px 24px; background: #1a1a1a; color: #fff; text-decoration: none; border-radius: 6px; margin: 16px 0;">
          Get Started
        </a>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="color: #999; font-size: 12px;">Planisfy — Open-source mapping platform</p>
      </div>
    `,
    text: `Hi ${params.name},\n\nWelcome to Planisfy! Get started: ${stylesUrl}`,
  });
}
