/**
 * POST /api/agent/check-replies
 *
 * Manually triggers IMAP inbox polling + reply processing. Use this when
 * you know a reply arrived but the 5-min scheduler hasn't picked it up yet.
 *
 * Returns the result of processInboundReplies():
 *   { repliesProcessed, autoRepliesSent, errors }
 */
import { NextResponse } from 'next/server'
import { processInboundReplies } from '@/lib/agent/loop'

export async function POST() {
  const result = await processInboundReplies()
  return NextResponse.json(result)
}
