/**
 * ============================================================================
 * SMTP EMAIL SENDER (real, via nodemailer + Gmail app password)
 * ============================================================================
 */

import nodemailer from 'nodemailer'
import { db } from '@/lib/db'
import { decrypt, encrypt } from '@/lib/crypto'
import type { GmailAccount } from '@prisma/client'
import crypto from 'crypto'

export interface SendEmailInput {
  to: string
  subject: string
  bodyText: string
  replyToMessageId?: string
  fromName?: string
}

export interface SendEmailResult {
  smtpMessageId: string
  threadKey: string
  providerResponse: unknown
}

export function buildThreadKey(leadId: string): string {
  const h = crypto.createHash('sha256').update(leadId).digest('hex').slice(0, 12)
  return `<thread-${h}@agent.local>`
}

function generateMessageId(): string {
  return `<${Date.now()}-${crypto.randomBytes(6).toString('hex')}@agent.local>`
}

async function getTransporter(account: GmailAccount) {
  let pass: string | undefined
  if (account.encryptedSmtpPass) {
    try {
      pass = decrypt(account.encryptedSmtpPass)
    } catch {
      pass = undefined
    }
  }
  if (!pass) pass = process.env.SMTP_PASS
  if (!pass) {
    throw new Error(
      `No SMTP password for ${account.email}. Set SMTP_PASS in .env or store via the dashboard.`
    )
  }

  const host = account.smtpHost || process.env.SMTP_HOST || 'smtp.gmail.com'
  const port = account.smtpPort || Number(process.env.SMTP_PORT) || 465

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user: account.email, pass },
  })
}

export async function sendEmail(
  account: GmailAccount,
  input: SendEmailInput
): Promise<SendEmailResult> {
  const transporter = await getTransporter(account)
  const messageId = generateMessageId()
  const fromName = input.fromName || account.displayName || 'AI Sales Agent'
  const fromHeader = `"${fromName}" <${account.email}>`

  // Generate a plain-text + HTML alternative. Gmail/Outlook spam filters
  // heavily penalize HTML-only emails — they want a matching text/plain part.
  const plainText = input.bodyText
  const htmlBody = textToHtml(plainText)

  const mailOptions: nodemailer.SendMailOptions = {
    from: fromHeader,
    to: input.to,
    subject: input.subject,
    text: plainText,
    html: htmlBody,
    messageId,
    replyTo: account.email,
    headers: {
      // Minimal headers — for cold outreach we want this to look like a
      // genuine 1:1 email, NOT a bulk newsletter. The following headers
      // were HURTING deliverability:
      //   - Precedence: bulk  → signals "mass mailing" → spam filter
      //   - List-Unsubscribe → signals "newsletter" → Promotions/Spam tab
      //   - Feedback-ID      → ESP tracking signal, unnecessary for low volume
      'X-Auto-Response-Suppress': 'All',  // suppress auto-responders
      'X-Priority': '3',
    },
  }

  if (input.replyToMessageId) {
    mailOptions.inReplyTo = input.replyToMessageId
    mailOptions.references = input.replyToMessageId
  }

  const info = await transporter.sendMail(mailOptions)

  return {
    smtpMessageId: messageId,
    threadKey: input.replyToMessageId || messageId,
    providerResponse: info,
  }
}

/**
 * Convert plain text email body to HTML for the multipart/alternative.
 * Escapes HTML entities and preserves line breaks.
 *
 * NOTE: No unsubscribe footer — for cold outreach, a footer that says
 * "You received this because you opted in" looks fake (the lead didn't
 * opt in) and triggers spam filters. The email should look like a
 * genuine 1:1 message.
 */
function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  const htmlBody = escaped.replace(/\n/g, '<br>\n')
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; line-height: 1.5; color: #1a1a1a; max-width: 600px; margin: 0 auto; padding: 20px;">
${htmlBody}
</body>
</html>`
}

export async function verifySmtp(email: string, pass: string): Promise<boolean> {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT) || 465,
    secure: true,
    auth: { user: email, pass },
  })
  try {
    await transporter.verify()
    return true
  } catch (e) {
    console.error('[smtp] verify failed:', e)
    return false
  }
}

export async function storeSmtpCredentials(
  accountId: string,
  password: string
): Promise<void> {
  await db.gmailAccount.update({
    where: { id: accountId },
    data: { encryptedSmtpPass: encrypt(password) },
  })
}
