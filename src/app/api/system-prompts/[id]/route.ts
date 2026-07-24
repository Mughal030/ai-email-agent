import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureDemoUser } from '@/lib/auth'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const userId = await ensureDemoUser()
  const body = await req.json()

  if (body.isDefault) {
    await db.systemPrompt.updateMany({
      where: { userId, isDefault: true, NOT: { id } },
      data: { isDefault: false },
    })
  }

  const sp = await db.systemPrompt.update({
    where: { id },
    data: {
      name: body.name,
      content: body.content,
      isDefault: body.isDefault,
    },
  })
  return NextResponse.json({ prompt: sp })
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  await db.systemPrompt.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
