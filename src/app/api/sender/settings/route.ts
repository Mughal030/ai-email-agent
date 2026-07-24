/**
 * GET  /api/sender/settings  — fetch current sender settings
 * PATCH /api/sender/settings — update sender settings
 *
 * Settings managed:
 *   - sendingPaused (master start/stop)
 *   - dailySendLimit (default 50)
 *   - sendWindowStartHour / sendWindowEndHour (24h, sender tz)
 *   - senderTimezone
 *   - minMinutesBetweenSends
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureDemoUser } from '@/lib/auth'

export async function GET() {
  const userId = await ensureDemoUser()
  const account = await db.gmailAccount.findFirst({
    where: { userId, isActive: true },
  })
  if (!account) {
    return NextResponse.json({ error: 'No active sender account' }, { status: 404 })
  }
  return NextResponse.json({
    account: {
      id: account.id,
      email: account.email,
      displayName: account.displayName,
      sendingPaused: account.sendingPaused,
      dailySendLimit: account.dailySendLimit,
      sendWindowStartHour: account.sendWindowStartHour,
      sendWindowEndHour: account.sendWindowEndHour,
      senderTimezone: account.senderTimezone,
      minMinutesBetweenSends: account.minMinutesBetweenSends,
      sentToday: account.sentToday,
      isActive: account.isActive,
    },
  })
}

export async function PATCH(req: Request) {
  const userId = await ensureDemoUser()
  const body = await req.json()
  const account = await db.gmailAccount.findFirst({
    where: { userId, isActive: true },
  })
  if (!account) {
    return NextResponse.json({ error: 'No active sender account' }, { status: 404 })
  }

  const updated = await db.gmailAccount.update({
    where: { id: account.id },
    data: {
      sendingPaused: body.sendingPaused,
      dailySendLimit: body.dailySendLimit ? Number(body.dailySendLimit) : undefined,
      sendWindowStartHour: body.sendWindowStartHour != null ? Number(body.sendWindowStartHour) : undefined,
      sendWindowEndHour: body.sendWindowEndHour != null ? Number(body.sendWindowEndHour) : undefined,
      senderTimezone: body.senderTimezone,
      minMinutesBetweenSends: body.minMinutesBetweenSends != null ? Number(body.minMinutesBetweenSends) : undefined,
    },
  })

  return NextResponse.json({ account: updated })
}
