/**
 * ============================================================================
 * LEAD RESEARCH SERVICE
 * ============================================================================
 *
 * Finds real companies matching criteria using web search, then uses AI
 * (Nemotron for analysis, Mistral for outreach) to:
 *   1. Analyze each company — why they're a good AI prospect
 *   2. Score the opportunity (0-100)
 *   3. Recommend specific AI solutions
 *   4. Generate personalized cold email
 *   5. Generate LinkedIn outreach message
 *   6. Generate 3-email follow-up sequence (Day 2, Day 5, Day 10)
 *
 * Web search uses z-ai-web-dev-sdk (available in this environment).
 * For production deployment, replace with SerpAPI/Tavily/Google Custom Search.
 * ============================================================================
 */

import { db } from '@/lib/db'
import { nvidiaChat, type ChatMessage } from '@/lib/ai/nvidia-agent'

// ---------------------------------------------------------------------------
// 1. WEB SEARCH — find real companies
// ---------------------------------------------------------------------------

interface SearchResult {
  url: string
  name: string
  snippet: string
  host_name: string
}

/**
 * Search the web for companies matching the criteria.
 *
 * Two strategies:
 *   1. Z.ai sandbox: uses z-ai-web-dev-sdk (only available in this environment)
 *   2. HuggingFace/production: falls back to DuckDuckGo HTML scraping
 *      (no API key needed, works anywhere)
 */
export async function searchCompanies(
  query: string,
  numResults: number = 10
): Promise<SearchResult[]> {
  // Strategy 1: Try z-ai-web-dev-sdk (sandbox only)
  try {
    const ZAI = (await import('z-ai-web-dev-sdk')).default
    const zai = await ZAI.create()
    const results = await zai.functions.invoke('web_search', {
      query,
      num: numResults,
    })
    if (Array.isArray(results) && results.length > 0) {
      console.log(`[lead-research] z-ai search: found ${results.length} results`)
      return results as SearchResult[]
    }
  } catch (e) {
    console.log('[lead-research] z-ai-web-dev-sdk not available, using DuckDuckGo fallback')
  }

  // Strategy 2: DuckDuckGo HTML scraping (works everywhere, no API key)
  try {
    return await searchDuckDuckGo(query, numResults)
  } catch (e) {
    console.error('[lead-research] DuckDuckGo search also failed:', e)
    return []
  }
}

/**
 * DuckDuckGo search — scrapes the HTML results page.
 * No API key needed, works from any server (including HuggingFace Docker).
 */
async function searchDuckDuckGo(
  query: string,
  numResults: number
): Promise<SearchResult[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html',
    },
  })

  if (!res.ok) {
    throw new Error(`DuckDuckGo returned ${res.status}`)
  }

  const html = await res.text()
  const results: SearchResult[] = []

  // Parse DuckDuckGo HTML results
  // Each result is in a <div class="result"> with <a class="result__a"> for link
  // and <a class="result__snippet"> for snippet
  const resultRegex =
    /class="result__a"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>[\s\S]*?class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g
  let match
  let rank = 0
  while ((match = resultRegex.exec(html)) !== null && results.length < numResults) {
    rank++
    let rawUrl = match[1]
    // DuckDuckGo wraps URLs in a redirect: //duckduckgo.com/l/?uddg=ENCODED_URL
    if (rawUrl.includes('uddg=')) {
      const uddgMatch = rawUrl.match(/uddg=([^&]+)/)
      if (uddgMatch) {
        rawUrl = decodeURIComponent(uddgMatch[1])
      }
    }
    // Clean up URL
    if (rawUrl.startsWith('//')) rawUrl = 'https:' + rawUrl

    let hostName = ''
    try {
      hostName = new URL(rawUrl).hostname
    } catch {
      hostName = rawUrl
    }

    // Skip non-company results
    if (
      hostName.includes('duckduckgo.com') ||
      hostName.includes('linkedin.com') ||
      hostName.includes('facebook.com') ||
      hostName.includes('yelp.com') ||
      hostName.includes('indeed.com')
    ) {
      continue
    }

    const name = match[2].trim()
    const snippet = match[3]
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .trim()

    if (name && rawUrl && hostName) {
      results.push({
        url: rawUrl,
        name,
        snippet: snippet.slice(0, 300),
        host_name: hostName,
      })
    }
  }

  console.log(`[lead-research] DuckDuckGo search: found ${results.length} results`)
  return results
}

// ---------------------------------------------------------------------------
// 2. AI ANALYSIS — Nemotron scores each company
// ---------------------------------------------------------------------------

export interface CompanyAnalysis {
  companyName: string
  website: string
  industry: string
  location: string
  estimatedSize: string
  description: string
  whyGoodProspect: string
  aiSolution: string
  painPoint: string
  opportunityScore: number
  reasoning: string
}

/**
 * Use Nemotron to analyze a single search result and produce a structured
 * company assessment with opportunity score.
 */
export async function analyzeCompany(
  searchResult: SearchResult,
  searchCriteria: { industry?: string; location?: string; query: string },
  userId: string
): Promise<CompanyAnalysis | null> {
  const systemPrompt = `You are an expert Lead Researcher and Market Analyst specializing in AI automation opportunities.

Your job is to analyze a company (from its website + search snippet) and determine:
1. Whether they're a good AI automation prospect
2. What specific AI solution could help them
3. What pain point to highlight in outreach
4. An opportunity score (0-100) based on:
   - Likelihood of having manual processes (higher = more manual = better prospect)
   - Size fit (5-200 employees is ideal)
   - Industry fit for AI automation
   - Website signals (outdated tech, no automation, growing team, etc.)

Return ONLY valid JSON — no markdown, no commentary.`

  const userPrompt = `TASK: Analyze this company as an AI automation prospect.

=== SEARCH CONTEXT ===
Search query: "${searchCriteria.query}"
Target industry: ${searchCriteria.industry || 'any'}
Target location: ${searchCriteria.location || 'any'}

=== COMPANY FOUND ===
Company name (from page title): ${searchResult.name}
Website: ${searchResult.host_name}
URL: ${searchResult.url}
Search snippet: ${searchResult.snippet}

=== INSTRUCTIONS ===
Analyze this company and return JSON with these exact fields:
- companyName: the actual company name (extract from title/snippet, not the domain)
- website: ${searchResult.host_name}
- industry: their industry (inferred from snippet)
- location: their location if detectable, otherwise "Unknown"
- estimatedSize: "5-20", "20-50", "50-200", "200+", or "Unknown"
- description: 1-2 sentence summary of what they do
- whyGoodProspect: 2-3 sentences explaining why they'd benefit from AI automation
- aiSolution: the specific AI solution you'd recommend (e.g. "AI-powered appointment scheduling + reminder system")
- painPoint: the single most compelling pain point to lead with in outreach
- opportunityScore: integer 0-100 (higher = better prospect)
- reasoning: 2-3 sentences explaining your score

Prioritize companies with manual processes, growing teams, or outdated tech.
Score 80+ for ideal prospects (US-based, 5-200 employees, clearly manual processes).
Score 50-79 for decent prospects.
Score below 50 for poor prospects (too big, too small, or already automated).`

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]

  const result = await nvidiaChat('analyze_psychology', messages, {
    temperature: 0.3,
    maxTokens: 1500,
    json: true,
    userId,
  })

  if (!result.content) return null

  try {
    const parsed = JSON.parse(extractJson(result.content))
    return {
      companyName: parsed.companyName || searchResult.name,
      website: searchResult.host_name,
      industry: parsed.industry || searchCriteria.industry || 'Unknown',
      location: parsed.location || 'Unknown',
      estimatedSize: parsed.estimatedSize || 'Unknown',
      description: parsed.description || searchResult.snippet.slice(0, 200),
      whyGoodProspect: parsed.whyGoodProspect || '',
      aiSolution: parsed.aiSolution || '',
      painPoint: parsed.painPoint || '',
      opportunityScore: Math.min(100, Math.max(0, parseInt(parsed.opportunityScore, 10) || 50)),
      reasoning: parsed.reasoning || '',
    }
  } catch (e) {
    console.error('[lead-research] parse failed:', e)
    return null
  }
}

// ---------------------------------------------------------------------------
// 3. OUTREACH GENERATION — Mistral drafts email + LinkedIn + followups
// ---------------------------------------------------------------------------

export interface OutreachPack {
  coldEmail: string
  linkedinMessage: string
  followupDay2: string
  followupDay5: string
  followupDay10: string
}

/**
 * Use Mistral to generate a complete outreach pack for a company:
 * cold email + LinkedIn message + 3-email follow-up sequence.
 */
export async function generateOutreach(
  analysis: CompanyAnalysis,
  userId: string
): Promise<OutreachPack> {
  const systemPrompt = `You are an expert sales copywriter specializing in AI automation outreach.

Rules:
- Cold email: 60-120 words, subject ≤6 words, one tiny ask, personalized to THIS company
- LinkedIn message: 300 chars max (connection request style), warm, reference their business
- Follow-up Day 2: 40-60 words, add value (not just "bumping this up")
- Follow-up Day 5: 40-60 words, different angle, reference the pain point
- Follow-up Day 10: 40-60 words, breakup email ("should I close your file?")
- Do NOT include sign-offs — the system appends the sender name
- Return ONLY valid JSON`

  const userPrompt = `TASK: Generate a complete outreach pack for this company.

=== COMPANY ===
Name: ${analysis.companyName}
Industry: ${analysis.industry}
Location: ${analysis.location}
Size: ${analysis.estimatedSize}
Description: ${analysis.description}

=== AI ANALYSIS ===
Why good prospect: ${analysis.whyGoodProspect}
Recommended AI solution: ${analysis.aiSolution}
Key pain point: ${analysis.painPoint}
Opportunity score: ${analysis.opportunityScore}/100

Return JSON with these exact keys:
- coldEmail: { "subject": "...", "body": "..." }
- linkedinMessage: "..." (the connection note, ≤300 chars)
- followupDay2: "..." (the email body only, no subject)
- followupDay5: "..."
- followupDay10: "..."`

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]

  const result = await nvidiaChat('draft_outreach', messages, {
    temperature: 0.2,
    maxTokens: 2000,
    json: true,
    userId,
  })

  if (!result.content) {
    return {
      coldEmail: '',
      linkedinMessage: '',
      followupDay2: '',
      followupDay5: '',
      followupDay10: '',
    }
  }

  try {
    const parsed = JSON.parse(extractJson(result.content))
    const coldEmail = parsed.coldEmail || {}
    return {
      coldEmail: typeof coldEmail === 'string' ? coldEmail : JSON.stringify(coldEmail),
      linkedinMessage: parsed.linkedinMessage || '',
      followupDay2: parsed.followupDay2 || '',
      followupDay5: parsed.followupDay5 || '',
      followupDay10: parsed.followupDay10 || '',
    }
  } catch (e) {
    console.error('[lead-research] outreach parse failed:', e)
    return {
      coldEmail: result.content.slice(0, 500),
      linkedinMessage: '',
      followupDay2: '',
      followupDay5: '',
      followupDay10: '',
    }
  }
}

// ---------------------------------------------------------------------------
// 4. FULL RESEARCH FLOW — search → analyze → rank → generate outreach
// ---------------------------------------------------------------------------

export interface ResearchResult {
  totalFound: number
  analyzed: number
  saved: number
  errors: string[]
  topLeads: CompanyAnalysis[]
}

/**
 * Run the full lead research pipeline:
 *   1. Web search for companies matching criteria
 *   2. AI analysis of each result (Nemotron)
 *   3. Filter + rank by opportunity score
 *   4. Generate outreach for top N (Mistral)
 *   5. Persist to LeadResearch table
 */
export async function researchLeads(
  userId: string,
  criteria: {
    industry?: string
    location?: string
    keywords?: string
    numLeads?: number
  }
): Promise<ResearchResult> {
  const numLeads = criteria.numLeads || 10
  const errors: string[] = []

  // Build search query — target real businesses with manual processes
  const parts = [
    criteria.industry || 'small business',
    'in',
    criteria.location || 'United States',
  ]
  if (criteria.keywords) parts.push(criteria.keywords)
  // Focus on company websites, exclude directories/social media/job boards
  parts.push('-site:linkedin.com -site:facebook.com -site:indeed.com -site:yelp.com -site:yellowpages.com -site:glassdoor.com -site:bloomberg.com -site:crunchbase.com')
  const query = parts.join(' ')

  // Step 1: Web search
  const searchResults = await searchCompanies(query, numLeads * 2)
  if (searchResults.length === 0) {
    return {
      totalFound: 0,
      analyzed: 0,
      saved: 0,
      errors: ['Web search returned no results. Try different criteria.'],
      topLeads: [],
    }
  }

  // Step 2: Analyze each result
  const analyses: CompanyAnalysis[] = []
  for (const result of searchResults.slice(0, numLeads * 2)) {
    try {
      const analysis = await analyzeCompany(result, { ...criteria, query }, userId)
      if (analysis && analysis.opportunityScore >= 30) {
        analyses.push(analysis)
      }
    } catch (e) {
      errors.push(`Analysis failed for ${result.host_name}: ${(e as Error).message}`)
    }
  }

  // Step 3: Filter out low-quality leads (score < 40), then rank by score
  const qualityLeads = analyses.filter((a) => a.opportunityScore >= 40)
  qualityLeads.sort((a, b) => b.opportunityScore - a.opportunityScore)
  const topLeads = qualityLeads.slice(0, numLeads)

  // Step 4: Generate outreach for top leads + persist
  let saved = 0
  for (const analysis of topLeads) {
    try {
      const outreach = await generateOutreach(analysis, userId)
      await db.leadResearch.create({
        data: {
          userId,
          searchQuery: query,
          industry: criteria.industry || null,
          location: criteria.location || null,
          companyName: analysis.companyName,
          website: analysis.website,
          industryInferred: analysis.industry,
          locationInferred: analysis.location,
          estimatedSize: analysis.estimatedSize,
          description: analysis.description,
          whyGoodProspect: analysis.whyGoodProspect,
          aiSolutionRec: analysis.aiSolution,
          painPoint: analysis.painPoint,
          opportunityScore: analysis.opportunityScore,
          reasoningTrace: analysis.reasoning,
          coldEmail: outreach.coldEmail,
          linkedinMessage: outreach.linkedinMessage,
          followupDay2: outreach.followupDay2,
          followupDay5: outreach.followupDay5,
          followupDay10: outreach.followupDay10,
          analysisModel: 'nemotron-3-super',
          outreachModel: 'mistral-small-4',
        },
      })
      saved++
    } catch (e) {
      errors.push(`Save failed for ${analysis.companyName}: ${(e as Error).message}`)
    }
  }

  return {
    totalFound: searchResults.length,
    analyzed: analyses.length,
    saved,
    errors,
    topLeads,
  }
}

// ---------------------------------------------------------------------------
// 5. IMPORT — push researched leads into the main pipeline
// ---------------------------------------------------------------------------

export async function importResearchToPipeline(
  researchId: string,
  userId: string
): Promise<string | null> {
  const research = await db.leadResearch.findUnique({
    where: { id: researchId },
  })
  if (!research) return null

  // Get sender account + default system prompt
  const account = await db.gmailAccount.findFirst({
    where: { userId, isActive: true },
  })
  const sp = await db.systemPrompt.findFirst({
    where: { userId, isDefault: true },
  })

  // Extract email subject + body from coldEmail (which is JSON)
  let emailSubject = `Quick question for ${research.companyName}`
  let emailBody = research.coldEmail || ''
  try {
    const parsed = JSON.parse(research.coldEmail)
    if (parsed.subject) emailSubject = parsed.subject
    if (parsed.body) emailBody = parsed.body
  } catch {
    // coldEmail might be plain text — use as-is
  }

  // Create the lead
  const lead = await db.lead.create({
    data: {
      userId,
      gmailAccountId: account?.id || null,
      systemPromptId: sp?.id || null,
      name: `Decision Maker at ${research.companyName}`,
      email: `contact@${research.website}`, // placeholder — user must replace
      company: research.companyName,
      role: 'Owner / Decision Maker',
      industry: research.industryInferred || research.industry,
      companySize: research.estimatedSize,
      notes: [
        `Website: ${research.website}`,
        `Description: ${research.description}`,
        `Why good prospect: ${research.whyGoodProspect}`,
        `AI solution: ${research.aiSolutionRec}`,
        `Pain point: ${research.painPoint}`,
        `Opportunity score: ${research.opportunityScore}/100`,
        `Location: ${research.locationInferred || research.location}`,
      ].join('\n'),
      status: 'PENDING',
    },
  })

  // Mark as imported
  await db.leadResearch.update({
    where: { id: researchId },
    data: {
      isImportedToPipeline: true,
      importedLeadId: lead.id,
    },
  })

  return lead.id
}

// ---------------------------------------------------------------------------
// 6. HELPER — extract JSON from potentially-wrapped response
// ---------------------------------------------------------------------------

function extractJson(raw: string): string {
  let s = raw.trim()
  // Strip <think> tags
  s = s.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
  // Strip markdown code fences
  s = s.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
  // Find first { to last }
  const first = s.indexOf('{')
  const last = s.lastIndexOf('}')
  if (first !== -1 && last !== -1 && last > first) {
    return s.slice(first, last + 1)
  }
  return s
}
