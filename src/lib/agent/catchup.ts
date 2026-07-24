/**
 * ============================================================================
 * STARTUP CATCHUP — runs on server start to process missed replies
 * ============================================================================
 *
 * When the sandbox/server restarts (e.g. user comes back to chat), there may
 * be replies that arrived while the server was down. The normal 60s poller
 * only checks for NEW messages (UID > lastSeenUid). This catchup routine
 * does a FULL inbox scan and processes any replies that:
 *   1. Are replies to our sent emails (match In-Reply-To header)
 *   2. Haven't been recorded as INBOUND_REPLY in the EmailLog table yet
 *
 * This runs ONCE on startup, BEFORE the regular scheduler starts.
 * After catchup completes, the normal 60s reply poller + 5min full tick
 * take over.
 * ============================================================================
 */

import { db } from '@/lib/db'
import { processInboundReplies } from '@/lib/agent/loop'

let catchupStarted = false

export async function runStartupCatchup(): Promise<void> {
  if (catchupStarted) return
  catchupStarted = true

  // Wait 10s for the server to fully start
  await new Promise((r) => setTimeout(r, 10000))

  console.log('[catchup] Running startup catchup — scanning for missed replies...')

  try {
    // Reset the lastSeenUid to 0 so the IMAP poller scans ALL messages
    // (the processInboundReplies function will re-scan the full inbox)
    const accounts = await db.gmailAccount.findMany({
      where: { isActive: true },
    })

    for (const account of accounts) {
      // Temporarily reset the cursor to force a full scan
      await db.gmailAccount.update({
        where: { id: account.id },
        data: { lastSeenUid: 0 },
      })
    }

    // Now run the reply processor — it will scan ALL messages and
    // process any that match our sent emails but aren't yet recorded
    const result = await processInboundReplies()

    console.log(
      `[catchup] Catchup complete: found ${result.repliesProcessed} missed replies, ` +
      `auto-replied to ${result.autoRepliesSent}`
    )

    if (result.errors.length > 0) {
      console.error('[catchup] Errors:', result.errors.slice(0, 3))
    }
  } catch (e) {
    console.error('[catchup] Failed:', e)
  }
}
