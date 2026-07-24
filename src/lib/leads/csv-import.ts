/**
 * ============================================================================
 * CSV IMPORT SERVICE — handles rich lead exports from Google Sheets
import { scoreLead } from '@/lib/leads/scoring'
 * ============================================================================
 */

import { db } from '@/lib/db'
import { readFileSync } from 'fs'
import { parse as csvParse } from 'csv-parse/sync'

export interface CsvImportResult {
  created: number
  skipped: number
  duplicates: number
  errors: string[]
  total: number
  sampleCreated: Array<{ name: string; email: string; company: string | null }>
}

interface ParsedLead {
  name: string
  email: string
  company: string | null
  role: string | null
  industry: string | null
  companySize: string | null
  notes: string
  linkedinUrl: string | null
}

function mapRow(row: Record<string, string>): ParsedLead | null {
  const firstName = (row['First Name'] || row['firstName'] || '').trim()
  const lastName = (row['Last Name'] || row['lastName'] || '').trim()
  const name = [firstName, lastName].filter(Boolean).join(' ').trim()
  const email = (row['Email'] || row['email'] || '').trim().toLowerCase()

  if (!name || !email || !email.includes('@')) return null

  const company =
    (row['companyName'] || row['company'] || row['Company'] || '').trim() || null
  const role =
    (
      row['jobTitle'] ||
      row['role'] ||
      row['Role'] ||
      row['Title'] ||
      ''
    ).trim() || null
  const industry = (row['industry'] || row['Industry'] || '').trim() || null
  const companySize =
    (row['companyHeadCount'] || row['companySize'] || row['Company Size'] || '')
      .trim()
      .replace(/\s+/g, ' ') || null

  const headline = (row['headline'] || '').trim()
  const summary = (row['summary'] || '').trim()
  const companyDescription = (row['companyDescription'] || '').trim()
  const location = (row['location'] || '').trim()
  const department = (row['department'] || '').trim()
  const jobLevel = (row['jobLevel'] || '').trim()
  const subIndustry = (row['subIndustry'] || '').trim()
  const connectionCount = (row['connectionCount'] || '').trim()
  const companyDomain = (
    row['companyDomain'] ||
    row['companyWebsite'] ||
    ''
  ).trim()

  const notesParts: string[] = []
  if (headline) notesParts.push(`Headline: ${headline}`)
  if (jobLevel) notesParts.push(`Job level: ${jobLevel}`)
  if (department) notesParts.push(`Department: ${department}`)
  if (location) notesParts.push(`Location: ${location}`)
  if (subIndustry) notesParts.push(`Sub-industry: ${subIndustry}`)
  if (connectionCount) notesParts.push(`LinkedIn connections: ${connectionCount}`)
  if (companyDomain) notesParts.push(`Website: ${companyDomain}`)
  if (companyDescription) {
    const cd = companyDescription.slice(0, 400)
    notesParts.push(`Company: ${cd}`)
  }
  if (summary) {
    const s = summary.slice(0, 600)
    notesParts.push(`Bio: ${s}`)
  }

  let linkedinUrl = (row['linkedIn'] || row['linkedinUrl'] || '').trim()
  if (linkedinUrl && !linkedinUrl.startsWith('http')) {
    linkedinUrl = `https://${linkedinUrl}`
  }

  return {
    name: sanitizeText(name),
    email,
    company: sanitizeText(company),
    role: sanitizeText(role),
    industry: sanitizeText(industry),
    companySize: sanitizeText(companySize),
    notes: sanitizeText(notesParts.join('\n')),
    linkedinUrl: linkedinUrl || null,
  }
}

/**
 * Sanitize text for SQLite — strips characters that can break the
 * SQLite hex escape parser (\x followed by non-hex) and removes
 * other control characters that cause issues.
 *
 * Also strips HTML tags (<br>, <p>, etc.) and mathematical unicode
 * variants (𝗜, 𝗺, 𝐅 — bold/italic mathematical alphanumeric symbols)
 * that confuse some SQLite builds.
 */
function sanitizeText(s: string | null): string | null {
  if (!s) return s
  // Remove NUL bytes and other control chars (except newline/tab)
  let out = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
  // Strip HTML tags (the source CSV has <br> tags in summary fields)
  out = out.replace(/<[^>]+>/g, ' ')
  // Escape any backslash that's followed by 'x' but not a valid hex pair
  out = out.replace(/\\x(?![0-9a-fA-F]{2})/g, '\\\\x')
  // Also escape stray backslashes
  out = out.replace(/\\(?!x[0-9a-fA-F]{2}|n|r|t|\\|'|")/g, '\\\\')
  // Normalize mathematical alphanumeric symbols (𝗜 → I, 𝗺 → m, etc.)
  // These are unicode plane 1 chars (U+1D400-U+1D7FF) — replace with
  // their ASCII equivalents
  out = out.replace(/[\u{1D400}-\u{1D7FF}]/gu, (ch) => {
    const cp = ch.codePointAt(0)!
    // Bold italic / bold / italic mathematical letters → ASCII
    let base = 0
    if (cp >= 0x1d400 && cp <= 0x1d433) base = 0x41 // A-Z (bold)
    else if (cp >= 0x1d434 && cp <= 0x1d467) base = 0x61 // a-z (bold)
    else if (cp >= 0x1d468 && cp <= 0x1d49b) base = 0x41 // A-Z (italic)
    else if (cp >= 0x1d49c && cp <= 0x1d4cf) base = 0x61 // a-z (italic)
    else if (cp >= 0x1d4d0 && cp <= 0x1d503) base = 0x41 // A-Z (bold italic)
    else if (cp >= 0x1d504 && cp <= 0x1d537) base = 0x61 // a-z (bold italic)
    else if (cp >= 0x1d538 && cp <= 0x1d56b) base = 0x41 // A-Z (sans-serif)
    else if (cp >= 0x1d56c && cp <= 0x1d59f) base = 0x61 // a-z (sans-serif)
    else if (cp >= 0x1d5a0 && cp <= 0x1d5d3) base = 0x41 // A-Z (sans-serif bold)
    else if (cp >= 0x1d5d4 && cp <= 0x1d607) base = 0x61 // a-z (sans-serif bold)
    else if (cp >= 0x1d608 && cp <= 0x1d63b) base = 0x41 // A-Z (sans-serif italic)
    else if (cp >= 0x1d63c && cp <= 0x1d66f) base = 0x61 // a-z (sans-serif italic)
    else if (cp >= 0x1d670 && cp <= 0x1d6a3) base = 0x41 // A-Z (sans-serif bold italic)
    else if (cp >= 0x1d6a4 && cp <= 0x1d6a5) return 'i' // italic i, j
    else if (cp >= 0x1d6a6 && cp <= 0x1d6d7) base = 0x41 // A-Z (monospace)
    else if (cp >= 0x1d6d8 && cp <= 0x1d70b) base = 0x61 // a-z (monospace)
    else if (cp >= 0x1d7ce && cp <= 0x1d7d7) return String(cp - 0x1d7ce) // bold digits
    if (base) {
      const offset = (cp - 0x1d400) % 26
      // Determine if upper or lower based on the range
      const isLower =
        (cp >= 0x1d434 && cp <= 0x1d467) ||
        (cp >= 0x1d49c && cp <= 0x1d4cf) ||
        (cp >= 0x1d504 && cp <= 0x1d537) ||
        (cp >= 0x1d56c && cp <= 0x1d59f) ||
        (cp >= 0x1d5d4 && cp <= 0x1d607) ||
        (cp >= 0x1d63c && cp <= 0x1d66f) ||
        (cp >= 0x1d6d8 && cp <= 0x1d70b)
      return String.fromCharCode(
        isLower ? 0x61 + offset : 0x41 + offset
      )
    }
    return ch
  })
  // Collapse whitespace runs
  out = out.replace(/[ \t]+/g, ' ')
  // Cap length to avoid any TEXT column issues
  if (out.length > 4000) out = out.slice(0, 4000)
  return out
}

export async function importLeadsFromCsvFile(
  filePath: string,
  userId: string,
  options: { limit?: number } = {}
): Promise<CsvImportResult> {
  const fileContent = readFileSync(filePath, 'utf-8')

  let records: Record<string, string>[]
  try {
    records = csvParse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_quotes: true,
      relax_column_count: true,
    })
  } catch (e) {
    return {
      created: 0,
      skipped: 0,
      duplicates: 0,
      errors: [`CSV parse failed: ${(e as Error).message}`],
      total: 0,
      sampleCreated: [],
    }
  }

  const total = records.length
  if (options.limit && options.limit > 0) {
    records = records.slice(0, options.limit)
  }

  const account = await db.gmailAccount.findFirst({
    where: { userId, isActive: true },
  })
  const sp = await db.systemPrompt.findFirst({
    where: { userId, isDefault: true },
  })

  const emailsInBatch = new Set<string>()
  const parsedLeads: ParsedLead[] = []
  let skipped = 0

  for (const row of records) {
    const parsed = mapRow(row)
    if (!parsed) {
      skipped++
      continue
    }
    if (emailsInBatch.has(parsed.email)) {
      skipped++
      continue
    }
    emailsInBatch.add(parsed.email)
    parsedLeads.push(parsed)
  }

  const existing = await db.lead.findMany({
    where: { userId, email: { in: Array.from(emailsInBatch) } },
    select: { email: true },
  })
  const existingEmails = new Set(existing.map((l) => l.email.toLowerCase()))

  let created = 0
  let duplicates = 0
  const errors: string[] = []
  const sampleCreated: Array<{
    name: string
    email: string
    company: string | null
  }> = []

  const BATCH_SIZE = 50
  for (let i = 0; i < parsedLeads.length; i += BATCH_SIZE) {
    const batch = parsedLeads.slice(i, i + BATCH_SIZE)
    const toCreate = batch.filter((l) => !existingEmails.has(l.email))
    if (toCreate.length === 0) {
      duplicates += batch.length
      continue
    }
    try {
      await db.lead.createMany({
        data: toCreate.map((l) => ({
          userId,
          gmailAccountId: account?.id || null,
          systemPromptId: sp?.id || null,
          name: l.name,
          email: l.email,
          company: l.company,
          role: l.role,
          industry: l.industry,
          companySize: l.companySize,
          notes: l.notes,
          linkedinUrl: l.linkedinUrl,
          status: 'PENDING' as const,
          leadScore: scoreLead(l),
        })),
      })
      created += toCreate.length
      duplicates += batch.length - toCreate.length
      if (sampleCreated.length < 5) {
        sampleCreated.push(
          ...toCreate.slice(0, 5 - sampleCreated.length).map((l) => ({
            name: l.name,
            email: l.email,
            company: l.company,
          }))
        )
      }
    } catch (e) {
      // Batch failed — try inserting one-by-one so a single bad row
      // doesn't lose the whole batch
      const batchErr = (e as Error).message
      for (const l of toCreate) {
        try {
          await db.lead.create({
            data: {
              userId,
              gmailAccountId: account?.id || null,
              systemPromptId: sp?.id || null,
              name: l.name,
              email: l.email,
              company: l.company,
              role: l.role,
              industry: l.industry,
              companySize: l.companySize,
              notes: l.notes,
              linkedinUrl: l.linkedinUrl,
              status: 'PENDING',
            },
          })
          created++
          if (sampleCreated.length < 5) {
            sampleCreated.push({
              name: l.name,
              email: l.email,
              company: l.company,
            })
          }
        } catch (e2) {
          errors.push(
            `Row ${l.email}: ${(e2 as Error).message.slice(0, 200)}`
          )
        }
      }
      // Log the original batch error too (truncated)
      errors.push(
        `Batch ${Math.floor(i / BATCH_SIZE)} fell back to row-by-row: ${batchErr.slice(0, 200)}`
      )
    }
  }

  return {
    created,
    skipped,
    duplicates,
    errors,
    total,
    sampleCreated,
  }
}
