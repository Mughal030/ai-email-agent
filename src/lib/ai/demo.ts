/**
 * Demo-mode AI fallback.
 *
 * When NVIDIA_API_KEY is not set, we don't want the entire app to be unusable
 * for the dashboard demo. This module provides simulated responses that mimic
 * the shape of the real NVIDIA agent library — enough to drive the UI and
 * lifecycle without an external dependency.
 *
 * The output is clearly labeled as DEMO so the user knows real AI isn't running.
 */

import type {
  Lead,
  LeadPsychProfile,
  EmailLog,
  AgentMemory,
  SystemPrompt,
} from '@prisma/client'

const isDemo = !(
  process.env.NVIDIA_KEY_DEEPSEEK &&
  process.env.NVIDIA_KEY_GEMMA &&
  process.env.NVIDIA_KEY_MINIMAX &&
  process.env.NVIDIA_KEY_MISTRAL &&
  process.env.NVIDIA_KEY_NEMOTRON
)
export function isDemoMode(): boolean {
  return isDemo
}

function pick<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length]
}

function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

export function demoAnalyzePsychology(opts: {
  lead: Lead
}): {
  personalityArchetype: string
  dominantMotivator: string
  communicationStyle: string
  painPoints: string[]
  angleRecommended: string
  reasoningTrace: string
  confidence: number
} {
  const archetypes = [
    'Pragmatic Operator',
    'Visionary Founder',
    'Data-Driven Executive',
    'Growth-Oriented Hustler',
    'Risk-Averse Steward',
  ]
  const motivators = [
    'speed-to-revenue',
    'cost-cutting',
    'innovation',
    'risk-avoidance',
    'status',
  ]
  const styles = ['direct', 'story-driven', 'data-heavy']
  const angles = [
    'curiosity+pattern-interrupt',
    'mutual-connection+value',
    'pain-point-agitation',
    'social-proof+specific-result',
  ]
  const painByIndustry: Record<string, string[]> = {
    SaaS: ['churn', 'CAC payback', 'onboarding friction', 'feature bloat'],
    Fintech: ['compliance overhead', 'fraud', 'unit economics', 'trust'],
    Default: ['hiring delays', 'unclear ROI', 'manual reporting', 'tool sprawl'],
  }
  const seed = hashStr(opts.lead.email + (opts.lead.industry || ''))
  const industry = opts.lead.industry || 'Default'
  const pains = painByIndustry[industry] || painByIndustry.Default

  return {
    personalityArchetype: pick(archetypes, seed),
    dominantMotivator: pick(motivators, seed >> 2),
    communicationStyle: pick(styles, seed >> 4),
    painPoints: pains.slice(0, 3),
    angleRecommended: pick(angles, seed >> 6),
    reasoningTrace: `DEMO MODE: Based on ${industry} industry context and the lead's role (${opts.lead.role || 'unknown'}), inferred a ${pick(
      archetypes,
      seed
    )} archetype driven by ${pick(motivators, seed >> 2)}. Real NVIDIA analysis would be richer.`,
    confidence: 0.55,
  }
}

export function demoDraftOutreach(opts: {
  lead: Lead
  profile: LeadPsychProfile | null
}): {
  subject: string
  body: string
  strategyUsed: string
  psychAnalysis: string
} {
  const lead = opts.lead
  const angle = opts.profile?.angleRecommended || 'curiosity'
  const firstName = lead.name.split(' ')[0] || 'there'
  const industry = lead.industry || 'your space'
  const pain = opts.profile?.painPoints
    ? JSON.parse(opts.profile.painPoints)[0]
    : 'manual reporting'

  const subject = `${firstName} — quick ${industry} question`
  const body = [
    `Hi ${firstName},`,
    ``,
    `Noticed ${lead.company || 'your team'} is operating in ${industry}. Most ${lead.role || 'operators'} I talk to are bleeding time on ${pain}.`,
    ``,
    `We helped a similar team cut that overhead by ~40% in three weeks. Worth a 10-min call this week?`,
    ``,
    `—[Your Name]`,
  ].join('\n')

  return {
    subject,
    body,
    strategyUsed: angle,
    psychAnalysis: `DEMO MODE: Leveraged the "${angle}" angle and the inferred top pain point (${pain}). Real NVIDIA generation would personalize further using the lead's notes.`,
  }
}

export function demoAnalyzeReply(opts: {
  replyText: string
}): {
  sentiment: 'positive' | 'negative' | 'neutral' | 'curious'
  intent:
    | 'interested'
    | 'objection'
    | 'not_interested'
    | 'ooo'
    | 'question'
    | 'meeting_request'
    | 'unsubscribe'
  summary: string
  nextBestAction: 'auto_reply' | 'human_handoff' | 'close_loop' | 'opt_out'
  reasoningTrace: string
} {
  const t = opts.replyText.toLowerCase()
  if (t.includes('unsubscribe') || t.includes('remove me')) {
    return {
      sentiment: 'negative',
      intent: 'unsubscribe',
      summary: 'Lead requested removal.',
      nextBestAction: 'opt_out',
      reasoningTrace: 'DEMO: unsubscribe keyword detected.',
    }
  }
  if (t.includes('meeting') || t.includes('call') || t.includes('calendar')) {
    return {
      sentiment: 'positive',
      intent: 'meeting_request',
      summary: 'Lead wants to meet.',
      nextBestAction: 'human_handoff',
      reasoningTrace: 'DEMO: meeting-request keywords detected.',
    }
  }
  if (t.includes('not interested') || t.includes('no thanks') || t.includes('pass')) {
    return {
      sentiment: 'negative',
      intent: 'not_interested',
      summary: 'Lead declined.',
      nextBestAction: 'close_loop',
      reasoningTrace: 'DEMO: explicit decline detected.',
    }
  }
  if (t.includes('?') || t.includes('how') || t.includes('what')) {
    return {
      sentiment: 'curious',
      intent: 'question',
      summary: 'Lead asked a question.',
      nextBestAction: 'auto_reply',
      reasoningTrace: 'DEMO: question mark / question words detected.',
    }
  }
  if (t.includes('out of office') || t.includes('ooo') || t.includes('vacation')) {
    return {
      sentiment: 'neutral',
      intent: 'ooo',
      summary: 'Lead is OOO.',
      nextBestAction: 'close_loop',
      reasoningTrace: 'DEMO: OOO pattern detected.',
    }
  }
  return {
    sentiment: 'neutral',
    intent: 'question',
    summary: 'Generic reply — DEMO defaulted to auto-reply.',
    nextBestAction: 'auto_reply',
    reasoningTrace: 'DEMO: no strong signal — defaulted to auto_reply.',
  }
}

export function demoDraftAutoReply(opts: {
  lead: Lead
  replyText: string
}): {
  body: string
  strategyUsed: string
  psychAnalysis: string
} {
  const firstName = opts.lead.name.split(' ')[0] || 'there'
  return {
    body: [
      `Thanks ${firstName} — appreciate the reply.`,
      ``,
      `Quick context: we typically get teams like yours a clear answer inside 10 days. Want me to send over a 1-pager so you can decide if it's worth a call?`,
    ].join('\n'),
    strategyUsed: 'demo-acknowledge+forward',
    psychAnalysis: 'DEMO MODE: simple acknowledge-and-ask template.',
  }
}

export function demoSelfImprovement(): {
  summary: string
  newLessons: Array<{
    lesson: string
    category: string
    scope: 'GLOBAL' | 'INDUSTRY' | 'ROLE' | 'COMPANY_SIZE'
    scopeKey: string | null
    impactScore: number
    sampleSize: number
    positiveRate: number
  }>
  retireLessonHints: string[]
  metricsJson: Record<string, unknown>
} {
  return {
    summary:
      'DEMO MODE: Simulated self-improvement — added one sample lesson for the SaaS industry.',
    newLessons: [
      {
        lesson:
          'Shorter curiosity-driven subject lines (≤5 words) get ~20% more replies in the SaaS industry',
        category: 'subject_line',
        scope: 'INDUSTRY',
        scopeKey: 'SaaS',
        impactScore: 0.72,
        sampleSize: 28,
        positiveRate: 0.34,
      },
    ],
    retireLessonHints: [],
    metricsJson: { replyRate: 0.21, positiveRate: 0.55, demo: true },
  }
}
