/**
 * PATCH /api/leads/[id]
 * Update a lead's fields (e.g. assign to a different Gmail account).
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json()
  const lead = await db.lead.update({
    where: { id },
    data: {
      name: body.name,
      email: body.email,
      company: body.company,
      role: body.role,
      industry: body.industry,
      companySize: body.companySize,
      notes: body.notes,
      linkedinUrl: body.linkedinUrl,
      gmailAccountId: body.gmailAccountId,
      systemPromptId: body.systemPromptId,
      status: body.status,
    },
  })
  return NextResponse.json({ lead })
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  await db.lead.update({
    where: { id },
    data: { isArchived: true },
  })
  return NextResponse.json({ ok: true })
}
