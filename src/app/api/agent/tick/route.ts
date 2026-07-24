/**
 * POST /api/agent/tick
 * Manually trigger one agent tick. Drains up to 5 queued leads, then
 * processes any new inbound replies. Returns a summary.
 *
 * In production this would be called by a cron / scheduler every N minutes.
 */
import { NextResponse } from 'next/server'
import { tick } from '@/lib/agent/loop'

export async function POST() {
  const result = await tick()
  return NextResponse.json(result)
}
