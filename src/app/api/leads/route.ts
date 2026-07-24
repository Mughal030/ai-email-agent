/**
 * POST /api/leads
 * Create a single lead. Required: name, email. Optional: company, role,
 * industry, companySize, notes, linkedinUrl, gmailAccountId, systemPromptId.
import { scoreLead } from '@/lib/leads/scoring'
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureDemoUser } from '@/lib/auth'

export async function POST(req: Request) {
  const userId = await ensureDemoUser()
  const body = await req.json()

  if (!body?.name || !body?.email) {
    return NextResponse.json(
      { error: 'name and email are required' },
      { status: 400 }
    )
  }

  // If no gmail account specified, pick the first active one for this user
  let gmailAccountId = body.gmailAccountId || null
  if (!gmailAccountId) {
    const account = await db.gmailAccount.findFirst({
      where: { userId, isActive: true },
    })
    gmailAccountId = account?.id || null
  }

  // If no system prompt specified, use the user's default
  let systemPromptId = body.systemPromptId || null
  if (!systemPromptId) {
    const sp = await db.systemPrompt.findFirst({
      where: { userId, isDefault: true },
    })
    systemPromptId = sp?.id || null
  }

  const lead = await db.lead.create({
    data: {
      userId,
      gmailAccountId,
      systemPromptId,
      name: body.name,
      email: body.email,
      company: body.company || null,
      role: body.role || null,
      industry: body.industry || null,
      companySize: body.companySize || null,
      notes: body.notes || null,
      linkedinUrl: body.linkedinUrl || null,
      status: 'PENDING',
    },
  })

  return NextResponse.json({ lead }, { status: 201 })
}

/**
 * DELETE /api/leads?leadId=xxx
 * Soft-deletes (archives) a lead.
 */
export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url)
  const leadId = searchParams.get('leadId')
  if (!leadId) {
    return NextResponse.json({ error: 'leadId required' }, { status: 400 })
  }
  await db.lead.update({
    where: { id: leadId },
    data: { isArchived: true },
  })
  return NextResponse.json({ ok: true })
}
