/**
 * ============================================================================
 * AI COLUMN DETECTOR — auto-maps any CSV/Excel columns to our Lead schema
 * ============================================================================
 *
 * When a user uploads a lead list, the columns could be named anything:
 *   "First Name", "firstName", "fname", "Contact Name", "Full Name" → name
 *   "Email", "Email Address", "Work Email", "E-mail" → email
 *   "Company", "CompanyName", "Organization", "Employer" → company
 *
 * Detection strategy (two layers):
 *   1. FUZZY HEADER MATCHING — fast, no API call. Covers 90% of cases
 *      using a curated synonym dictionary.
 *   2. AI INFERENCE — for any headers fuzzy matching can't resolve, send
 *      the header + 3 sample values to MiniMax-M3 (fast classification
 *      model) and ask it to pick the best schema field.
 *
 * Any column that doesn't map to a core field gets bundled into `notes`
 * as "Header: value" pairs, so no enrichment data is ever lost.
 * ============================================================================
 */

import { nvidiaChat, type TaskType } from '@/lib/ai/nvidia-agent'

// ---------------------------------------------------------------------------
// 0. SCHEMA FIELD DEFINITIONS — what we can map to
// ---------------------------------------------------------------------------

export type SchemaField =
  | 'name'
  | 'email'
  | 'company'
  | 'role'
  | 'industry'
  | 'companySize'
  | 'linkedinUrl'
  | 'phone'
  | 'location'
  | 'headline'
  | 'bio'
  | 'companyDescription'
  | 'website'
  | 'notes'        // catch-all for unmapped enrichment columns
  | 'ignore'       // explicitly skip (e.g. internal IDs, timestamps)

export interface ColumnMapping {
  /** headerName → schemaField */
  [header: string]: SchemaField
}

export interface DetectionResult {
  mapping: ColumnMapping
  method: 'fuzzy' | 'ai' | 'hybrid'
  aiReasoning?: string
  unmapped: string[]  // headers that went to 'notes' or 'ignore'
}

// ---------------------------------------------------------------------------
// 1. FUZZY HEADER SYNONYM DICTIONARY
// ---------------------------------------------------------------------------

const SYNONYMS: Record<SchemaField, string[]> = {
  name: [
    'name', 'full name', 'contact name', 'contact', 'person',
    'first last', 'lead name', 'prospect name',
  ],
  email: [
    'email', 'e-mail', 'email address', 'email id', 'work email',
    'business email', 'contact email', 'email_id', 'emailaddress',
  ],
  company: [
    'company', 'company name', 'companyname', 'organization',
    'organisation', 'org', 'employer', 'business name', 'firm',
    'account', 'account name',
  ],
  role: [
    'role', 'job title', 'jobtitle', 'title', 'position',
    'designation', 'job role', 'occupation', 'function',
  ],
  industry: [
    'industry', 'sector', 'vertical', 'industry type',
    'business type', 'category',
  ],
  companySize: [
    'company size', 'companysize', 'size', 'headcount', 'company headcount',
    'employee count', 'employees', 'team size', '# employees',
  ],
  linkedinUrl: [
    'linkedin', 'linkedin url', 'linkedinurl', 'linkedin profile',
    'linkedin link', 'li url', 'linked',
  ],
  phone: [
    'phone', 'phone number', 'phonenumber', 'mobile', 'cell',
    'telephone', 'tel', 'contact number', 'phone_numbers',
  ],
  location: [
    'location', 'city', 'address', 'geo', 'geography', 'region',
    'hometown', 'where',
  ],
  headline: [
    'headline', 'tagline', 'profile headline', 'bio headline',
    'professional headline',
  ],
  bio: [
    'bio', 'summary', 'about', 'about me', 'description', 'profile summary',
    'profile bio', 'person summary', 'bio summary',
  ],
  companyDescription: [
    'company description', 'companydescription', 'company bio',
    'about company', 'about the company', 'company summary',
    'business description', 'company info',
  ],
  website: [
    'website', 'company website', 'companywebsite', 'company domain',
    'domain', 'url', 'web', 'site', 'homepage',
  ],
  notes: [],   // catch-all — never matched directly
  ignore: [
    'id', 'uuid', 'timestamp', 'date', 'created', 'updated',
    'uploaded by', 'upload method', 'list id', 'campaign', 'status',
    'verification', 'esp code', 'enrichment status', 'assigned to',
    'assignee', 'subsequence', 'last contacted', 'email opened',
    'email replied', 'email clicked', 'lt interest', 'pl value',
    'completion reason', 'is website visitor', 'supersearch',
  ],
}

/**
 * Normalize a header for matching: lowercase, strip non-alphanumeric,
 * collapse spaces.
 */
function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Fuzzy-match a single header against the synonym dictionary.
 * Returns the matched SchemaField or null.
 */
function fuzzyMatchHeader(header: string): SchemaField | null {
  const norm = normalize(header)
  if (!norm) return null

  // Exact match
  for (const [field, syns] of Object.entries(SYNONYMS)) {
    if (syns.includes(norm)) return field as SchemaField
  }

  // Substring match (header contains a synonym or vice versa)
  for (const [field, syns] of Object.entries(SYNONYMS)) {
    for (const syn of syns) {
      if (norm.includes(syn) || syn.includes(norm)) {
        return field as SchemaField
      }
    }
  }

  // Levenshtein-ish: very close matches
  for (const [field, syns] of Object.entries(SYNONYMS)) {
    for (const syn of syns) {
      if (levenshtein(norm, syn) <= 2 && Math.max(norm.length, syn.length) >= 4) {
        return field as SchemaField
      }
    }
  }

  return null
}

function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array(m + 1).fill(0).map(() => Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      )
    }
  }
  return dp[m][n]
}

// ---------------------------------------------------------------------------
// 2. AI COLUMN DETECTION (MiniMax — fast)
// ---------------------------------------------------------------------------

const AI_FIELD_DESCRIPTIONS = `
Available target fields (pick one per column):
- name: the person's full name (first + last)
- email: their email address (required — must contain @)
- company: the company/org they work for
- role: their job title (CEO, VP Engineering, Founder, etc.)
- industry: the industry/sector (SaaS, Fintech, HealthTech, etc.)
- companySize: how big the company is (employee count or range)
- linkedinUrl: a LinkedIn profile URL
- phone: a phone number
- location: city/state/country
- headline: a one-line professional tagline (LinkedIn-style)
- bio: a longer personal summary/about section
- companyDescription: what the company does
- website: company website or domain
- notes: catch-all for any other useful enrichment data
- ignore: internal IDs, timestamps, status flags, campaign metadata — NOT useful for outreach
`.trim()

/**
 * Use MiniMax-M3 to detect column purposes for headers that fuzzy matching
 * couldn't resolve. Sends headers + 3 sample values per column.
 */
async function aiDetectColumns(
  headers: string[],
  sampleRows: Record<string, string>[],
  userId?: string
): Promise<{ mapping: ColumnMapping; reasoning: string | null }> {
  // Build column samples: for each unmapped header, show 3 sample values
  const columnSamples = headers.map((h) => {
    const samples = sampleRows
      .slice(0, 3)
      .map((r) => r[h] || '')
      .filter(Boolean)
      .slice(0, 3)
    return { header: h, samples }
  })

  const userMsg = [
    `TASK: Map each CSV column to one of the target fields below.`,
    ``,
    `=== TARGET FIELDS ===`,
    AI_FIELD_DESCRIPTIONS,
    ``,
    `=== COLUMNS TO MAP ===`,
    ...columnSamples.map(
      (c, i) =>
        `${i + 1}. Header: "${c.header}"\n   Sample values: ${c.samples.map((s) => `"${s.slice(0, 80)}"`).join(', ') || '(empty)'}`
    ),
    ``,
    `Return ONLY a JSON object mapping each header (exactly as given) to a target field.`,
    `Example: {"First Name": "name", "Email Address": "email", "Company": "company", "Timestamp": "ignore"}`,
  ].join('\n')

  const result = await nvidiaChat(
    'analyze_reply' as TaskType, // reuse MiniMax (fast classification model)
    [
      {
        role: 'system',
        content:
          'You are a data engineer mapping CSV columns to a target schema. Be precise — pick the single best field per column. When in doubt, prefer "notes" over "ignore" (it is better to keep enrichment data than to lose it).',
      },
      { role: 'user', content: userMsg },
    ],
    {
      temperature: 0.1,
      maxTokens: 1500,
      json: true,
      userId,
    }
  )

  let mapping: ColumnMapping = {}
  try {
    // Parse the JSON from the response
    let s = result.content.trim()
    // Strip <think> tags if present
    s = s.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
    const firstBrace = s.indexOf('{')
    const lastBrace = s.lastIndexOf('}')
    if (firstBrace !== -1 && lastBrace !== -1) {
      s = s.slice(firstBrace, lastBrace + 1)
    }
    mapping = JSON.parse(s)
  } catch (e) {
    console.error('[column-detector] AI parse failed:', e)
  }

  return { mapping, reasoning: result.reasoning }
}

// ---------------------------------------------------------------------------
// 3. MAIN ENTRY POINT — detectColumns()
// ---------------------------------------------------------------------------

/**
 * Auto-detect the column mapping for a CSV/Excel file.
 *
 * @param headers  The file's column headers
 * @param sampleRows  First 3-5 rows of data (for AI inference)
 * @param options.userId  If provided, AI calls are logged to AiModelCall
 */
export async function detectColumns(
  headers: string[],
  sampleRows: Record<string, string>[],
  options: { userId?: string } = {}
): Promise<DetectionResult> {
  const mapping: ColumnMapping = {}
  const unmapped: string[] = []

  // Layer 1: fuzzy matching
  const needsAi: string[] = []
  for (const h of headers) {
    const fuzzy = fuzzyMatchHeader(h)
    if (fuzzy) {
      mapping[h] = fuzzy
    } else {
      needsAi.push(h)
    }
  }

  // Layer 2: AI detection for the rest
  if (needsAi.length === 0) {
    return {
      mapping,
      method: 'fuzzy',
      unmapped: [],
    }
  }

  let aiReasoning: string | undefined
  try {
    const aiResult = await aiDetectColumns(needsAi, sampleRows, options.userId)
    for (const h of needsAi) {
      const field = aiResult.mapping[h] as SchemaField | undefined
      if (field && isValidField(field)) {
        mapping[h] = field
        if (field === 'notes' || field === 'ignore') {
          unmapped.push(h)
        }
      } else {
        // AI didn't map it — default to notes so we don't lose data
        mapping[h] = 'notes'
        unmapped.push(h)
      }
    }
    aiReasoning = aiResult.reasoning || undefined
  } catch (e) {
    // AI failed — default all unmapped to notes
    for (const h of needsAi) {
      mapping[h] = 'notes'
      unmapped.push(h)
    }
  }

  return {
    mapping,
    method: needsAi.length === headers.length ? 'ai' : 'hybrid',
    aiReasoning,
    unmapped,
  }
}

function isValidField(s: string): boolean {
  return [
    'name', 'email', 'company', 'role', 'industry', 'companySize',
    'linkedinUrl', 'phone', 'location', 'headline', 'bio',
    'companyDescription', 'website', 'notes', 'ignore',
  ].includes(s)
}

// ---------------------------------------------------------------------------
// 4. APPLY MAPPING — convert raw rows into our Lead shape
// ---------------------------------------------------------------------------

export interface MappedLead {
  name: string
  email: string
  company: string | null
  role: string | null
  industry: string | null
  companySize: string | null
  notes: string
  linkedinUrl: string | null
  phone: string | null
}

/**
 * Apply a column mapping to a raw row, producing our Lead shape.
 * All unmapped (notes) fields get bundled into the notes string as
 * "Header: value" pairs so no enrichment data is lost.
 */
export function applyMapping(
  row: Record<string, string>,
  mapping: ColumnMapping
): MappedLead | null {
  const get = (field: SchemaField): string => {
    for (const [h, f] of Object.entries(mapping)) {
      if (f === field) return (row[h] || '').trim()
    }
    return ''
  }

  // Build name from name field(s). Multiple columns may be mapped to 'name'
  // (e.g. "First Name" + "Last Name") — concatenate them.
  const nameParts: string[] = []
  for (const [h, f] of Object.entries(mapping)) {
    if (f === 'name') {
      const v = (row[h] || '').trim()
      if (v) nameParts.push(v)
    }
  }
  const name = nameParts.join(' ').trim()

  const email = get('email').trim().toLowerCase()
  if (!name || !email || !email.includes('@')) return null

  // Build notes from all enrichment fields + any unmapped columns
  const notesParts: string[] = []
  const notesFields: SchemaField[] = [
    'headline', 'bio', 'companyDescription', 'location', 'phone', 'website',
  ]
  for (const f of notesFields) {
    const v = get(f)
    if (v) {
      const label = {
        headline: 'Headline',
        bio: 'Bio',
        companyDescription: 'Company',
        location: 'Location',
        phone: 'Phone',
        website: 'Website',
      }[f]
      notesParts.push(`${label}: ${v.slice(0, 600)}`)
    }
  }

  // Any column mapped to 'notes' (catch-all)
  for (const [h, f] of Object.entries(mapping)) {
    if (f === 'notes') {
      const v = (row[h] || '').trim()
      if (v) notesParts.push(`${h}: ${v.slice(0, 400)}`)
    }
  }

  let linkedinUrl = get('linkedinUrl').trim()
  if (linkedinUrl && !linkedinUrl.startsWith('http')) {
    linkedinUrl = `https://${linkedinUrl}`
  }

  return {
    name: name.slice(0, 200),
    email,
    company: get('company').slice(0, 200) || null,
    role: get('role').slice(0, 200) || null,
    industry: get('industry').slice(0, 100) || null,
    companySize: get('companySize').slice(0, 50) || null,
    notes: notesParts.join('\n').slice(0, 4000),
    linkedinUrl: linkedinUrl || null,
    phone: get('phone').slice(0, 50) || null,
  }
}
