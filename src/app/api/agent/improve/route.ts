/**
 * POST /api/agent/improve
 * Manually trigger a self-improvement cycle.
 */
import { NextResponse } from 'next/server'
import { runSelfImprovementCycle } from '@/lib/agent/loop'

export async function POST() {
  const result = await runSelfImprovementCycle()
  return NextResponse.json(result)
}
