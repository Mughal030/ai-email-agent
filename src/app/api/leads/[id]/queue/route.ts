/**
 * POST /api/leads/[id]/queue
 * Move a lead from PENDING → QUEUED so the agent picks it up on the next tick.
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const lead = await db.lead.findUnique({ where: { id } })
  if (!lead) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  await db.lead.update({
    where: { id },
    data: { status: 'QUEUED', queuedAt: new Date() },
  })
  return NextResponse.json({ ok: true })
}
