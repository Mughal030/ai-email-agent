/**
 * ============================================================================
 * GMAIL OAUTH + API LIBRARY
 * ============================================================================
 *
 * Responsibilities:
 *   - Build Google OAuth2 authorization URL
 *   - Exchange auth code → access + refresh tokens
 *   - Refresh expired access tokens (with DB persistence)
 *   - Send email via Gmail REST API (gmail.send scope)
 *   - Poll inbox for replies to threads we started (gmail.readonly scope)
 *
 * Tokens are stored encrypted (see lib/crypto.ts).
 * ============================================================================
 */

import { db } from '@/lib/db'
import { encrypt, decrypt } from '@/lib/crypto'
import type { GmailAccount } from '@prisma/client'

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1'

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
  'openid',
].join(' ')

// ---------------------------------------------------------------------------
// 0. ENV
// ---------------------------------------------------------------------------

function getClientCreds() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI ||
    `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/gmail/callback`
  if (!clientId || !clientSecret) {
    throw new Error(
      'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set. Create them at https://console.cloud.google.com/apis/credentials'
    )
  }
  return { clientId, clientSecret, redirectUri }
}

// ---------------------------------------------------------------------------
// 1. OAUTH FLOW
// ---------------------------------------------------------------------------

export function buildAuthUrl(state: string): string {
  const { clientId, redirectUri } = getClientCreds()
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent', // force refresh_token on every connect
    state,
  })
  return `${GOOGLE_AUTH_URL}?${params.toString()}`
}

export interface TokenResponse {
  access_token: string
  refresh_token: string | null
  expires_in: number
  scope: string
  token_type: string
  id_token?: string
}

export async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  const { clientId, clientSecret, redirectUri } = getClientCreds()
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  })

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const raw = await res.text()
  if (!res.ok) {
    throw new Error(`Google token exchange failed: ${res.status} ${raw}`)
  }
  return JSON.parse(raw) as TokenResponse
}

/** Fetch the user's email address from Google userinfo. */
export async function fetchGoogleEmail(accessToken: string): Promise<string> {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`userinfo failed: ${res.status}`)
  const data = (await res.json()) as { email?: string; sub?: string }
  if (!data.email) throw new Error('No email in userinfo response')
  return data.email
}

// ---------------------------------------------------------------------------
// 2. TOKEN MANAGEMENT (refresh + persistence)
// ---------------------------------------------------------------------------

/** Persist or update a Gmail account row with fresh encrypted tokens. */
export async function upsertGmailAccount(opts: {
  userId: string
  email: string
  googleSub?: string
  accessToken: string
  refreshToken?: string | null
  expiresIn: number
  scope: string
}): Promise<GmailAccount> {
  const expiresAt = new Date(Date.now() + opts.expiresIn * 1000)
  const existing = await db.gmailAccount.findFirst({
    where: { userId: opts.userId, email: opts.email },
  })

  // If we have an existing account and no new refresh token, keep the old one.
  let refreshTokenToStore = opts.refreshToken
  if (!refreshTokenToStore && existing) {
    try {
      refreshTokenToStore = decrypt(existing.encryptedRefreshToken)
    } catch {
      refreshTokenToStore = null
    }
  }

  const data = {
    googleSub: opts.googleSub ?? existing?.googleSub ?? null,
    encryptedAccessToken: encrypt(opts.accessToken),
    encryptedRefreshToken: encrypt(refreshTokenToStore || ''),
    tokenExpiresAt: expiresAt,
    tokenScope: opts.scope,
    isActive: true,
  }

  if (existing) {
    return db.gmailAccount.update({ where: { id: existing.id }, data })
  }
  return db.gmailAccount.create({
    data: {
      userId: opts.userId,
      email: opts.email,
      ...data,
    },
  })
}

/**
 * Get a valid access token for the account, refreshing if needed.
 * Updates the DB with the new token on refresh.
 */
export async function getValidAccessToken(
  account: GmailAccount
): Promise<string> {
  const accessToken = decrypt(account.encryptedAccessToken)
  const expiresAt = account.tokenExpiresAt?.getTime() ?? 0

  // 5-minute buffer
  if (expiresAt - Date.now() > 5 * 60 * 1000) {
    return accessToken
  }

  // Need to refresh
  const refreshToken = decrypt(account.encryptedRefreshToken)
  if (!refreshToken) {
    throw new Error(
      `No refresh token for ${account.email} — user must re-authenticate`
    )
  }

  const { clientId, clientSecret } = getClientCreds()
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  })

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const raw = await res.text()
  if (!res.ok) {
    throw new Error(`Token refresh failed for ${account.email}: ${raw}`)
  }
  const tok = JSON.parse(raw) as TokenResponse

  // Persist
  await db.gmailAccount.update({
    where: { id: account.id },
    data: {
      encryptedAccessToken: encrypt(tok.access_token),
      tokenExpiresAt: new Date(Date.now() + tok.expires_in * 1000),
      tokenScope: tok.scope,
    },
  })
  return tok.access_token
}

// ---------------------------------------------------------------------------
// 3. SEND EMAIL
// ---------------------------------------------------------------------------

export interface SendEmailInput {
  to: string
  subject: string
  bodyText: string
  replyToMessageId?: string // for threading
  fromName?: string
}

export interface SendEmailResult {
  gmailMessageId: string
  gmailThreadId: string
}

/** Send an email via Gmail. Returns Gmail message + thread IDs. */
export async function sendEmail(
  account: GmailAccount,
  input: SendEmailInput
): Promise<SendEmailResult> {
  const accessToken = await getValidAccessToken(account)

  // Build RFC 2822 message
  const fromHeader = input.fromName
    ? `From: "${input.fromName}" <${account.email}>`
    : `From: ${account.email}`
  const headers = [
    fromHeader,
    `To: ${input.to}`,
    `Subject: ${input.subject}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    `MIME-Version: 1.0`,
  ]
  if (input.replyToMessageId) {
    headers.push(`In-Reply-To: ${input.replyToMessageId}`)
    headers.push(`References: ${input.replyToMessageId}`)
  }

  const rawMessage = `${headers.join('\r\n')}\r\n\r\n${input.bodyText}\r\n`
  // Gmail expects base64url-encoded raw message
  const encoded = Buffer.from(rawMessage, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  const res = await fetch(`${GMAIL_API}/users/me/messages/send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: encoded }),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(`Gmail send failed: ${JSON.stringify(data)}`)
  }
  return {
    gmailMessageId: data.id as string,
    gmailThreadId: data.threadId as string,
  }
}

// ---------------------------------------------------------------------------
// 4. INBOX MONITORING — find new replies in threads we started
// ---------------------------------------------------------------------------

export interface InboundReply {
  gmailMessageId: string
  gmailThreadId: string
  inReplyTo?: string
  fromAddress: string
  subject: string
  bodyText: string
  receivedAt: Date
}

/**
 * List messages in the inbox that arrived after a given historyId / time.
 * We only care about messages whose threadId matches a thread WE started.
 *
 * Approach: list inbox messages (max 25), filter to those whose threadId
 * exists in our email_logs as an OUTREACH/AUTO_REPLY we sent, and that
 * we haven't yet recorded as INBOUND_REPLY.
 */
export async function listNewReplies(
  account: GmailAccount,
  knownThreadIds: Set<string>
): Promise<InboundReply[]> {
  const accessToken = await getValidAccessToken(account)
  const res = await fetch(
    `${GMAIL_API}/users/me/messages?q=in:inbox newer_than:7d&maxResults=25`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  const data = await res.json()
  if (!res.ok) {
    throw new Error(`Gmail list failed: ${JSON.stringify(data)}`)
  }
  const messageIds: string[] = (data.messages ?? []).map((m: { id: string }) => m.id)

  const out: InboundReply[] = []
  for (const id of messageIds) {
    const msg = await fetchMessage(account, id)
    if (!msg) continue
    // Only inbound messages in threads we know
    if (!knownThreadIds.has(msg.gmailThreadId)) continue
    // Skip our own sent messages
    if (msg.fromAddress.toLowerCase() === account.email.toLowerCase()) continue
    out.push(msg)
  }
  return out
}

async function fetchMessage(
  account: GmailAccount,
  messageId: string
): Promise<InboundReply | null> {
  const accessToken = await getValidAccessToken(account)
  const res = await fetch(
    `${GMAIL_API}/users/me/messages/${messageId}?format=full`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  if (!res.ok) return null
  const msg = await res.json()

  const headers: Record<string, string> = {}
  for (const h of msg.payload?.headers ?? []) {
    headers[h.name.toLowerCase()] = h.value
  }

  const bodyText = extractTextFromBody(msg.payload)

  // Internal date is ms since epoch (as a string)
  const receivedAt = new Date(parseInt(msg.internalDate, 10))

  return {
    gmailMessageId: msg.id,
    gmailThreadId: msg.threadId,
    inReplyTo: headers['in-reply-to'],
    fromAddress: parseEmailAddress(headers.from || ''),
    subject: headers.subject || '(no subject)',
    bodyText,
    receivedAt,
  }
}

function parseEmailAddress(from: string): string {
  // "John Doe <john@example.com>" → john@example.com
  const m = from.match(/<([^>]+)>/)
  return m ? m[1] : from.trim()
}

function extractTextFromBody(payload: unknown): string {
  // Walk the MIME tree, collect text/plain parts
  const parts: string[] = []
  function walk(node: any) {
    if (!node) return
    if (node.mimeType === 'text/plain' && node.body?.data) {
      const data = node.body.data.replace(/-/g, '+').replace(/_/g, '/')
      parts.push(Buffer.from(data, 'base64').toString('utf-8'))
    }
    if (node.parts) {
      for (const p of node.parts) walk(p)
    }
  }
  walk(payload)
  return parts.join('\n').trim()
}

// ---------------------------------------------------------------------------
// 5. DAILY RATE LIMIT GUARD
// ---------------------------------------------------------------------------

/** Reset sentToday if it's a new day, then increment. Returns false if over limit. */
export async function tryIncrementDailySend(
  accountId: string,
  limit: number = 400
): Promise<boolean> {
  const account = await db.gmailAccount.findUnique({ where: { id: accountId } })
  if (!account) return false

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  if (!account.sentDate || account.sentDate < today) {
    await db.gmailAccount.update({
      where: { id: accountId },
      data: { sentToday: 1, sentDate: today },
    })
    return true
  }

  if (account.sentToday >= limit) return false

  await db.gmailAccount.update({
    where: { id: accountId },
    data: { sentToday: { increment: 1 } },
  })
  return true
}
