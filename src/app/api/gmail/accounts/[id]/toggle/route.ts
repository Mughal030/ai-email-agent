/**
 * PATCH /api/gmail/accounts/[id]/toggle
 * Toggles isActive on a Gmail account (pause/resume the agent for this sender).
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json()
  const account = await db.gmailAccount.update({
    where: { id },
    data: { isActive: Boolean(body.isActive) },
  })
  return NextResponse.json({ account })
}
