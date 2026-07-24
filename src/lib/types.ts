/**
 * Shared client-side types for the dashboard.
 * Mirrors the Prisma models but trimmed to what the UI needs.
 */

export type LeadStatus =
  | 'PENDING'
  | 'QUEUED'
  | 'ANALYZING'
  | 'DRAFTING'
  | 'SENT'
  | 'OPENED'
  | 'REPLIED'
  | 'AUTO_REPLIED'
  | 'IGNORED'
  | 'BOUNCED'
  | 'FAILED'
  | 'OPT_OUT'
  | 'CONVERTED'

export type EmailDirection =
  | 'OUTREACH'
  | 'FOLLOWUP'
  | 'REPLY'
  | 'AUTO_REPLY'
  | 'INBOUND_REPLY'

export type EmailStatus = 'PENDING' | 'SENT' | 'DELIVERED' | 'OPENED' | 'FAILED' | 'DRAFT'

export type MemoryScope = 'GLOBAL' | 'INDUSTRY' | 'ROLE' | 'COMPANY_SIZE'

export interface SystemPromptT {
  id: string
  name: string
  content: string
  isDefault: boolean
  createdAt: string
  updatedAt: string
}

export interface GmailAccountT {
  id: string
  email: string
  displayName?: string | null
  isActive: boolean
  sentToday: number
  lastPollAt: string | null
  createdAt: string
  hasTokens: boolean
  sendingPaused?: boolean
  dailySendLimit?: number
  sendWindowStartHour?: number
  sendWindowEndHour?: number
  senderTimezone?: string
  minMinutesBetweenSends?: number
}

export interface LeadPsychProfileT {
  id: string
  leadId: string
  personalityArchetype: string | null
  dominantMotivator: string | null
  communicationStyle: string | null
  painPoints: string | null
  angleRecommended: string | null
  reasoningTrace: string | null
  aiModel: string | null
  aiReasoning: string | null
  aiLatencyMs: number | null
  confidence: number
  version: number
  createdAt: string
  updatedAt: string
}

export interface LeadT {
  id: string
  name: string
  email: string
  company: string | null
  role: string | null
  industry: string | null
  companySize: string | null
  notes: string | null
  linkedinUrl: string | null
  status: LeadStatus
  queuedAt: string | null
  sentAt: string | null
  repliedAt: string | null
  lastAutoReplyAt: string | null
  scheduledFor: string | null
  gmailAccountId: string | null
  systemPromptId: string | null
  isArchived: boolean
  createdAt: string
  updatedAt: string
  psychProfile: LeadPsychProfileT | null
  gmailAccount: { id: string; email: string } | null
  systemPrompt: { id: string; name: string } | null
}

export interface EmailLogT {
  id: string
  leadId: string
  gmailAccountId: string
  direction: EmailDirection
  status: EmailStatus
  subject: string | null
  bodyText: string
  smtpMessageId: string | null
  imapUid: number | null
  inReplyTo: string | null
  threadKey: string | null
  strategyUsed: string | null
  psychAnalysis: string | null
  sentimentOfReply: string | null
  replyIntent: string | null
  aiModel: string | null
  aiReasoning: string | null
  aiLatencyMs: number | null
  queuedAt: string | null
  sentAt: string | null
  receivedAt: string | null
  createdAt: string
  updatedAt: string
  lead: { id: string; name: string; email: string }
}

export interface AgentMemoryT {
  id: string
  scope: MemoryScope
  scopeKey: string | null
  lesson: string
  evidence: string | null
  category: string
  impactScore: number
  sampleSize: number
  positiveRate: number
  isActive: boolean
  aiModel: string | null
  createdAt: string
  updatedAt: string
}

export interface SelfImprovementLogT {
  id: string
  windowStart: string
  windowEnd: string
  emailsAnalyzed: number
  leadsAnalyzed: number
  summary: string
  newLessons: string | null
  retiredLessonIds: string | null
  newMemoryIds: string | null
  metricsJson: string | null
  aiModel: string | null
  aiReasoning: string | null
  createdAt: string
}

export interface AiModelCallT {
  id: string
  model: string
  taskType: string
  leadId: string | null
  emailLogId: string | null
  latencyMs: number
  success: boolean
  errorMessage: string | null
  outputPreview: string | null
  createdAt: string
}

export interface DashboardState {
  demoMode: boolean
  requireAuth?: boolean
  user: { id: string; email: string; name: string }
  systemPrompts: SystemPromptT[]
  gmailAccounts: GmailAccountT[]
  leads: LeadT[]
  recentEmails: EmailLogT[]
  memory: AgentMemoryT[]
  improvementLogs: SelfImprovementLogT[]
  aiModelCalls: AiModelCallT[]
  stats: {
    leads: {
      total: number
      pending: number
      queued: number
      sent: number
      replied: number
      autoReplied: number
      ignored: number
      failed: number
      optedOut: number
      converted: number
    }
    emails: {
      totalOutreach: number
      totalReplies: number
      totalAutoReplies: number
      positiveReplies: number
    }
  }
}

export interface AnalyticsData {
  funnel: Record<string, number>
  days: { date: string; sent: number; received: number; autoReplied: number }[]
  strategyBreakdown: {
    strategy: string
    sent: number
    replies: number
    replyRate: number
  }[]
  sentiment: Record<string, number>
  byIndustry: Record<string, number>
  industryPerformance: {
    industry: string
    total: number
    replied: number
    replyRate: number
  }[]
  aiModelUsage: {
    model: string
    calls: number
    successRate: number
    avgLatencyMs: number
    byTask: { task: string; calls: number; avgLatencyMs: number; successRate: number }[]
  }[]
  aiCallsByDay: {
    date: string
    nemotron: number
    mistral: number
    minimax: number
    deepseek: number
    gemma: number
  }[]
  totals: {
    leads: number
    outreachSent: number
    replies: number
    autoReplies: number
    aiCalls: number
  }
}

export const MODEL_LABELS: Record<string, { label: string; color: string; task: string }> = {
  'nemotron-3-super': {
    label: 'Nemotron-3 Super 120B',
    color: '#dc2626',
    task: 'Fast deep reasoning (primary)',
  },
  'mistral-small-4': {
    label: 'Mistral Small 4 119B',
    color: '#0891b2',
    task: 'Fast drafting (primary)',
  },
  'deepseek-v4-flash': {
    label: 'Deepseek V4 Flash',
    color: '#7c3aed',
    task: 'Deep reasoning (fallback)',
  },
  'gemma-4-31b': {
    label: 'Gemma 4 31B',
    color: '#10b981',
    task: 'Email drafting (fallback)',
  },
  'minimax-m3': {
    label: 'MiniMax M3',
    color: '#f59e0b',
    task: 'Fast classification',
  },
  demo: {
    label: 'Demo Simulator',
    color: '#6b7280',
    task: 'Demo fallback',
  },
  seed: {
    label: 'Seed Data',
    color: '#9ca3af',
    task: 'Seed',
  },
}

export const TASK_LABELS: Record<string, string> = {
  analyze_psychology: 'Psychology Analysis',
  draft_outreach: 'Draft Outreach',
  analyze_reply: 'Analyze Reply',
  draft_auto_reply: 'Draft Auto-Reply',
  self_improve: 'Self-Improvement',
}

export const LEAD_STATUS_META: Record<
  LeadStatus,
  { label: string; color: string; bg: string }
> = {
  PENDING: { label: 'Pending', color: 'text-zinc-700', bg: 'bg-zinc-100 border-zinc-200' },
  QUEUED: { label: 'Queued', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' },
  ANALYZING: { label: 'Analyzing', color: 'text-violet-700', bg: 'bg-violet-50 border-violet-200' },
  DRAFTING: { label: 'Drafting', color: 'text-violet-700', bg: 'bg-violet-50 border-violet-200' },
  SENT: { label: 'Sent', color: 'text-sky-700', bg: 'bg-sky-50 border-sky-200' },
  OPENED: { label: 'Opened', color: 'text-cyan-700', bg: 'bg-cyan-50 border-cyan-200' },
  REPLIED: { label: 'Replied', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
  AUTO_REPLIED: { label: 'Auto-Replied', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
  IGNORED: { label: 'Ignored', color: 'text-zinc-500', bg: 'bg-zinc-50 border-zinc-200' },
  BOUNCED: { label: 'Bounced', color: 'text-rose-700', bg: 'bg-rose-50 border-rose-200' },
  FAILED: { label: 'Failed', color: 'text-rose-700', bg: 'bg-rose-50 border-rose-200' },
  OPT_OUT: { label: 'Opt-Out', color: 'text-rose-700', bg: 'bg-rose-50 border-rose-200' },
  CONVERTED: { label: 'Converted', color: 'text-emerald-700', bg: 'bg-emerald-100 border-emerald-300' },
}

export const SENTIMENT_META: Record<string, { label: string; color: string }> = {
  positive: { label: 'Positive', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  curious: { label: 'Curious', color: 'text-sky-700 bg-sky-50 border-sky-200' },
  neutral: { label: 'Neutral', color: 'text-zinc-700 bg-zinc-50 border-zinc-200' },
  negative: { label: 'Negative', color: 'text-rose-700 bg-rose-50 border-rose-200' },
}
