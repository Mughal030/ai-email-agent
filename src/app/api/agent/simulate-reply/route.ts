/**
 * POST /api/agent/simulate-reply
 * DEMO/TESTING ONLY: simulates an inbound reply from a lead so the
 * multi-model reply pipeline can be exercised end-to-end without waiting
 * for a real reply.
 *
 * Body: { leadId: string, replyText?: string }
 *
 * Pipeline exercised:
 *   1. Insert INBOUND_REPLY EmailLog
 *   2. analyzeReply (MiniMax-M3) → sentiment + intent + nextBestAction
 *   3. If auto_reply/close_loop → draftAutoReply (Gemma 4 31B)
 *   4. Send via real SMTP (so you actually receive the auto-reply in your inbox!)
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  isDemoMode,
  demoAnalyzeReply,
  demoDraftAutoReply,
} from '@/lib/ai/demo'
import {
  retrieveRelevantMemory,
  analyzeReply,
  draftAutoReply,
} from '@/lib/ai/nvidia-agent'
import { sendEmail, buildThreadKey } from '@/lib/email/smtp'

const DEMO_REPLIES = [
  'Hi! Curious — how does this work for a team of 20? Send me a 1-pager?',
  'Sure, I can do a 15-min call next Tuesday at 2pm. Send a calendar invite?',
  'Thanks but not interested at this time.',
  'Interesting. What does pricing look like for a SaaS company around $5M ARR?',
  'Out of office until July 15. Please email again then.',
  'This is intriguing. What kind of results have you seen in fintech?',
]

export async function POST(req: Request) {
  const body = await req.json()
  const { leadId, replyText } = body
  if (!leadId) {
    return NextResponse.json({ error: 'leadId required' }, { status: 400 })
  }
  const lead = await db.lead.findUnique({
    where: { id: leadId },
    include: { systemPrompt: true, psychProfile: true, gmailAccount: true },
  })
  if (!lead) {
    return NextResponse.json({ error: 'lead not found' }, { status: 404 })
  }
  if (!lead.gmailAccount) {
    return NextResponse.json(
      { error: 'lead has no sender account' },
      { status: 400 }
    )
  }

  const text = replyText || DEMO_REPLIES[Math.floor(Math.random() * DEMO_REPLIES.length)]
  const demo = isDemoMode()

  // Find the original outreach email so we can thread the reply
  const outreach = await db.emailLog.findFirst({
    where: { leadId, direction: 'OUTREACH', status: 'SENT' },
    orderBy: { sentAt: 'desc' },
  })

  // Create the inbound reply EmailLog
  const inboundLog = await db.emailLog.create({
    data: {
      userId: lead.userId,
      gmailAccountId: lead.gmailAccountId!,
      leadId: lead.id,
      systemPromptId: lead.systemPromptId,
      direction: 'INBOUND_REPLY',
      status: 'DELIVERED',
      subject: outreach ? `Re: ${outreach.subject}` : 'Re: your email',
      bodyText: text,
      smtpMessageId: `<simulated-inbound-${Date.now()}@test.local>`,
      inReplyTo: outreach?.smtpMessageId || null,
      threadKey: buildThreadKey(lead.id),
      receivedAt: new Date(),
    },
  })

  // Opt-out short-circuit
  const lower = text.toLowerCase()
  if (
    lower.includes('unsubscribe') ||
    lower.includes('remove me') ||
    lower.includes('not interested') ||
    lower.includes('no thanks')
  ) {
    await db.lead.update({
      where: { id: lead.id },
      data: { status: 'OPT_OUT', repliedAt: new Date() },
    })
    await db.emailLog.update({
      where: { id: inboundLog.id },
      data: {
        sentimentOfReply: 'negative',
        replyIntent:
          lower.includes('remove') || lower.includes('unsubscribe')
            ? 'unsubscribe'
            : 'not_interested',
      },
    })
    return NextResponse.json({
      ok: true,
      outcome: 'opt_out',
      replyText: text,
    })
  }

  const memoryText = demo
    ? '(demo mode)'
    : (
        await retrieveRelevantMemory(lead.userId, {
          industry: lead.industry || '',
          role: lead.role || '',
          companySize: lead.companySize || '',
        })
      ).memoryText

  const analysis = demo
    ? demoAnalyzeReply({ replyText: text })
    : await analyzeReply({
        userId: lead.userId,
        systemPrompt: lead.systemPrompt,
        lead,
        profile: lead.psychProfile,
        replyText: text,
        memoryText,
      })

  await db.emailLog.update({
    where: { id: inboundLog.id },
    data: {
      sentimentOfReply: analysis.sentiment,
      replyIntent: analysis.intent,
      aiModel: demo ? 'demo' : analysis.aiModel,
      aiReasoning: demo ? null : analysis.aiReasoning,
      aiLatencyMs: demo ? null : analysis.aiLatencyMs,
    },
  })

  if (analysis.nextBestAction === 'human_handoff') {
    await db.lead.update({
      where: { id: lead.id },
      data: { status: 'REPLIED', repliedAt: new Date() },
    })
    return NextResponse.json({
      ok: true,
      outcome: 'human_handoff',
      analysis,
      replyText: text,
    })
  }

  const thread = await db.emailLog.findMany({
    where: { leadId: lead.id },
    orderBy: { createdAt: 'asc' },
    take: 20,
  })

  const draft = demo
    ? demoDraftAutoReply({ lead, replyText: text })
    : await draftAutoReply({
        userId: lead.userId,
        systemPrompt: lead.systemPrompt,
        lead,
        profile: lead.psychProfile,
        thread,
        replyAnalysis: analysis,
        memoryText,
      })

  const replySubject = outreach
    ? `Re: ${outreach.subject.replace(/^re:\s*/i, '')}`
    : 'Re: your email'

  // Send via real SMTP — the user will actually receive this auto-reply
  const sent = await sendEmail(lead.gmailAccount, {
    to: lead.email,
    subject: replySubject,
    bodyText: draft.body,
    replyToMessageId: outreach?.smtpMessageId || inboundLog.smtpMessageId || undefined,
    fromName: lead.gmailAccount.displayName || 'AI Sales Agent',
  })

  const autoReplyLog = await db.emailLog.create({
    data: {
      userId: lead.userId,
      gmailAccountId: lead.gmailAccountId!,
      leadId: lead.id,
      systemPromptId: lead.systemPromptId,
      direction: 'AUTO_REPLY',
      status: 'SENT',
      subject: replySubject,
      bodyText: draft.body,
      strategyUsed: draft.strategyUsed,
      psychAnalysis: draft.psychAnalysis,
      smtpMessageId: sent.smtpMessageId,
      threadKey: sent.threadKey,
      inReplyTo: inboundLog.smtpMessageId,
      sentAt: new Date(),
      aiModel: demo ? 'demo' : draft.aiModel,
      aiReasoning: demo ? null : draft.aiReasoning,
      aiLatencyMs: demo ? null : draft.aiLatencyMs,
    },
  })

  await db.lead.update({
    where: { id: lead.id },
    data: {
      status:
        analysis.nextBestAction === 'close_loop' ? 'REPLIED' : 'AUTO_REPLIED',
      repliedAt: new Date(),
      lastAutoReplyAt: new Date(),
    },
  })

  return NextResponse.json({
    ok: true,
    outcome:
      analysis.nextBestAction === 'close_loop' ? 'close_loop' : 'auto_replied',
    analysis,
    replyText: text,
    autoReplyBody: draft.body,
    autoReplyLogId: autoReplyLog.id,
    autoReplySentViaSmtp: !demo,
  })
}
