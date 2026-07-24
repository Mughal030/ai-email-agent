/**
 * POST /api/sender/schedule
 *
 * Re-runs the smart scheduler for all QUEUED leads that don't yet have
 * a scheduledFor time. Use this after queuing new leads or after
 * changing sender settings (daily limit, send window, timezone).
 */
import { NextResponse } from 'next/server'
import { ensureDemoUser } from '@/lib/auth'
import { scheduleAllQueuedLeads } from '@/lib/agent/scheduler'

export async function POST() {
  const userId = await ensureDemoUser()
  const result = await scheduleAllQueuedLeads(userId)
  return NextResponse.json(result)
}
