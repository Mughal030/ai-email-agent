/**
 * System prompts CRUD.
 * GET  /api/system-prompts          — list
 * POST /api/system-prompts          — create
 * PATCH /api/system-prompts/[id]    — update
 * DELETE /api/system-prompts/[id]   — delete
 *
 * Only one system prompt can be `isDefault=true` per user — enforced on save.
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureDemoUser } from '@/lib/auth'

export async function GET() {
  const userId = await ensureDemoUser()
  const list = await db.systemPrompt.findMany({
    where: { userId },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
  })
  return NextResponse.json({ prompts: list })
}

export async function POST(req: Request) {
  const userId = await ensureDemoUser()
  const body = await req.json()
  if (!body?.name || !body?.content) {
    return NextResponse.json(
      { error: 'name and content are required' },
      { status: 400 }
    )
  }

  // If this is being set as default, unset others first
  if (body.isDefault) {
    await db.systemPrompt.updateMany({
      where: { userId, isDefault: true },
      data: { isDefault: false },
    })
  }

  const sp = await db.systemPrompt.create({
    data: {
      userId,
      name: body.name,
      content: body.content,
      isDefault: Boolean(body.isDefault),
    },
  })
  return NextResponse.json({ prompt: sp }, { status: 201 })
}
