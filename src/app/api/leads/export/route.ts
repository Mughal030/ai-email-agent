/**
 * GET /api/leads/export
 *
 * Exports ALL leads in the unified table as a CSV file download.
 * Includes: name, email, company, role, industry, companySize, status,
 * linkedinUrl, notes, sentAt, repliedAt, createdAt.
 *
 * Useful for: backups, sharing with team, re-uploading after edits.
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureDemoUser } from '@/lib/auth'

function csvEscape(s: string | null | undefined): string {
  if (s == null) return ''
  // Escape quotes by doubling, wrap in quotes if contains comma/quote/newline
  const escaped = s.replace(/"/g, '""')
  if (/[",\n\r]/.test(escaped)) {
    return `"${escaped}"`
  }
  return escaped
}

export async function GET() {
  const userId = await ensureDemoUser()
  const leads = await db.lead.findMany({
    where: { userId, isArchived: false },
    orderBy: { createdAt: 'desc' },
    take: 10000,
  })

  const headers = [
    'name', 'email', 'company', 'role', 'industry', 'companySize',
    'status', 'linkedinUrl', 'notes', 'sentAt', 'repliedAt', 'createdAt',
  ]

  const lines = [headers.join(',')]
  for (const l of leads) {
    lines.push(
      [
        csvEscape(l.name),
        csvEscape(l.email),
        csvEscape(l.company),
        csvEscape(l.role),
        csvEscape(l.industry),
        csvEscape(l.companySize),
        csvEscape(l.status),
        csvEscape(l.linkedinUrl),
        csvEscape(l.notes),
        csvEscape(l.sentAt?.toISOString() || ''),
        csvEscape(l.repliedAt?.toISOString() || ''),
        csvEscape(l.createdAt.toISOString()),
      ].join(',')
    )
  }

  const csv = lines.join('\n')
  const filename = `leads-export-${new Date().toISOString().slice(0, 10)}.csv`

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
