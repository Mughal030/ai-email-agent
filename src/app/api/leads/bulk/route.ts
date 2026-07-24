/**
 * POST /api/leads/bulk
 *
 * Bulk actions on multiple leads. Body:
 *   { action: 'queue' | 'unqueue' | 'archive' | 'delete' | 'set_status',
 *     leadIds: string[], status?: LeadStatus }
 *
 * Returns: { updated: number }
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureDemoUser } from '@/lib/auth'
import { scheduleAllQueuedLeads } from '@/lib/agent/scheduler'

export async function POST(req: Request) {
  const userId = await ensureDemoUser()
  const body = await req.json()
  const { action, leadIds, status } = body || {}

  if (!action || !Array.isArray(leadIds) || leadIds.length === 0) {
    return NextResponse.json(
      { error: 'action and leadIds[] required' },
      { status: 400 }
    )
  }

  let updated = 0

  switch (action) {
    case 'queue': {
      const r = await db.lead.updateMany({
        where: { id: { in: leadIds }, userId, status: 'PENDING' },
        data: { status: 'QUEUED', queuedAt: new Date() },
      })
      updated = r.count
      // Schedule the newly-queued leads
      await scheduleAllQueuedLeads(userId)
      break
    }
    case 'unqueue': {
      const r = await db.lead.updateMany({
        where: { id: { in: leadIds }, userId, status: 'QUEUED' },
        data: { status: 'PENDING', queuedAt: null, scheduledFor: null },
      })
      updated = r.count
      break
    }
    case 'archive': {
      const r = await db.lead.updateMany({
        where: { id: { in: leadIds }, userId },
        data: { isArchived: true },
      })
      updated = r.count
      break
    }
    case 'set_status': {
      if (!status) {
        return NextResponse.json({ error: 'status required' }, { status: 400 })
      }
      const r = await db.lead.updateMany({
        where: { id: { in: leadIds }, userId },
        data: { status },
      })
      updated = r.count
      break
    }
    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  }

  return NextResponse.json({ updated })
}
