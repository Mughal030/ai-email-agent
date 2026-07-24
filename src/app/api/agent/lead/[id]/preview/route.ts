/**
 * POST /api/agent/lead/[id]/preview
 * Generates a preview of the AI's psychological analysis + draft email
 * WITHOUT sending anything. Uses the real multi-model pipeline.
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  analyzePsychology,
  draftOutreach,
  retrieveRelevantMemory,
} from '@/lib/ai/nvidia-agent'
import {
  isDemoMode,
  demoAnalyzePsychology,
  demoDraftOutreach,
} from '@/lib/ai/demo'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const lead = await db.lead.findUnique({
    where: { id },
    include: { systemPrompt: true, psychProfile: true },
  })
  if (!lead) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  const demo = isDemoMode()
  const memoryText = demo
    ? '(demo mode — no memory)'
    : (
        await retrieveRelevantMemory(lead.userId, {
          industry: lead.industry || '',
          role: lead.role || '',
          companySize: lead.companySize || '',
        })
      ).memoryText

  try {
    let analysis: any
    let draft: any

    if (demo) {
      analysis = demoAnalyzePsychology({ lead })
      draft = demoDraftOutreach({ lead, profile: lead.psychProfile })
    } else {
      const realAnalysis = await analyzePsychology({
        userId: lead.userId,
        systemPrompt: lead.systemPrompt,
        lead,
        memoryText,
      })
      analysis = realAnalysis
      const realDraft = await draftOutreach({
        userId: lead.userId,
        systemPrompt: lead.systemPrompt,
        lead,
        profile: lead.psychProfile,
        memoryText,
      })
      draft = realDraft
    }

    return NextResponse.json({
      demoMode: demo,
      lead: {
        id: lead.id,
        name: lead.name,
        email: lead.email,
        company: lead.company,
        role: lead.role,
        industry: lead.industry,
      },
      existingProfile: lead.psychProfile,
      analysis,
      draft,
      memoryText,
    })
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    )
  }
}
