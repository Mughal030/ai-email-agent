/**
 * POST /api/lead-research/search
 *
 * Body: { industry?, location?, keywords?, numLeads? }
 *
 * Runs the full lead research pipeline:
 *   1. Web search for real companies matching criteria
 *   2. AI analysis (Nemotron) — scores each company 0-100
 *   3. Generates outreach pack (Mistral) — cold email + LinkedIn + followups
 *   4. Saves to LeadResearch table
 *
 * Returns: { totalFound, analyzed, saved, errors, topLeads }
 *
 * NOTE: This is a long-running operation (~20s per lead due to AI calls).
 * The client should show a loading spinner.
 */
import { NextResponse } from 'next/server'
import { ensureDemoUser } from '@/lib/auth'
import { researchLeads } from '@/lib/leads/research'

export const runtime = 'nodejs'
export const maxDuration = 600 // 10 min for large research jobs

export async function POST(req: Request) {
  const userId = await ensureDemoUser()
  const body = await req.json()

  const { industry, location, keywords, numLeads } = body || {}

  if (!industry && !location && !keywords) {
    return NextResponse.json(
      { error: 'At least one of industry, location, or keywords is required' },
      { status: 400 }
    )
  }

  try {
    const result = await researchLeads(userId, {
      industry,
      location,
      keywords,
      numLeads: numLeads ? Math.min(20, Number(numLeads)) : 10,
    })
    return NextResponse.json(result)
  } catch (e) {
    console.error('[lead-research] failed:', e)
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    )
  }
}
