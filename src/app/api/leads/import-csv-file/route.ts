/**
 * POST /api/leads/import-csv-file
 * Imports leads from a CSV file already on the server filesystem.
 *
 * Body: { filePath: string, limit?: number }
 *
 * Designed for files uploaded via the IM gateway to /home/z/my-project/upload/
 * but works with any server path.
 *
 * Handles rich lead exports (66-column format from sales tools) by
 * extracting the most useful fields and packing enrichment data
 * (headline, summary, company description) into the notes field.
 */
import { NextResponse } from 'next/server'
import { ensureDemoUser } from '@/lib/auth'
import { importLeadsFromCsvFile } from '@/lib/leads/csv-import'
import { existsSync, statSync } from 'fs'

export async function POST(req: Request) {
  const userId = await ensureDemoUser()
  const body = await req.json()
  const { filePath, limit } = body || {}

  if (!filePath) {
    return NextResponse.json({ error: 'filePath required' }, { status: 400 })
  }

  // Security: restrict to the upload dir + tmp + project dir
  const allowed = [
    '/home/z/my-project/upload/',
    '/home/z/my-project/tmp/',
    '/tmp/',
  ]
  const isAllowed = allowed.some((p) => filePath.startsWith(p))
  if (!isAllowed) {
    return NextResponse.json(
      {
        error: `File must be in one of: ${allowed.join(', ')}`,
      },
      { status: 403 }
    )
  }

  if (!existsSync(filePath)) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }

  const stat = statSync(filePath)
  if (stat.size > 50 * 1024 * 1024) {
    return NextResponse.json(
      { error: 'File too large (max 50MB)' },
      { status: 413 }
    )
  }

  try {
    const result = await importLeadsFromCsvFile(filePath, userId, {
      limit: limit ? Number(limit) : undefined,
    })
    return NextResponse.json(result)
  } catch (e) {
    console.error('[import-csv] failed:', e)
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    )
  }
}
