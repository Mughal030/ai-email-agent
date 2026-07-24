/**
 * ============================================================================
 * IMAP INBOX POLLER (real, via imapflow + Gmail app password)
 * ============================================================================
 *
 * Replaces the previous Gmail REST API inbox reader. Connects to
 * imap.gmail.com:993 and pulls new INBOX messages whose References /
 * In-Reply-To header matches one of OUR sent Message-IDs.
 *
 * Approach:
 *   1. Open INBOX read-only.
 *   2. Fetch all UIDs > account.lastSeenUid (or last 50 if first poll).
 *   3. For each fetched message, check if its References/In-Reply-To
 *      header contains a Message-ID we generated (i.e., it's a reply
 *      to one of our sent emails).
 *   4. Match the lead by the From address.
 *   5. Return the new InboundReply[] for the agent loop to process.
 * ============================================================================
 */

import { ImapFlow, type ImapFlowOptions } from 'imapflow'
import { db } from '@/lib/db'
import { decrypt } from '@/lib/crypto'
import type { GmailAccount } from '@prisma/client'
import { simpleParser } from 'mailparser'

export interface InboundReply {
  imapUid: number
  smtpMessageId: string         // RFC822 Message-ID of THIS reply
  inReplyTo?: string             // The Message-ID it's replying to (one of ours)
  fromAddress: string
  fromName: string
  subject: string
  bodyText: string
  receivedAt: Date
}

async function getImapConfig(account: GmailAccount): Promise<ImapFlowOptions> {
  let pass: string | undefined
  if (account.encryptedSmtpPass) {
    try {
      pass = decrypt(account.encryptedSmtpPass)
    } catch {
      pass = undefined
    }
  }
  if (!pass) pass = process.env.IMAP_PASS || process.env.SMTP_PASS
  if (!pass) {
    throw new Error(`No IMAP password for ${account.email}`)
  }

  return {
    host: account.imapHost || process.env.IMAP_HOST || 'imap.gmail.com',
    port: account.imapPort || Number(process.env.IMAP_PORT) || 993,
    secure: true,
    auth: { user: account.email, pass },
    logger: false,
  }
}

/**
 * Fetch new inbound replies. Returns only messages whose References or
 * In-Reply-To header contains a Message-ID we generated.
 *
 * ALWAYS scans ALL inbox messages (1:*) — not just UIDs > lastSeenUid.
 * This ensures we never miss a reply even if:
 *   - The cursor advanced past a reply that arrived between polls
 *   - The server was down and restarted (catchup mode)
 *   - A previous poll failed mid-way
 *
 * Deduplication is handled by the caller (processInboundReplies) which
 * checks the EmailLog table for already-processed smtpMessageIds.
 */
export async function listNewReplies(
  account: GmailAccount,
  ourMessageIds: Set<string>
): Promise<InboundReply[]> {
  if (ourMessageIds.size === 0) {
    console.log('[imap] No sent message IDs to match against — skipping scan')
    return []
  }

  const config = await getImapConfig(account)
  const client = new ImapFlow(config)

  try {
    await client.connect()
    const lock = await client.getMailboxLock('INBOX')
    const out: InboundReply[] = []
    let scanned = 0
    let matched = 0

    try {
      // Always scan ALL messages — dedup is handled downstream
      const range = '1:*'

      const messages = client.fetch(range, {
        uid: true,
        envelope: true,
        headers: true,
        source: true,
        internalDate: true,
      })

      let maxUid = account.lastSeenUid

      for await (const msg of messages) {
        scanned++
        if (msg.uid > maxUid) maxUid = msg.uid

        // Parse headers to find References / In-Reply-To
        const headersStr = (msg.headers as Buffer)?.toString('utf-8') || ''
        const inReplyTo = matchHeader(headersStr, 'in-reply-to')
        const references = matchHeader(headersStr, 'references')

        // Normalize: strip angle brackets and whitespace for comparison
        const normalizeId = (s: string) => s.trim().replace(/^<|>$/g, '')
        const ourIdsNormalized = new Set(
          Array.from(ourMessageIds).map(normalizeId)
        )

        // Check if any of OUR message IDs appear in the references
        const allRefs = [inReplyTo, ...(references?.split(/\s+/) || [])]
          .filter(Boolean)
          .map((s) => normalizeId(s))

        const matchesOneOfOurs = allRefs.some((r) => ourIdsNormalized.has(r))
        if (!matchesOneOfOurs) continue

        matched++

        // Parse the full source to get the body text
        const source = msg.source as Buffer
        const parsed = await simpleParser(source)

        // Skip auto-responders / bounces
        const fromAddr = parsed.from?.value?.[0]?.address || ''
        if (!fromAddr) continue
        if (fromAddr.toLowerCase() === account.email.toLowerCase()) continue
        if (
          fromAddr.includes('mailer-daemon') ||
          fromAddr.includes('postmaster') ||
          fromAddr.includes('no-reply') ||
          fromAddr.includes('noreply')
        ) {
          continue
        }

        out.push({
          imapUid: msg.uid,
          smtpMessageId: parsed.messageId || `<unknown-${msg.uid}>`,
          inReplyTo: inReplyTo || undefined,
          fromAddress: fromAddr,
          fromName: parsed.from?.value?.[0]?.name || fromAddr,
          subject: parsed.subject || '(no subject)',
          bodyText: parsed.text || parsed.textAsHtml || '',
          receivedAt: parsed.date || msg.internalDate || new Date(),
        })
      }

      // Update cursor (but don't let it prevent re-scanning — we always scan 1:*)
      if (maxUid > account.lastSeenUid) {
        await db.gmailAccount.update({
          where: { id: account.id },
          data: { lastSeenUid: maxUid, lastPollAt: new Date() },
        })
      }

      console.log(
        `[imap] Scanned ${scanned} messages, ${matched} matched our sent emails, ` +
        `${out.length} are valid replies from real people`
      )

      return out
    } finally {
      lock.release()
    }
  } catch (e) {
    console.error('[imap] listNewReplies failed:', e)
    return []
  } finally {
    await client.logout().catch(() => {})
  }
}

function matchHeader(headersStr: string, name: string): string | undefined {
  // Headers are line-wrapped; find "Name: value" possibly spanning multiple lines
  const re = new RegExp(`^${name}:\\s*(.+?)(?=^[^\\s]+:|$)`, 'ims')
  const m = headersStr.match(re)
  if (!m) return undefined
  return m[1].replace(/\r?\n\s+/g, ' ').trim()
}

/** Test IMAP connectivity. Used by dashboard connect flow. */
export async function verifyImap(email: string, pass: string): Promise<boolean> {
  const client = new ImapFlow({
    host: process.env.IMAP_HOST || 'imap.gmail.com',
    port: Number(process.env.IMAP_PORT) || 993,
    secure: true,
    auth: { user: email, pass },
    logger: false,
  })
  try {
    await client.connect()
    await client.logout()
    return true
  } catch (e) {
    console.error('[imap] verify failed:', e)
    return false
  }
}
