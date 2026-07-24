/**
 * GET /api/sender/status
 *
 * Returns real-time sender status: paused state, daily quota usage,
 * send window, next scheduled send, and the upcoming send queue.
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureDemoUser } from '@/lib/auth'
import { canSendNow } from '@/lib/agent/scheduler'

export async function GET() {
  const userId = await ensureDemoUser()
  const account = await db.gmailAccount.findFirst({
    where: { userId, isActive: true },
  })
  if (!account) {
    return NextResponse.json({ error: 'No active sender account' }, { status: 404 })
  }

  const guard = await canSendNow(account)

  // Upcoming scheduled sends (next 10)
  const upcoming = await db.lead.findMany({
    where: {
      userId,
      status: 'QUEUED',
      scheduledFor: { gte: new Date() },
    },
    orderBy: { scheduledFor: 'asc' },
    take: 10,
    select: {
      id: true,
      name: true,
      email: true,
      company: true,
      industry: true,
      scheduledFor: true,
    },
  })

  // Today's sent count (already in sentToday but let's also count from logs)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const sentToday = await db.emailLog.count({
    where: {
      gmailAccountId: account.id,
      direction: 'OUTREACH',
      status: 'SENT',
      sentAt: { gte: today },
    },
  })

  // Counts by status
  const queued = await db.lead.count({ where: { userId, status: 'QUEUED' } })
  const pending = await db.lead.count({ where: { userId, status: 'PENDING' } })
  const sent = await db.lead.count({ where: { userId, status: 'SENT' } })

  return NextResponse.json({
    account: {
      email: account.email,
      displayName: account.displayName,
    },
    guard,
    sendingPaused: account.sendingPaused,
    dailySendLimit: account.dailySendLimit,
    sendWindowStartHour: account.sendWindowStartHour,
    sendWindowEndHour: account.sendWindowEndHour,
    senderTimezone: account.senderTimezone,
    minMinutesBetweenSends: account.minMinutesBetweenSends,
    sentToday,
    remainingToday: Math.max(0, account.dailySendLimit - sentToday),
    counts: { pending, queued, sent },
    upcoming,
  })
}
