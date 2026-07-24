/**
 * DELETE /api/gmail/accounts/[id]
 * Removes a Gmail account. Does NOT delete leads — they are reassigned to
 * gmailAccountId=null and status=FAILED if they were queued.
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  // Null out leads that pointed to this account
  await db.lead.updateMany({
    where: { gmailAccountId: id, status: { in: ['QUEUED', 'PENDING'] } },
    data: { gmailAccountId: null, status: 'FAILED' },
  })
  await db.gmailAccount.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
