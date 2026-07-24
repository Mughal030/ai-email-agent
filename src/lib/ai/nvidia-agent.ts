/**
 * ============================================================================
 * MULTI-MODEL NVIDIA AI AGENT LIBRARY (v2)
 * ============================================================================
 *
 * Each cognitive operation is routed to the BEST model for that task type:
 *
 *   ┌─────────────────────────┬───────────────────────────┬──────────────────────┐
 *   │ Task                    │ Model                     │ Why                  │
 *   ├─────────────────────────┼───────────────────────────┼──────────────────────┤
 *   │ analyzePsychology       │ Deepseek V4 Flash         │ Deep reasoning,      │
 *   │                         │ (thinking=high)           │ long chain-of-thought│
 *   ├─────────────────────────┼───────────────────────────┼──────────────────────┤
 *   │ draftOutreach           │ Gemma 4 31B               │ Natural language     │
 *   │                         │ (enable_thinking)         │ drafting + structure │
 *   ├─────────────────────────┼───────────────────────────┼──────────────────────┤
 *   │ analyzeReply            │ MiniMax-M3                │ Fast classification, │
 *   │                         │                           │ low-latency routing  │
 *   ├─────────────────────────┼───────────────────────────┼──────────────────────┤
 *   │ draftAutoReply          │ Gemma 4 31B               │ Conversational tone  │
 *   │                         │ (enable_thinking)         │ + context awareness  │
 *   ├─────────────────────────┼───────────────────────────┼──────────────────────┤
 *   │ runSelfImprovement      │ Deepseek V4 Flash         │ Deep analytical      │
 *   │                         │ (thinking=high)           │ reasoning over stats │
 *   └─────────────────────────┴───────────────────────────┴──────────────────────┘
 *
 * Every call:
 *   1. Picks the right API key + model + extra_body params
 *   2. Calls NVIDIA /chat/completions
 *   3. Captures BOTH the content AND the "reasoning" / "reasoning_content"
 *      field (Deepseek exposes its chain-of-thought here)
 *   4. Logs a row to AiModelCall table (model, task, latency, success)
 *   5. Returns { content, reasoning, model, latencyMs }
 * ============================================================================
 */

import { db } from '@/lib/db'
import type {
  Lead,
  LeadPsychProfile,
  AgentMemory,
  SystemPrompt,
  EmailLog,
} from '@prisma/client'

// ---------------------------------------------------------------------------
// 0. MODEL REGISTRY — 5 models, each task gets a primary + fallback
// ---------------------------------------------------------------------------
//
// Model lineup (all 5 from your NVIDIA build.nvidia.com account):
//   1. Nemotron-3 Super 120B  — fast deep reasoning (PRIMARY for psychology + self-improve)
//   2. Mistral Small 4 119B   — fast drafting (PRIMARY for outreach + auto-reply)
//   3. MiniMax M3             — fast classification (PRIMARY for reply analysis)
//   4. Deepseek V4 Flash      — deep reasoning (FALLBACK for psychology + self-improve)
//   5. Gemma 4 31B            — natural drafting (FALLBACK for outreach + auto-reply)
//
// If a primary model fails or times out, the fallback is tried automatically.

export type TaskType =
  | 'analyze_psychology'
  | 'draft_outreach'
  | 'analyze_reply'
  | 'draft_auto_reply'
  | 'self_improve'

interface ModelConfig {
  model: string
  apiKey: string
  /** Extra request body params (merged into the request body top-level). */
  extraBody?: Record<string, unknown>
  /** Default sampling params for this model/task. */
  temperature?: number
  topP?: number
  maxTokens?: number
  /** Friendly short label (for the UI + analytics). */
  label: string
}

/** Build the model config for a given (modelKey, task). */
function buildModelConfig(
  modelKey: 'nemotron' | 'mistral' | 'minimax' | 'deepseek' | 'gemma',
  task: TaskType
): ModelConfig {
  switch (modelKey) {
    case 'nemotron': {
      // NVIDIA Nemotron-3 Super 120B — Mamba-Transformer hybrid MoE
      // Uses chat_template_kwargs.enable_thinking + reasoning_budget
      const key = process.env.NVIDIA_KEY_NEMOTRON
      const model =
        process.env.NVIDIA_MODEL_NEMOTRON || 'nvidia/nemotron-3-super-120b-a12b'
      if (!key) throw new Error('NVIDIA_KEY_NEMOTRON not set in .env')
      return {
        model,
        apiKey: key,
        extraBody: {
          chat_template_kwargs: { enable_thinking: true },
          reasoning_budget: 8192,  // cap reasoning tokens to keep it fast
        },
        temperature: 0.4,
        topP: 0.95,
        maxTokens: 4096,
        label: 'nemotron-3-super',
      }
    }

    case 'mistral': {
      // Mistral Small 4 119B — hybrid MoE, fast text generation
      // Uses top-level reasoning_effort. NOTE: Mistral only supports
      // 'high' or 'none' (not 'medium' — that returns a 400 error).
      // We use 'none' for drafting (faster, no reasoning needed for text gen).
      const key = process.env.NVIDIA_KEY_MISTRAL
      const model =
        process.env.NVIDIA_MODEL_MISTRAL || 'mistralai/mistral-small-4-119b-2603'
      if (!key) throw new Error('NVIDIA_KEY_MISTRAL not set in .env')
      return {
        model,
        apiKey: key,
        extraBody: {
          reasoning_effort: 'none',  // no reasoning for drafting = faster
        },
        temperature: 0.10,
        topP: 1.0,
        maxTokens: 4096,
        label: 'mistral-small-4',
      }
    }

    case 'minimax': {
      // MiniMax M3 — fast classification
      const key = process.env.NVIDIA_KEY_MINIMAX
      const model = process.env.NVIDIA_MODEL_MINIMAX || 'minimaxai/minimax-m3'
      if (!key) throw new Error('NVIDIA_KEY_MINIMAX not set in .env')
      return {
        model,
        apiKey: key,
        temperature: 0.3,
        topP: 0.95,
        maxTokens: 2048,
        label: 'minimax-m3',
      }
    }

    case 'deepseek': {
      // Deepseek V4 Flash — deep reasoning (FALLBACK)
      const key = process.env.NVIDIA_KEY_DEEPSEEK
      const model =
        process.env.NVIDIA_MODEL_DEEPSEEK || 'deepseek-ai/deepseek-v4-flash'
      if (!key) throw new Error('NVIDIA_KEY_DEEPSEEK not set in .env')
      return {
        model,
        apiKey: key,
        extraBody: {
          chat_template_kwargs: { thinking: true, reasoning_effort: 'low' },
        },
        temperature: 0.4,
        topP: 0.95,
        maxTokens: 4096,
        label: 'deepseek-v4-flash',
      }
    }

    case 'gemma': {
      // Gemma 4 31B — natural drafting (FALLBACK)
      const key = process.env.NVIDIA_KEY_GEMMA
      const model = process.env.NVIDIA_MODEL_GEMMA || 'google/gemma-4-31b-it'
      if (!key) throw new Error('NVIDIA_KEY_GEMMA not set in .env')
      return {
        model,
        apiKey: key,
        extraBody: {
          chat_template_kwargs: { enable_thinking: true },
        },
        temperature: 0.75,
        topP: 0.95,
        maxTokens: 4096,
        label: 'gemma-4-31b',
      }
    }
  }
}

/** Returns the PRIMARY + FALLBACK model configs for a given task. */
function getModelConfigs(task: TaskType): { primary: ModelConfig; fallback: ModelConfig | null } {
  switch (task) {
    case 'analyze_psychology':
    case 'self_improve':
      // Primary: Nemotron (fast reasoning). Fallback: Deepseek (thorough but slow).
      return {
        primary: buildModelConfig('nemotron', task),
        fallback: buildModelConfig('deepseek', task),
      }

    case 'draft_outreach':
    case 'draft_auto_reply':
      // Primary: Mistral (fast drafting). Fallback: Gemma.
      return {
        primary: buildModelConfig('mistral', task),
        fallback: buildModelConfig('gemma', task),
      }

    case 'analyze_reply':
      // MiniMax is already 100% success at 29s — no fallback needed.
      return {
        primary: buildModelConfig('minimax', task),
        fallback: null,
      }
  }
}

// ---------------------------------------------------------------------------
// 1. LOW-LEVEL NVIDIA CALL — returns content + reasoning + metadata
// ---------------------------------------------------------------------------

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface NvidiaCallResult {
  content: string
  reasoning: string | null   // chain-of-thought (Deepseek/Gemma expose this)
  model: string
  latencyMs: number
  success: boolean
  error?: string
}

export class NvidiaAPIError extends Error {
  status: number
  raw: string
  constructor(message: string, status: number, raw: string) {
    super(message)
    this.status = status
    this.raw = raw
  }
}

const NVIDIA_BASE_URL =
  process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1'

/**
 * Low-level chat completion call with automatic fallback.
 *
 * Tries the PRIMARY model first. If it fails (HTTP error, timeout, or
 * empty content), tries the FALLBACK model (if configured).
 *
 * Captures reasoning + logs to AiModelCall for every attempt (so you can
 * see which model succeeded/failed in the analytics dashboard).
 */
export async function nvidiaChat(
  task: TaskType,
  messages: ChatMessage[],
  opts: {
    temperature?: number
    maxTokens?: number
    topP?: number
    json?: boolean
    userId?: string
    leadId?: string
    emailLogId?: string
  } = {}
): Promise<NvidiaCallResult> {
  const { primary, fallback } = getModelConfigs(task)

  // Try primary first
  const primaryResult = await callModel(primary, task, messages, opts)
  if (primaryResult.success && primaryResult.content) {
    return primaryResult
  }

  // Primary failed — try fallback if configured
  if (fallback) {
    console.warn(
      `[nvidia:${task}] primary (${primary.label}) failed: ${primaryResult.error}. Trying fallback (${fallback.label})...`
    )
    const fallbackResult = await callModel(fallback, task, messages, opts)
    if (fallbackResult.success && fallbackResult.content) {
      return fallbackResult
    }
    // Both failed — return the primary's result (it has the original error)
    return primaryResult
  }

  return primaryResult
}

/** Internal: call a single model config. */
async function callModel(
  cfg: ModelConfig,
  task: TaskType,
  messages: ChatMessage[],
  opts: {
    temperature?: number
    maxTokens?: number
    topP?: number
    json?: boolean
    userId?: string
    leadId?: string
    emailLogId?: string
  }
): Promise<NvidiaCallResult> {
  const startTime = Date.now()

  const body: Record<string, unknown> = {
    model: cfg.model,
    messages,
    temperature: opts.temperature ?? cfg.temperature ?? 0.7,
    top_p: opts.topP ?? cfg.topP ?? 0.9,
    max_tokens: opts.maxTokens ?? cfg.maxTokens ?? 2048,
    stream: false,
  }
  if (cfg.extraBody) {
    Object.assign(body, cfg.extraBody)
  }
  if (opts.json) {
    body.response_format = { type: 'json_object' }
  }

  let content = ''
  let reasoning: string | null = null
  let success = true
  let errorMessage: string | undefined

  try {
    const res = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    })

    const raw = await res.text()
    if (!res.ok) {
      throw new NvidiaAPIError(
        `NVIDIA ${res.status}: ${raw.slice(0, 400)}`,
        res.status,
        raw
      )
    }

    const json = JSON.parse(raw)
    const msg = json?.choices?.[0]?.message ?? {}
    content = msg.content ?? ''
    // All reasoning-capable models expose "reasoning" or "reasoning_content"
    reasoning =
      (msg.reasoning as string) ||
      (msg.reasoning_content as string) ||
      null

    // If reasoning is null but model uses enable_thinking, content may
    // contain <think>...</think> tags — extract them.
    if (!reasoning && content.includes('<think>')) {
      const m = content.match(/<think>([\s\S]*?)<\/think>/)
      if (m) {
        reasoning = m[1].trim()
        content = content.replace(/<think>[\s\S]*?<\/think>/, '').trim()
      }
    }

    // If content is empty, treat as failure (so fallback triggers)
    if (!content) {
      success = false
      errorMessage = 'Empty response from model'
    }
  } catch (e) {
    success = false
    errorMessage = (e as Error).message
    console.error(`[nvidia:${task}:${cfg.label}] failed:`, errorMessage)
  }

  const latencyMs = Date.now() - startTime

  // Persist analytics row
  if (opts.userId) {
    try {
      await db.aiModelCall.create({
        data: {
          userId: opts.userId,
          model: cfg.label,
          taskType: task,
          leadId: opts.leadId || null,
          emailLogId: opts.emailLogId || null,
          latencyMs,
          success,
          errorMessage: errorMessage || null,
          outputPreview: content.slice(0, 500) || null,
        },
      })
    } catch (e) {
      console.error('[nvidia] failed to log AiModelCall:', e)
    }
  }

  return {
    content,
    reasoning,
    model: cfg.label,
    latencyMs,
    success,
    error: errorMessage,
  }
}

// ---------------------------------------------------------------------------
// 2. MEMORY RETRIEVAL
// ---------------------------------------------------------------------------

export async function retrieveRelevantMemory(
  userId: string,
  lead: Pick<Lead, 'industry' | 'role' | 'companySize'>
): Promise<{ memoryText: string; memories: AgentMemory[] }> {
  const memories = await db.agentMemory.findMany({
    where: {
      userId,
      isActive: true,
      OR: [
        { scope: 'GLOBAL' },
        ...(lead.industry
          ? [{ scope: 'INDUSTRY' as const, scopeKey: lead.industry }]
          : []),
        ...(lead.role
          ? [{ scope: 'ROLE' as const, scopeKey: lead.role }]
          : []),
        ...(lead.companySize
          ? [{ scope: 'COMPANY_SIZE' as const, scopeKey: lead.companySize }]
          : []),
      ],
    },
    orderBy: [{ impactScore: 'desc' }, { createdAt: 'desc' }],
    take: 12,
  })

  if (memories.length === 0) {
    return { memoryText: '(no prior lessons — this is a cold start)', memories }
  }

  const lines = memories.map((m, i) => {
    const scopeTag =
      m.scope === 'GLOBAL' ? '[global]' : `[${m.scope}:${m.scopeKey}]`
    return `${i + 1}. ${scopeTag} ${m.lesson} (impact: ${m.impactScore.toFixed(
      2
    )}, sample: ${m.sampleSize}, positiveRate: ${m.positiveRate.toFixed(2)})`
  })

  return { memoryText: lines.join('\n'), memories }
}

// ---------------------------------------------------------------------------
// 3. SYSTEM PROMPT ASSEMBLY
// ---------------------------------------------------------------------------

const AGENT_OPERATING_PRINCIPLES = `
You are operating as an autonomous sales agent for a Guest Posting Services company.

OUR BUSINESS: We provide guest posting services — writing and publishing articles on relevant industry blogs with do-follow backlinks to the client's website. This builds SEO authority, drives organic traffic, and increases brand awareness.

OUTREACH STRATEGY (CRITICAL):
- FIRST EMAIL (cold outreach): Keep it SIMPLE and CURIOUS. Do NOT explain guest posting in detail. Just mention you help with "content and SEO" or "online visibility" and ask a simple question. The goal is to get a REPLY, not to sell. Think of it as starting a conversation, not pitching.
- AFTER REPLY (auto-reply): NOW you can mention guest posting services — backlinks, brand awareness, SEO. The lead is interested, so go deeper. Explain what you do, how it helps them specifically, and propose a call.

NON-NEGOTIABLE OPERATING PRINCIPLES:
1. Emails MUST be short: 60–120 words for outreach, 40–80 words for replies.
2. No buzzword soup. No "I hope this email finds you well." No "circle back".
3. One single ask per email. Make the ask tiny and frictionless.
4. Subject lines must be ≤6 words and create genuine curiosity.
5. Personalize using ONLY the lead background provided — never invent facts.
6. Never use deceptive subject lines (RE:/FW: faking, fake familiarity).
7. Match the lead's industry vocabulary, but never name-drop tools you don't know they use.
8. Always end with a clear, specific question — never an open-ended "let me know".
9. If the lead replied, address what they said before pivoting. Never ignore their message.
10. If you don't have enough information to personalize well, default to brevity over filler.

You will receive:
  - The STRATEGY (the user-defined system prompt — your north star)
  - The LEAD BACKGROUND (factual context)
  - The PSYCHOLOGICAL PROFILE (your prior analysis, if any)
  - The AGENT MEMORY (lessons learned from past emails — weight these heavily)

When asked for JSON, return ONLY valid JSON — no markdown fences, no commentary, no <think> tags in the JSON.
`.trim()

export function buildSystemMessage(opts: {
  systemPrompt: SystemPrompt | null
  memoryText: string
}): string {
  const strategy =
    opts.systemPrompt?.content?.trim() ||
    'No explicit strategy defined — apply sound sales psychology.'
  return [
    `=== AGENT STRATEGY (user-defined) ===`,
    strategy,
    ``,
    `=== OPERATING PRINCIPLES (always-on) ===`,
    AGENT_OPERATING_PRINCIPLES,
    ``,
    `=== AGENT MEMORY — lessons from past outcomes ===`,
    opts.memoryText,
  ].join('\n')
}

// ---------------------------------------------------------------------------
// 4. LEAD BACKGROUND FORMATTER
// ---------------------------------------------------------------------------

export function formatLeadBackground(lead: Lead): string {
  return [
    `Name: ${lead.name}`,
    `Email: ${lead.email}`,
    lead.company ? `Company: ${lead.company}` : null,
    lead.role ? `Role: ${lead.role}` : null,
    lead.industry ? `Industry: ${lead.industry}` : null,
    lead.companySize ? `Company size: ${lead.companySize}` : null,
    lead.linkedinUrl ? `LinkedIn: ${lead.linkedinUrl}` : null,
    lead.notes ? `Notes: ${lead.notes}` : null,
  ]
    .filter(Boolean)
    .join('\n')
}

function formatPsychProfile(p: LeadPsychProfile | null): string {
  if (!p) return '(no psychological profile yet — first contact)'
  return [
    `Archetype: ${p.personalityArchetype ?? 'unknown'}`,
    `Dominant motivator: ${p.dominantMotivator ?? 'unknown'}`,
    `Communication style: ${p.communicationStyle ?? 'unknown'}`,
    `Pain points: ${p.painPoints ?? 'unknown'}`,
    `Recommended angle: ${p.angleRecommended ?? 'unknown'}`,
    `Confidence: ${p.confidence.toFixed(2)} (v${p.version})`,
  ].join('\n')
}

// ---------------------------------------------------------------------------
// 5. COGNITIVE OPERATION #1 — analyzePsychology (Deepseek V4 Flash)
// ---------------------------------------------------------------------------

export interface PsychAnalysisResult {
  personalityArchetype: string
  dominantMotivator: string
  communicationStyle: string
  painPoints: string[]
  angleRecommended: string
  reasoningTrace: string
  confidence: number
}

export interface AnalyzePsychologyCallResult extends PsychAnalysisResult {
  aiModel: string
  aiReasoning: string | null
  aiLatencyMs: number
}

export async function analyzePsychology(opts: {
  userId: string
  systemPrompt: SystemPrompt | null
  lead: Lead
  memoryText: string
}): Promise<AnalyzePsychologyCallResult> {
  const system = buildSystemMessage({
    systemPrompt: opts.systemPrompt,
    memoryText: opts.memoryText,
  })

  const user = [
    `TASK: Analyze the lead's psychology and pick the single best outreach angle.`,
    ``,
    `=== LEAD BACKGROUND ===`,
    formatLeadBackground(opts.lead),
    ``,
    `Using the strategy above + the lead's industry / role / company context, infer:`,
    `- personalityArchetype: one short label (e.g. "Pragmatic Operator")`,
    `- dominantMotivator: what truly drives their decisions (speed, cost, status, innovation, risk-avoidance)`,
    `- communicationStyle: how they prefer to be talked to (direct, story-driven, data-heavy)`,
    `- painPoints: 2–4 specific inferred pain points in this industry/role`,
    `- angleRecommended: the single psychological angle you'd use for the first email`,
    `- reasoningTrace: 3–5 sentences of chain-of-thought explaining your reasoning`,
    `- confidence: 0..1 — how confident you are given available information`,
    ``,
    `Return ONLY a JSON object with those exact keys.`,
  ].join('\n')

  const result = await nvidiaChat(
    'analyze_psychology',
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    {
      temperature: 0.4,
      maxTokens: 4096,
      json: true,
      userId: opts.userId,
      leadId: opts.lead.id,
    }
  )

  const parsed = parseJsonLoose<PsychAnalysisResult>(result.content, {
    personalityArchetype: 'Unknown',
    dominantMotivator: 'unknown',
    communicationStyle: 'direct',
    painPoints: [],
    angleRecommended: 'curiosity',
    reasoningTrace: result.reasoning || result.content.slice(0, 500),
    confidence: 0.4,
  })

  // If the model didn't provide a reasoning trace, use its chain-of-thought
  if (parsed.reasoningTrace.length < 30 && result.reasoning) {
    parsed.reasoningTrace = result.reasoning.slice(0, 1500)
  }

  return {
    ...parsed,
    aiModel: result.model,
    aiReasoning: result.reasoning,
    aiLatencyMs: result.latencyMs,
  }
}

// ---------------------------------------------------------------------------
// 6. COGNITIVE OPERATION #2 — draftOutreach (Gemma 4 31B)
// ---------------------------------------------------------------------------

export interface DraftEmailResult {
  subject: string
  body: string
  strategyUsed: string
  psychAnalysis: string
}

export interface DraftOutreachCallResult extends DraftEmailResult {
  aiModel: string
  aiReasoning: string | null
  aiLatencyMs: number
}

export async function draftOutreach(opts: {
  userId: string
  systemPrompt: SystemPrompt | null
  lead: Lead
  profile: LeadPsychProfile | null
  memoryText: string
}): Promise<DraftOutreachCallResult> {
  const system = buildSystemMessage({
    systemPrompt: opts.systemPrompt,
    memoryText: opts.memoryText,
  })

  const user = [
    `TASK: Draft a single cold-outreach email to this lead.`,
    ``,
    `=== LEAD BACKGROUND ===`,
    formatLeadBackground(opts.lead),
    ``,
    `=== PSYCHOLOGICAL PROFILE ===`,
    formatPsychProfile(opts.profile),
    ``,
    `Apply the recommended angle from the profile. Use the lead's industry vocabulary.`,
    `IMPORTANT: This is a COLD FIRST EMAIL. Keep it SIMPLE and CURIOUS.`,
    `Do NOT explain guest posting, backlinks, or SEO in detail. Just mention you help with "content and SEO" or "online visibility" — one sentence max.`,
    `The goal is to start a conversation and get a REPLY, not to pitch or sell.`,
    `Think: short, curious, personal. Like asking a genuine question, not making a sales pitch.`,
    `Subject ≤6 words. Body 60–100 words. Do NOT include a sign-off — the system appends the sender's name automatically.`,
    `One single, tiny ask at the end.`,
    ``,
    `Return ONLY a JSON object with these keys:`,
    `- subject: string`,
    `- body: string (plain text, with proper paragraph breaks)`,
    `- strategyUsed: short label naming the technique (e.g. "curiosity+pattern-interrupt")`,
    `- psychAnalysis: 2–3 sentences explaining WHY this email will land for this specific lead`,
  ].join('\n')

  const result = await nvidiaChat(
    'draft_outreach',
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    {
      temperature: 0.75,
      maxTokens: 2048,
      json: true,
      userId: opts.userId,
      leadId: opts.lead.id,
    }
  )

  const parsed = parseJsonLoose<DraftEmailResult>(result.content, {
    subject: 'Quick question',
    body: result.content.slice(0, 600),
    strategyUsed: 'fallback-direct',
    psychAnalysis: 'No analysis available — fallback used.',
  })

  return {
    ...parsed,
    aiModel: result.model,
    aiReasoning: result.reasoning,
    aiLatencyMs: result.latencyMs,
  }
}

// ---------------------------------------------------------------------------
// 7. COGNITIVE OPERATION #3 — analyzeReply (MiniMax-M3)
// ---------------------------------------------------------------------------

export interface ReplyAnalysisResult {
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
}

export interface ReplyAnalysisCallResult extends ReplyAnalysisResult {
  aiModel: string
  aiReasoning: string | null
  aiLatencyMs: number
}

export async function analyzeReply(opts: {
  userId: string
  systemPrompt: SystemPrompt | null
  lead: Lead
  profile: LeadPsychProfile | null
  replyText: string
  memoryText: string
}): Promise<ReplyAnalysisCallResult> {
  const system = buildSystemMessage({
    systemPrompt: opts.systemPrompt,
    memoryText: opts.memoryText,
  })

  const user = [
    `TASK: Analyze a lead's reply and decide the next action.`,
    ``,
    `=== LEAD BACKGROUND ===`,
    formatLeadBackground(opts.lead),
    ``,
    `=== LEAD'S REPLY (verbatim) ===`,
    `"${opts.replyText}"`,
    ``,
    `Classify the reply along these axes:`,
    `- sentiment: positive | negative | neutral | curious`,
    `- intent: interested | objection | not_interested | ooo | question | meeting_request | unsubscribe`,
    `- summary: 1 sentence capturing the gist`,
    `- nextBestAction: auto_reply | human_handoff | close_loop | opt_out`,
    `    * auto_reply: confident the AI can move this forward (curious/interested/question/objection-with-handle)`,
    `    * human_handoff: high-value signal (meeting_request, big objection, executive reply)`,
    `    * close_loop: not_interested but polite — send a graceful exit, then archive`,
    `    * opt_out: explicit unsubscribe request — DO NOT reply, mark opt_out`,
    `- reasoningTrace: 2–3 sentences`,
    ``,
    `Return ONLY JSON.`,
  ].join('\n')

  const result = await nvidiaChat(
    'analyze_reply',
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    {
      temperature: 0.3,
      maxTokens: 1500,
      json: true,
      userId: opts.userId,
      leadId: opts.lead.id,
    }
  )

  const parsed = parseJsonLoose<ReplyAnalysisResult>(result.content, {
    sentiment: 'neutral',
    intent: 'question',
    summary: result.content.slice(0, 200),
    nextBestAction: 'human_handoff',
    reasoningTrace: result.reasoning || 'Defaulted to human handoff for safety.',
  })

  return {
    ...parsed,
    aiModel: result.model,
    aiReasoning: result.reasoning,
    aiLatencyMs: result.latencyMs,
  }
}

// ---------------------------------------------------------------------------
// 8. COGNITIVE OPERATION #4 — draftAutoReply (Gemma 4 31B)
// ---------------------------------------------------------------------------

export interface DraftReplyResult {
  body: string
  strategyUsed: string
  psychAnalysis: string
}

export interface DraftReplyCallResult extends DraftReplyResult {
  aiModel: string
  aiReasoning: string | null
  aiLatencyMs: number
}

export async function draftAutoReply(opts: {
  userId: string
  systemPrompt: SystemPrompt | null
  lead: Lead
  profile: LeadPsychProfile | null
  thread: EmailLog[]
  replyAnalysis: ReplyAnalysisResult
  memoryText: string
}): Promise<DraftReplyCallResult> {
  const system = buildSystemMessage({
    systemPrompt: opts.systemPrompt,
    memoryText: opts.memoryText,
  })

  const threadText = opts.thread
    .map((e) => {
      const dir = e.direction === 'INBOUND_REPLY' ? 'LEAD' : 'AGENT'
      return `--- ${dir} (${e.createdAt.toISOString()}) ---\nSubject: ${e.subject ?? '(no subject)'}\n${e.bodyText}`
    })
    .join('\n\n')

  const user = [
    `TASK: Draft a single contextual reply that pushes the conversation forward.`,
    ``,
    `=== LEAD BACKGROUND ===`,
    formatLeadBackground(opts.lead),
    ``,
    `=== PSYCHOLOGICAL PROFILE ===`,
    formatPsychProfile(opts.profile),
    ``,
    `=== REPLY ANALYSIS (already done) ===`,
    `Sentiment: ${opts.replyAnalysis.sentiment}`,
    `Intent: ${opts.replyAnalysis.intent}`,
    `Recommended action: ${opts.replyAnalysis.nextBestAction}`,
    ``,
    `=== THREAD ===`,
    threadText,
    ``,
    `Rules:`,
    `- Address what the lead JUST said before pivoting.`,
    `- Body 40–80 words. One ask.`,
    `- If they raised an objection, acknowledge it first, then reframe.`,
    `- If they asked a question, answer it concisely first, then ask a question back.`,
    `- Do NOT sign off — the system appends the signature.`,
    ``,
    `CRITICAL — OUR BUSINESS CONTEXT:`,
    `We offer GUEST POSTING SERVICES — we write and publish articles on relevant`,
    `industry blogs with do-follow backlinks to the client's website. This builds`,
    `SEO authority, drives organic traffic, and increases brand awareness.`,
    ``,
    `Every auto-reply MUST mention our guest posting services as the solution:`,
    `- If they ask "how can you help me" → explain we do guest posting (backlinks, brand awareness, SEO)`,
    `- If they're curious → mention specific publications in their industry we can place articles on`,
    `- If they have an objection → acknowledge, then reframe around the SEO/traffic value of guest posts`,
    `- If they're interested → propose a quick call to discuss guest posting opportunities for their site`,
    ``,
    `Example phrases to include naturally:`,
    `- "We place guest posts on [industry-relevant] blogs with do-follow backlinks to your site"`,
    `- "Our guest posting service handles the writing, outreach, and placement — you get the backlinks"`,
    `- "Guest posts on DA 20-90+ sites build your domain authority and drive referral traffic"`,
    ``,
    `Return ONLY JSON:`,
    `- body: string (plain text)`,
    `- strategyUsed: short label`,
    `- psychAnalysis: 1–2 sentences on why this reply advances the conversation`,
  ].join('\n')

  const result = await nvidiaChat(
    'draft_auto_reply',
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    {
      temperature: 0.7,
      maxTokens: 1500,
      json: true,
      userId: opts.userId,
      leadId: opts.lead.id,
    }
  )

  const parsed = parseJsonLoose<DraftReplyResult>(result.content, {
    body: result.content.slice(0, 400),
    strategyUsed: 'fallback-acknowledge',
    psychAnalysis: 'Fallback reply used.',
  })

  return {
    ...parsed,
    aiModel: result.model,
    aiReasoning: result.reasoning,
    aiLatencyMs: result.latencyMs,
  }
}

// ---------------------------------------------------------------------------
// 9. COGNITIVE OPERATION #5 — runSelfImprovement (Deepseek V4 Flash)
// ---------------------------------------------------------------------------

export interface SelfImprovementResult {
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
}

export interface SelfImprovementCallResult extends SelfImprovementResult {
  aiModel: string
  aiReasoning: string | null
  aiLatencyMs: number
}

export async function runSelfImprovement(opts: {
  userId: string
  systemPrompt: SystemPrompt | null
  windowStart: Date
  windowEnd: Date
  emailLogs: EmailLog[]
  existingMemories: AgentMemory[]
}): Promise<SelfImprovementCallResult> {
  const memoryText = opts.existingMemories
    .map(
      (m, i) =>
        `${i + 1}. [${m.scope}${m.scopeKey ? ':' + m.scopeKey : ''}] ${m.lesson} (impact ${m.impactScore}, sample ${m.sampleSize})`
    )
    .join('\n')

  const system = buildSystemMessage({
    systemPrompt: opts.systemPrompt,
    memoryText: memoryText || '(no prior memories)',
  })

  const outbound = opts.emailLogs.filter(
    (e) => e.direction === 'OUTREACH' && e.status === 'SENT'
  )
  const replies = opts.emailLogs.filter((e) => e.direction === 'INBOUND_REPLY')
  const positiveReplies = opts.emailLogs.filter(
    (e) =>
      e.direction === 'INBOUND_REPLY' &&
      (e.sentimentOfReply === 'positive' || e.sentimentOfReply === 'curious')
  )
  const replyRate = outbound.length > 0 ? replies.length / outbound.length : 0
  const positiveRate = replies.length > 0 ? positiveReplies.length / replies.length : 0

  const byStrategy: Record<string, { sent: number; replies: number; positive: number }> = {}
  for (const e of outbound) {
    const strat = e.strategyUsed || 'unknown'
    byStrategy[strat] = byStrategy[strat] || { sent: 0, replies: 0, positive: 0 }
    byStrategy[strat].sent++
  }
  for (const e of replies) {
    const strat = e.replyIntent || 'unknown'
    byStrategy[strat] = byStrategy[strat] || { sent: 0, replies: 0, positive: 0 }
    byStrategy[strat].replies++
    if (e.sentimentOfReply === 'positive' || e.sentimentOfReply === 'curious') {
      byStrategy[strat].positive++
    }
  }

  const user = [
    `TASK: Self-improvement analysis. Look at the recent outcomes and propose lessons.`,
    ``,
    `=== ANALYSIS WINDOW ===`,
    `${opts.windowStart.toISOString()} → ${opts.windowEnd.toISOString()}`,
    ``,
    `=== HEADLINE METRICS ===`,
    `Outreach emails sent: ${outbound.length}`,
    `Replies received: ${replies.length}`,
    `Positive replies: ${positiveReplies.length}`,
    `Reply rate: ${(replyRate * 100).toFixed(1)}%`,
    `Positive reply rate (of replies): ${(positiveRate * 100).toFixed(1)}%`,
    ``,
    `=== BREAKDOWN BY STRATEGY ===`,
    JSON.stringify(byStrategy, null, 2),
    ``,
    `=== RECENT INBOUND REPLIES (sample, for sentiment patterns) ===`,
    opts.emailLogs
      .filter((e) => e.direction === 'INBOUND_REPLY')
      .slice(-10)
      .map(
        (e) =>
          `[${e.sentimentOfReply}/${e.replyIntent}] ${e.bodyText.slice(0, 180)}`
      )
      .join('\n') || '(none)',
    ``,
    `Propose 0–5 NEW lessons (only if there is statistical signal — sample ≥ 3).`,
    `Also propose which existing lessons should be retired (low sample, no impact).`,
    `Each new lesson should be specific and actionable, e.g. "Shorter curiosity-driven subject lines get 20% more replies in SaaS" not "Be more concise".`,
    ``,
    `Return ONLY JSON:`,
    `- summary: 1-sentence headline of what changed`,
    `- newLessons: array (see schema)`,
    `- retireLessonHints: array of short strings identifying memories to retire`,
    `- metricsJson: { replyRate, positiveRate, byStrategy }`,
  ].join('\n')

  const result = await nvidiaChat(
    'self_improve',
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    {
      temperature: 0.4,
      maxTokens: 6144,
      json: true,
      userId: opts.userId,
    }
  )

  const parsed = parseJsonLoose<SelfImprovementResult>(result.content, {
    summary: 'No new insights generated.',
    newLessons: [],
    retireLessonHints: [],
    metricsJson: { replyRate, positiveRate, byStrategy },
  })

  return {
    ...parsed,
    aiModel: result.model,
    aiReasoning: result.reasoning,
    aiLatencyMs: result.latencyMs,
  }
}

// ---------------------------------------------------------------------------
// 10. JSON PARSER — defensive
// ---------------------------------------------------------------------------

function parseJsonLoose<T>(raw: string, fallback: T): T {
  if (!raw) return fallback
  let s = raw.trim()
  // Strip <think>...</think> blocks first
  s = s.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
  const firstBrace = s.indexOf('{')
  const lastBrace = s.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    s = s.slice(firstBrace, lastBrace + 1)
  }
  try {
    return JSON.parse(s) as T
  } catch {
    try {
      const cleaned = s.replace(/,(\s*[}\]])/g, '$1')
      return JSON.parse(cleaned) as T
    } catch {
      console.error('[nvidia] Failed to parse JSON. Raw:', raw.slice(0, 500))
      return fallback
    }
  }
}
