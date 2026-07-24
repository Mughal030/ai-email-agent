/**
 * ============================================================================
 * PRODUCTION SCHEDULER — runs inside the Next.js server process
 * ============================================================================
 *
 * In development, we used a separate mini-service (port 3003) to trigger
 * agent ticks. In production (HuggingFace Spaces, Railway, etc.), we can't
 * run a second process, so this module starts a setInterval inside the
 * Next.js server itself.
 *
 * This file is imported once on server startup (from instrumentation.ts).
 * It pokes /api/agent/tick every 5 minutes — the same endpoint the manual
 * "Run Agent Tick" button uses.
 *
 * For HuggingFace Spaces: UptimeRobot also pings the app every 5 min to
 * prevent the space from sleeping. This scheduler runs IN ADDITION to
 * that, ensuring ticks fire even if UptimeRobot is down.
 * ============================================================================
 */

const TICK_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes (full tick: send + reply check)
const REPLY_POLL_INTERVAL_MS = 60 * 1000 // 60 seconds (fast reply-only poll)
const APP_URL = process.env.INTERNAL_APP_URL || 'http://localhost:3000'

let schedulerStarted = false
let tickCount = 0
let replyPollCount = 0

export function startScheduler() {
  if (schedulerStarted) return
  schedulerStarted = true

  // Don't start the scheduler during build time
  if (process.env.NEXT_PHASE === 'phase-production-build') return

  console.log(`[scheduler] Production scheduler starting`)
  console.log(`[scheduler]   Full tick every ${TICK_INTERVAL_MS / 1000}s (send + reply check)`)
  console.log(`[scheduler]   Fast reply poll every ${REPLY_POLL_INTERVAL_MS / 1000}s (reply check only)`)

  // Full tick: sends emails + checks replies + runs self-improvement
  async function runTick() {
    tickCount++
    try {
      const res = await fetch(`${APP_URL}/api/agent/tick`, {
        method: 'POST',
        signal: AbortSignal.timeout(4 * 60 * 1000), // 4 min timeout
      })
      const j = await res.json()
      console.log(
        `[scheduler] Tick #${tickCount}: processed=${j.processed} replies=${j.replies} ` +
        `errors=${j.errors?.length || 0} skipped=${j.skipped?.length || 0}`
      )
    } catch (e) {
      console.error(`[scheduler] Tick #${tickCount} failed:`, (e as Error).message)
    }
  }

  // Fast reply poll: ONLY checks inbox for new replies (no sending)
  // This runs every 60s so replies are detected within 1 minute
  async function runReplyPoll() {
    replyPollCount++
    try {
      const res = await fetch(`${APP_URL}/api/agent/check-replies`, {
        method: 'POST',
        signal: AbortSignal.timeout(90 * 1000), // 90s timeout
      })
      const j = await res.json()
      if (j.repliesProcessed > 0 || j.autoRepliesSent > 0) {
        console.log(
          `[scheduler] Reply poll #${replyPollCount}: found ${j.repliesProcessed} new replies, ` +
          `auto-replied to ${j.autoRepliesSent}`
        )
      }
    } catch (e) {
      // Silent — reply polling fails silently to avoid log spam
    }
  }

  // Run first full tick after 30s (let the server fully start)
  setTimeout(runTick, 30000)
  // Then every 5 minutes
  setInterval(runTick, TICK_INTERVAL_MS)

  // Start fast reply polling after 60s, then every 60s
  setTimeout(runReplyPoll, 60000)
  setInterval(runReplyPoll, REPLY_POLL_INTERVAL_MS)
}
