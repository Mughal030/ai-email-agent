/**
 * POST /api/agent/recover
 *
 * Manual recovery trigger — resets the IMAP cursor and does a full inbox
 * scan to find + process any missed replies. Use this if:
 *   - You know a reply arrived but the app didn't detect it
 *   - The server was down and you want to catch up immediately
 *   - You want to force a full re-scan of the inbox
 *
 * Returns: { repliesProcessed, autoRepliesSent, errors }
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { processInboundReplies } from '@/lib/agent/loop'

export async function POST() {
  // Reset the lastSeenUid for all active accounts to force a full scan
  await db.gmailAccount.updateMany({
    where: { isActive: true },
    data: { lastSeenUid: 0 },
  })

  const result = await processInboundReplies()
  return NextResponse.json({
    ...result,
    message: 'Full inbox scan completed — all replies processed',
  })
}
