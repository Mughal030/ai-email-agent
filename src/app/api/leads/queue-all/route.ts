/**
 * POST /api/leads/queue-all
 *
 * Bulk-queue all PENDING leads for sending. After queuing, automatically
 * runs the smart scheduler to assign each lead a `scheduledFor` time
 * based on:
 *   - daily limit (default 50/day)
 *   - send window (default 9 AM - 5 PM sender tz)
 *   - lead's inferred region (target their local 9 AM)
 *   - min gap between sends (default 3 min)
 *
 * Body: { limit?: number }  — optional cap on how many to queue
 *
 * Returns: {
 *   queued, scheduled, firstSendAt, lastSendAt,
 *   skipped, senderStatus
 * }
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureDemoUser } from '@/lib/auth'
import { scheduleAllQueuedLeads, canSendNow } from '@/lib/agent/scheduler'

export async function POST(req: Request) {
  const userId = await ensureDemoUser()
  const body = await req.json().catch(() => ({}))
  const limit = body?.limit ? Number(body.limit) : undefined

  // Get the active sender
  const account = await db.gmailAccount.findFirst({
    where: { userId, isActive: true },
  })
  if (!account) {
    return NextResponse.json(
      { error: 'No active sender account. Connect Gmail first.' },
      { status: 400 }
    )
  }

  // Find all PENDING leads
  const pending = await db.lead.findMany({
    where: { userId, status: 'PENDING', isArchived: false },
    orderBy: { createdAt: 'asc' },
    take: limit,
  })

  // Queue them all
  const queued = await db.lead.updateMany({
    where: { id: { in: pending.map((l) => l.id) } },
    data: { status: 'QUEUED', queuedAt: new Date() },
  })

  // Run the scheduler to assign send times
  const scheduleResult = await scheduleAllQueuedLeads(userId)

  // Check sender guard for status reporting
  const guard = await canSendNow(account)

  return NextResponse.json({
    queued: queued.count,
    scheduled: scheduleResult.scheduled,
    firstSendAt: scheduleResult.firstSendAt,
    lastSendAt: scheduleResult.lastSendAt,
    skipped: pending.length - queued.count,
    senderStatus: guard,
  })
}
