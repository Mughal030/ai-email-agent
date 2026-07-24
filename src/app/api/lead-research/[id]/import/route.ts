/**
 * POST /api/lead-research/[id]/import
 * Pushes a researched lead into the main leads pipeline.
 * Returns the new lead ID.
 */
import { NextResponse } from 'next/server'
import { ensureDemoUser } from '@/lib/auth'
import { importResearchToPipeline } from '@/lib/leads/research'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const userId = await ensureDemoUser()
  const leadId = await importResearchToPipeline(id, userId)
  if (!leadId) {
    return NextResponse.json({ error: 'Research lead not found' }, { status: 404 })
  }
  return NextResponse.json({ leadId })
}
