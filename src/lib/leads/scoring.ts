import type { Lead } from '@prisma/client'

export function scoreLead(lead: {
  company?: string | null
  role?: string | null
  industry?: string | null
  companySize?: string | null
  notes?: string | null
  linkedinUrl?: string | null
}): number {
  let score = 30
  const size = (lead.companySize || '').toLowerCase()
  if (size.match(/^(5|11|25|50|20)/)) score += 20
  else if (size.match(/^(100|200|250)/)) score += 15
  else if (size.match(/^(1|0|2)/)) score += 5
  else if (size.match(/^(1000|5000|10000)/)) score += 5
  else score += 10

  const industry = (lead.industry || '').toLowerCase()
  if (industry.match(/software|saas|tech|internet|it/)) score += 20
  else if (industry.match(/marketing|advertising|media|content/)) score += 20
  else if (industry.match(/business|consulting|professional/)) score += 15
  else if (industry.match(/finance|fintech|insurance/)) score += 10
  else if (industry.match(/health|medical|dental/)) score += 10
  else score += 5

  const role = (lead.role || '').toLowerCase()
  if (role.match(/\b(ceo|founder|owner|president)\b/)) score += 15
  else if (role.match(/\b(cmo|vp|director|head of)\b/)) score += 15
  else if (role.match(/\b(manager|lead|senior)\b/)) score += 10
  else if (role.match(/\b(marketing|growth|seo|content)\b/)) score += 15
  else score += 5

  const notes = lead.notes || ''
  if (notes.length > 500) score += 10
  else if (notes.length > 200) score += 5
  if (lead.linkedinUrl) score += 5
  if (lead.company) score += 5

  return Math.min(100, score)
}
