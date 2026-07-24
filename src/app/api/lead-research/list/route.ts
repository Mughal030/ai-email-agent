/**
 * GET /api/lead-research/list
 * Returns all researched leads, sorted by opportunity score (highest first).
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureDemoUser } from '@/lib/auth'

export async function GET() {
  const userId = await ensureDemoUser()
  const leads = await db.leadResearch.findMany({
    where: { userId },
    orderBy: [{ opportunityScore: 'desc' }, { createdAt: 'desc' }],
    take: 100,
  })
  return NextResponse.json({ leads })
}
