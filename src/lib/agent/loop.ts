/**
 * ============================================================================
 * AUTONOMOUS AGENT LOOP (v2: real SMTP + IMAP + multi-model AI)
 * ============================================================================
 *
 *   processQueuedLead(leadId)
 *     1. analyzePsychology (Deepseek) → persist LeadPsychProfile with reasoning
 *     2. draftOutreach (Gemma) → persist EmailLog with aiModel + aiReasoning
 *     3. sendEmail (SMTP) → update EmailLog status SENT
 *
 *   processInboundReplies()
 *     For every active sender account:
 *       1. Pull our sent SMTP Message-IDs
 *       2. listNewReplies (IMAP) — only replies to our Message-IDs
 *       3. For each new reply:
 *          - analyzeReply (MiniMax) → sentiment + intent + nextBestAction
 *          - If auto_reply → draftAutoReply (Gemma) → sendEmail (SMTP)
 *
 *   runSelfImprovementCycle()
 *     1. Pull last 7 days of EmailLogs
 *     2. runSelfImprovement (Deepseek with thinking=high)
 *     3. Persist new AgentMemory + SelfImprovementLog (with aiReasoning)
 * ============================================================================
 */

import { db } from '@/lib/db'
import {
  analyzePsychology,
  draftOutreach,
  draftAutoReply,
  analyzeReply,
  runSelfImprovement,
  retrieveRelevantMemory,
} from '@/lib/ai/nvidia-agent'
import {
  sendEmail,
  buildThreadKey,
} from '@/lib/email/smtp'
import { listNewReplies } from '@/lib/email/imap'
import { canSendNow } from '@/lib/agent/scheduler'
import { isDemoMode } from '@/lib/ai/demo'
import {
  demoAnalyzePsychology,
  demoDraftOutreach,
  demoAnalyzeReply,
  demoDraftAutoReply,
  demoSelfImprovement,
} from '@/lib/ai/demo'

// ---------------------------------------------------------------------------
// 1. PROCESS A SINGLE QUEUED LEAD
// ---------------------------------------------------------------------------

export async function processQueuedLead(leadId: string): Promise<{
  ok: boolean
  message: string
}> {
  const lead = await db.lead.findUnique({
    where: { id: leadId },
    include: { gmailAccount: true, systemPrompt: true },
  })

  if (!lead) return { ok: false, message: 'Lead not found' }
  if (!lead.gmailAccount) {
    await db.lead.update({
      where: { id: leadId },
      data: { status: 'FAILED' },
    })
    return { ok: false, message: 'No sender account assigned to this lead' }
  }
  if (!lead.gmailAccount.isActive) {
    return { ok: false, message: 'Assigned sender account is paused' }
  }

  const demo = isDemoMode()
  const userId = lead.userId
  const systemPrompt = lead.systemPrompt

  try {
    await db.lead.update({ where: { id: leadId }, data: { status: 'ANALYZING' } })

    const memoryText = demo
      ? '(demo mode — no memory)'
      : (
          await retrieveRelevantMemory(userId, {
            industry: lead.industry || '',
            role: lead.role || '',
            companySize: lead.companySize || '',
          })
        ).memoryText

    // Step 1: psych profile (Deepseek in real mode)
    let profile = await db.leadPsychProfile.findUnique({ where: { leadId } })
    if (!profile) {
      const result = demo
        ? demoAnalyzePsychology({ lead })
        : await analyzePsychology({
            userId,
            systemPrompt,
            lead,
            memoryText,
          })
      profile = await db.leadPsychProfile.create({
        data: {
          leadId,
          personalityArchetype: result.personalityArchetype,
          dominantMotivator: result.dominantMotivator,
          communicationStyle: result.communicationStyle,
          painPoints: JSON.stringify(result.painPoints),
          angleRecommended: result.angleRecommended,
          reasoningTrace: result.reasoningTrace,
          confidence: result.confidence,
          version: 1,
          aiModel: demo ? 'demo' : result.aiModel,
          aiReasoning: demo ? null : result.aiReasoning,
          aiLatencyMs: demo ? null : result.aiLatencyMs,
        },
      })
    }

    // Step 2: draft outreach (Gemma in real mode)
    await db.lead.update({ where: { id: leadId }, data: { status: 'DRAFTING' } })
    const draft = demo
      ? demoDraftOutreach({ lead, profile })
      : await draftOutreach({
          userId,
          systemPrompt,
          lead,
          profile,
          memoryText,
        })

    // Append the sender's name as the email signature
    const senderName = lead.gmailAccount.displayName || 'AI Sales Agent'
    const signedBody = draft.body.endsWith(senderName)
      ? draft.body
      : `${draft.body}\n\n— ${senderName}`

    const threadKey = buildThreadKey(leadId)
    const emailLog = await db.emailLog.create({
      data: {
        userId,
        gmailAccountId: lead.gmailAccountId!,
        leadId,
        systemPromptId: systemPrompt?.id || null,
        direction: 'OUTREACH',
        status: 'PENDING',
        subject: draft.subject,
        bodyText: signedBody,
        strategyUsed: draft.strategyUsed,
        psychAnalysis: draft.psychAnalysis,
        threadKey,
        queuedAt: new Date(),
        aiModel: demo ? 'demo' : draft.aiModel,
        aiReasoning: demo ? null : draft.aiReasoning,
        aiLatencyMs: demo ? null : draft.aiLatencyMs,
      },
    })

    // Step 3: send via real SMTP
    const sent = await sendEmail(lead.gmailAccount, {
      to: lead.email,
      subject: draft.subject,
      bodyText: signedBody,
      fromName: lead.gmailAccount.displayName || 'AI Sales Agent',
    })

    await db.emailLog.update({
      where: { id: emailLog.id },
      data: {
        status: 'SENT',
        smtpMessageId: sent.smtpMessageId,
        threadKey: sent.threadKey,
        sentAt: new Date(),
      },
    })
    await db.lead.update({
      where: { id: leadId },
      data: { status: 'SENT', sentAt: new Date() },
    })

    return {
      ok: true,
      message: `Sent to ${lead.email} via SMTP (model: ${draft.aiModel})`,
    }
  } catch (e) {
    console.error(`[agent] processQueuedLead failed for ${leadId}:`, e)
    await db.lead.update({
      where: { id: leadId },
      data: { status: 'FAILED' },
    })
    return { ok: false, message: (e as Error).message }
  }
}

// ---------------------------------------------------------------------------
// 2. PROCESS INBOUND REPLIES (IMAP)
// ---------------------------------------------------------------------------

export async function processInboundReplies(): Promise<{
  repliesProcessed: number
  autoRepliesSent: number
  errors: string[]
}> {
  const result = {
    repliesProcessed: 0,
    autoRepliesSent: 0,
    errors: [] as string[],
  }

  if (isDemoMode()) {
    return result // demo mode can't poll IMAP without real creds
  }

  const accounts = await db.gmailAccount.findMany({
    where: { isActive: true },
  })

  for (const account of accounts) {
    try {
      // All SMTP Message-IDs we've sent with this account
      const sentLogs = await db.emailLog.findMany({
        where: {
          gmailAccountId: account.id,
          direction: { in: ['OUTREACH', 'AUTO_REPLY'] },
          smtpMessageId: { not: null },
        },
        select: { smtpMessageId: true },
      })
      const ourMessageIds = new Set(
        sentLogs.map((l) => l.smtpMessageId!).filter(Boolean)
      )

      const newReplies = await listNewReplies(account, ourMessageIds)

      for (const reply of newReplies) {
        try {
          // Skip if we already recorded this message
          const existing = await db.emailLog.findFirst({
            where: { smtpMessageId: reply.smtpMessageId },
          })
          if (existing) continue

          // Find the lead by email address (case-insensitive via lowercase)
          const lead = await db.lead.findFirst({
            where: {
              email: { equals: reply.fromAddress.toLowerCase() },
              gmailAccountId: account.id,
            },
            include: { systemPrompt: true, psychProfile: true },
          })
          if (!lead) continue

          const inboundLog = await db.emailLog.create({
            data: {
              userId: lead.userId,
              gmailAccountId: account.id,
              leadId: lead.id,
              systemPromptId: lead.systemPromptId,
              direction: 'INBOUND_REPLY',
              status: 'DELIVERED',
              subject: reply.subject,
              bodyText: reply.bodyText,
              smtpMessageId: reply.smtpMessageId,
              imapUid: reply.imapUid,
              inReplyTo: reply.inReplyTo || null,
              threadKey: buildThreadKey(lead.id),
              receivedAt: reply.receivedAt,
            },
          })

          result.repliesProcessed++

          // Extract just the reply text (strip quoted original email)
          // Gmail/Outlook prepend replies with "On <date>, <sender> wrote:"
          // and quote the original with ">". We only check the actual reply
          // text for opt-out keywords — otherwise the quoted footer
          // "Reply with unsubscribe" triggers a false opt-out.
          const replyOnly = reply.bodyText
            .split(/\n\s*On\s.*wrote:|\n\s*-{2,}\s*Original\s|\n\s*>|\n\s*From:/)[0]
            .trim()
          const lowerReply = replyOnly.toLowerCase()
          const isExplicitOptOut =
            lowerReply.includes('unsubscribe') ||
            lowerReply.includes('stop emailing') ||
            lowerReply.includes('remove me') ||
            lowerReply.includes('not interested') ||
            lowerReply === 'no' ||
            lowerReply === 'stop'

          if (isExplicitOptOut) {
            await db.lead.update({
              where: { id: lead.id },
              data: { status: 'OPT_OUT' },
            })
            await db.emailLog.update({
              where: { id: inboundLog.id },
              data: {
                sentimentOfReply: 'negative',
                replyIntent: 'unsubscribe',
              },
            })
            continue
          }

          const { memoryText } = await retrieveRelevantMemory(lead.userId, {
            industry: lead.industry || '',
            role: lead.role || '',
            companySize: lead.companySize || '',
          })

          // Pass only the actual reply text (not the quoted original) to the AI
          const analysis = await analyzeReply({
            userId: lead.userId,
            systemPrompt: lead.systemPrompt,
            lead,
            profile: lead.psychProfile,
            replyText: replyOnly,
            memoryText,
          })

          await db.emailLog.update({
            where: { id: inboundLog.id },
            data: {
              sentimentOfReply: analysis.sentiment,
              replyIntent: analysis.intent,
              aiModel: analysis.aiModel,
              aiReasoning: analysis.aiReasoning,
              aiLatencyMs: analysis.aiLatencyMs,
            },
          })

          if (analysis.nextBestAction === 'opt_out') {
            await db.lead.update({
              where: { id: lead.id },
              data: { status: 'OPT_OUT', repliedAt: new Date() },
            })
            continue
          }

          if (analysis.nextBestAction === 'human_handoff') {
            await db.lead.update({
              where: { id: lead.id },
              data: { status: 'REPLIED', repliedAt: new Date() },
            })
            continue
          }

          // auto_reply or close_loop → draft and send a reply
          const thread = await db.emailLog.findMany({
            where: { leadId: lead.id },
            orderBy: { createdAt: 'asc' },
            take: 20,
          })

          const draft = await draftAutoReply({
            userId: lead.userId,
            systemPrompt: lead.systemPrompt,
            lead,
            profile: lead.psychProfile,
            thread,
            replyAnalysis: analysis,
            memoryText,
          })

          const replySubject = `Re: ${reply.subject.replace(/^re:\s*/i, '')}`
          const sent = await sendEmail(account, {
            to: lead.email,
            subject: replySubject,
            bodyText: draft.body,
            replyToMessageId: reply.smtpMessageId,
            fromName: account.displayName || 'AI Sales Agent',
          })

          await db.emailLog.create({
            data: {
              userId: lead.userId,
              gmailAccountId: account.id,
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
              inReplyTo: reply.smtpMessageId,
              sentAt: new Date(),
              aiModel: draft.aiModel,
              aiReasoning: draft.aiReasoning,
              aiLatencyMs: draft.aiLatencyMs,
            },
          })
          result.autoRepliesSent++

          await db.lead.update({
            where: { id: lead.id },
            data: {
              status:
                analysis.nextBestAction === 'close_loop' ? 'REPLIED' : 'AUTO_REPLIED',
              repliedAt: new Date(),
              lastAutoReplyAt: new Date(),
            },
          })
        } catch (e) {
          result.errors.push(
            `Reply ${reply.smtpMessageId}: ${(e as Error).message}`
          )
        }
      }
    } catch (e) {
      result.errors.push(`Account ${account.email}: ${(e as Error).message}`)
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// 3. SELF-IMPROVEMENT CYCLE
// ---------------------------------------------------------------------------

export async function runSelfImprovementCycle(userId?: string): Promise<{
  ok: boolean
  summary: string
  newLessonsCount: number
  retiredCount: number
  aiModel?: string
}> {
  const windowEnd = new Date()
  const windowStart = new Date(windowEnd.getTime() - 7 * 24 * 60 * 60 * 1000)

  const where = userId ? { userId } : {}
  const emailLogs = await db.emailLog.findMany({
    where: { ...where, createdAt: { gte: windowStart, lte: windowEnd } },
    orderBy: { createdAt: 'asc' },
  })

  const existingMemories = await db.agentMemory.findMany({
    where: { ...where, isActive: true },
  })

  const systemPrompt = await db.systemPrompt.findFirst({
    where: userId ? { userId, isDefault: true } : { isDefault: true },
  })

  const userIdToUse = userId || (emailLogs[0]?.userId as string)
  if (!userIdToUse) {
    return { ok: false, summary: 'No data', newLessonsCount: 0, retiredCount: 0 }
  }

  try {
    const demo = isDemoMode()
    const result = demo
      ? demoSelfImprovement()
      : await runSelfImprovement({
          userId: userIdToUse,
          systemPrompt,
          windowStart,
          windowEnd,
          emailLogs,
          existingMemories,
        })

    const newMemoryIds: string[] = []
    for (const lesson of result.newLessons) {
      const m = await db.agentMemory.create({
        data: {
          userId: userIdToUse,
          scope: lesson.scope,
          scopeKey: lesson.scopeKey,
          lesson: lesson.lesson,
          category: lesson.category,
          impactScore: lesson.impactScore,
          sampleSize: lesson.sampleSize,
          positiveRate: lesson.positiveRate,
          evidence: JSON.stringify({ windowStart, windowEnd }),
          isActive: true,
          aiModel: demo ? 'demo' : result.aiModel,
        },
      })
      newMemoryIds.push(m.id)
    }

    let retiredCount = 0
    for (const hint of result.retireLessonHints) {
      const candidates = existingMemories.filter((m) =>
        hint
          .toLowerCase()
          .split(/\s+/)
          .some((word) => word.length > 4 && m.lesson.toLowerCase().includes(word))
      )
      for (const c of candidates) {
        await db.agentMemory.update({
          where: { id: c.id },
          data: { isActive: false },
        })
        retiredCount++
      }
    }

    await db.selfImprovementLog.create({
      data: {
        userId: userIdToUse,
        windowStart,
        windowEnd,
        emailsAnalyzed: emailLogs.length,
        leadsAnalyzed: new Set(emailLogs.map((e) => e.leadId)).size,
        summary: result.summary,
        newLessons: JSON.stringify(result.newLessons),
        retiredLessonIds: JSON.stringify(result.retireLessonHints),
        newMemoryIds: JSON.stringify(newMemoryIds),
        metricsJson: JSON.stringify(result.metricsJson),
        aiModel: demo ? 'demo' : result.aiModel,
        aiReasoning: demo ? null : result.aiReasoning,
      },
    })

    return {
      ok: true,
      summary: result.summary,
      newLessonsCount: result.newLessons.length,
      retiredCount,
      aiModel: demo ? 'demo' : result.aiModel,
    }
  } catch (e) {
    console.error('[agent] self-improvement failed:', e)
    return {
      ok: false,
      summary: (e as Error).message,
      newLessonsCount: 0,
      retiredCount: 0,
    }
  }
}

// ---------------------------------------------------------------------------
// 4. TICK — drain scheduled leads + poll inbox
//    Respects: daily limit, send window, scheduledFor time, sender paused
// ---------------------------------------------------------------------------

export async function tick(): Promise<{
  processed: number
  replies: number
  errors: string[]
  skipped: string[]
  senderStatus?: { allowed: boolean; reason: string; remainingToday: number }
}> {
  const skipped: string[] = []

  // Get the active sender account
  const account = await db.gmailAccount.findFirst({
    where: { isActive: true },
  })

  if (!account) {
    return {
      processed: 0,
      replies: 0,
      errors: [],
      skipped: ['No active sender account'],
    }
  }

  // Check sender guard — is sending allowed right now?
  const guard = await canSendNow(account)
  if (!guard.allowed) {
    // Sending not allowed — but still poll inbox for replies
    const replyResult = await processInboundReplies()
    return {
      processed: 0,
      replies: replyResult.repliesProcessed,
      errors: [],
      skipped: [guard.reason],
      senderStatus: guard,
    }
  }

  // Find leads whose scheduledFor has arrived (or who are queued without
  // a schedule — backward compat — but in real mode they should have one)
  const now = new Date()
  const due = await db.lead.findMany({
    where: {
      status: 'QUEUED',
      OR: [
        { scheduledFor: { lte: now } },
        { scheduledFor: null },
      ],
    },
    take: Math.min(5, guard.remainingToday), // never exceed remaining quota
    orderBy: [{ scheduledFor: 'asc' }, { queuedAt: 'asc' }],
  })

  let processed = 0
  const errors: string[] = []
  for (const lead of due) {
    // Re-check quota before each send (in case we hit the limit mid-batch)
    const recheck = await canSendNow(account)
    if (!recheck.allowed) {
      skipped.push(`Quota/window hit mid-batch: ${recheck.reason}`)
      break
    }
    const r = await processQueuedLead(lead.id)
    if (r.ok) processed++
    else if (r.message) errors.push(`${lead.email}: ${r.message}`)
  }

  const replyResult = await processInboundReplies()

  // Mark leads as IGNORED if 7+ days since sent and no reply
  await db.lead.updateMany({
    where: {
      status: 'SENT',
      sentAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    },
    data: { status: 'IGNORED' },
  })

  return {
    processed,
    replies: replyResult.repliesProcessed,
    errors: [...errors, ...replyResult.errors],
    skipped,
    senderStatus: guard,
  }
}
