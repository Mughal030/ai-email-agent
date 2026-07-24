/**
 * GET  /api/gmail/connect
 * Returns whether SMTP/IMAP creds are configured in .env. If yes, the
 * dashboard shows the account as auto-connected.
 *
 * POST /api/gmail/connect
 * Body: { email?: string, password?: string, displayName?: string }
 *
 * If SMTP_PASS is already set in env (real production mode), creates the
 * account row pointing to those env creds.
 *
 * If password is supplied in the body, stores it encrypted (DB) so the
 * account can be used even without env vars.
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureDemoUser } from '@/lib/auth'
import { encrypt } from '@/lib/crypto'
import { verifySmtp } from '@/lib/email/smtp'

export async function GET() {
  const userId = await ensureDemoUser()
  const envEmail = process.env.SMTP_USER
  const envPass = process.env.SMTP_PASS

  if (envEmail && envPass) {
    // Auto-create / ensure the account exists
    let account = await db.gmailAccount.findFirst({
      where: { userId, email: envEmail },
    })
    if (!account) {
      account = await db.gmailAccount.create({
        data: {
          userId,
          email: envEmail,
          displayName: process.env.SMTP_FROM_NAME || 'AI Sales Agent',
          encryptedSmtpPass: encrypt(envPass),
          smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
          smtpPort: Number(process.env.SMTP_PORT) || 465,
          imapHost: process.env.IMAP_HOST || 'imap.gmail.com',
          imapPort: Number(process.env.IMAP_PORT) || 993,
          isActive: true,
          // Start PAUSED — user must manually click "Resume Sending"
          sendingPaused: true,
        },
      })
    }

    // Auto-assign any orphan leads (no sender account) to this account
    await db.lead.updateMany({
      where: { userId, gmailAccountId: null, isArchived: false },
      data: { gmailAccountId: account.id },
    })

    return NextResponse.json({
      autoConnected: true,
      email: envEmail,
      displayName: process.env.SMTP_FROM_NAME || 'AI Sales Agent',
    })
  }

  return NextResponse.json({
    autoConnected: false,
    message:
      'No SMTP creds in .env. POST to this endpoint with { email, password, displayName } to add an account.',
  })
}

export async function POST(req: Request) {
  const userId = await ensureDemoUser()
  const body = await req.json()
  const email = body?.email
  const password = body?.password
  const displayName = body?.displayName || 'AI Sales Agent'

  if (!email || !password) {
    return NextResponse.json(
      { error: 'email and password are required' },
      { status: 400 }
    )
  }

  // Verify SMTP creds actually work before persisting
  const ok = await verifySmtp(email, password)
  if (!ok) {
    return NextResponse.json(
      {
        error:
          'SMTP verification failed. Check the email + app password (Gmail app passwords are 16 chars with spaces, e.g. "abcd efgh ijkl mnop").',
      },
      { status: 400 }
    )
  }

  const existing = await db.gmailAccount.findFirst({
    where: { userId, email },
  })
  if (existing) {
    const account = await db.gmailAccount.update({
      where: { id: existing.id },
      data: {
        encryptedSmtpPass: encrypt(password),
        displayName,
        isActive: true,
      },
    })
    return NextResponse.json({ account })
  }

  const account = await db.gmailAccount.create({
    data: {
      userId,
      email,
      displayName,
      encryptedSmtpPass: encrypt(password),
      smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
      smtpPort: Number(process.env.SMTP_PORT) || 465,
      imapHost: process.env.IMAP_HOST || 'imap.gmail.com',
      imapPort: Number(process.env.IMAP_PORT) || 993,
      isActive: true,
    },
  })

  return NextResponse.json({ account }, { status: 201 })
}
