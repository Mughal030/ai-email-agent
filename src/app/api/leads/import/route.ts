/**
 * POST /api/leads/import
 * Bulk import leads from a CSV string OR JSON array.
 * Body: { format: 'csv' | 'json', data: string }
 *
 * CSV columns expected: name,email,company,role,industry,companySize,notes,linkedinUrl
 * (only name + email required; rest optional)
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureDemoUser } from '@/lib/auth'

interface ParsedLead {
  name: string
  email: string
  company?: string
  role?: string
  industry?: string
  companySize?: string
  notes?: string
  linkedinUrl?: string
}

function parseCsv(text: string): ParsedLead[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean)
  if (lines.length === 0) return []
  const header = lines[0].split(',').map((h) => h.trim().toLowerCase())
  const idx = (k: string) => header.indexOf(k)
  const out: ParsedLead[] = []
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.trim())
    const lead: ParsedLead = {
      name: cols[idx('name')] || '',
      email: cols[idx('email')] || '',
    }
    if (idx('company') >= 0) lead.company = cols[idx('company')]
    if (idx('role') >= 0) lead.role = cols[idx('role')]
    if (idx('industry') >= 0) lead.industry = cols[idx('industry')]
    if (idx('companysize') >= 0) lead.companySize = cols[idx('companysize')]
    if (idx('notes') >= 0) lead.notes = cols[idx('notes')]
    if (idx('linkedinurl') >= 0) lead.linkedinUrl = cols[idx('linkedinurl')]
    if (lead.name && lead.email) out.push(lead)
  }
  return out
}

export async function POST(req: Request) {
  const userId = await ensureDemoUser()
  const body = await req.json()
  if (!body?.data) {
    return NextResponse.json({ error: 'data required' }, { status: 400 })
  }

  let leads: ParsedLead[] = []
  if (body.format === 'csv') {
    leads = parseCsv(String(body.data))
  } else {
    leads = Array.isArray(body.data) ? body.data : JSON.parse(body.data)
  }

  if (leads.length === 0) {
    return NextResponse.json({ error: 'no leads parsed' }, { status: 400 })
  }

  const account = await db.gmailAccount.findFirst({
    where: { userId, isActive: true },
  })
  const sp = await db.systemPrompt.findFirst({
    where: { userId, isDefault: true },
  })

  let created = 0
  let skipped = 0
  for (const l of leads) {
    if (!l.name || !l.email) {
      skipped++
      continue
    }
    try {
      await db.lead.create({
        data: {
          userId,
          gmailAccountId: account?.id || null,
          systemPromptId: sp?.id || null,
          name: l.name,
          email: l.email,
          company: l.company || null,
          role: l.role || null,
          industry: l.industry || null,
          companySize: l.companySize || null,
          notes: l.notes || null,
          linkedinUrl: l.linkedinUrl || null,
          status: 'PENDING',
        },
      })
      created++
    } catch {
      skipped++
    }
  }

  return NextResponse.json({ created, skipped, total: leads.length })
}
