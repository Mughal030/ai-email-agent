/**
 * POST /api/leads/detect-columns
 *
 * Body: { headers: string[], sampleRows: Record<string,string>[] }
 * Returns: { mapping, method, unmapped, aiReasoning? }
 *
 * Pure detection — does NOT import anything. Used by the UI to show
 * a preview of the column mapping before the user confirms import.
 */
import { NextResponse } from 'next/server'
import { ensureDemoUser } from '@/lib/auth'
import { detectColumns } from '@/lib/leads/column-detector'

export async function POST(req: Request) {
  const userId = await ensureDemoUser()
  const body = await req.json()

  if (!body?.headers || !Array.isArray(body.headers)) {
    return NextResponse.json(
      { error: 'headers array required' },
      { status: 400 }
    )
  }

  const sampleRows = Array.isArray(body.sampleRows) ? body.sampleRows.slice(0, 5) : []

  try {
    const result = await detectColumns(body.headers, sampleRows, { userId })
    return NextResponse.json(result)
  } catch (e) {
    console.error('[detect-columns] failed:', e)
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    )
  }
}
