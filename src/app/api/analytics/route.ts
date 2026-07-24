/**
 * GET /api/analytics
 * Returns aggregated analytics for the dashboard charts:
 *   - Funnel
 *   - Reply rate over time (last 14 days, by day)
 *   - Strategy breakdown
 *   - Sentiment breakdown
 *   - AI model usage (calls per model + per task type + avg latency + success rate)
 *   - Industry breakdown
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureDemoUser } from '@/lib/auth'

export async function GET() {
  const userId = await ensureDemoUser()

  const leads = await db.lead.findMany({
    where: { userId, isArchived: false },
    select: {
      status: true,
      industry: true,
      createdAt: true,
      sentAt: true,
      repliedAt: true,
    },
  })
  const emails = await db.emailLog.findMany({
    where: { userId },
    select: {
      direction: true,
      status: true,
      strategyUsed: true,
      sentimentOfReply: true,
      replyIntent: true,
      aiModel: true,
      aiLatencyMs: true,
      createdAt: true,
      sentAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 1000,
  })
  const aiCalls = await db.aiModelCall.findMany({
    where: { userId },
    select: {
      model: true,
      taskType: true,
      latencyMs: true,
      success: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 1000,
  })

  // Funnel
  const funnel = {
    pending: leads.filter((l) => l.status === 'PENDING').length,
    queued: leads.filter((l) => l.status === 'QUEUED').length,
    sent: leads.filter((l) => l.status === 'SENT').length,
    replied: leads.filter((l) => l.status === 'REPLIED').length,
    autoReplied: leads.filter((l) => l.status === 'AUTO_REPLIED').length,
    converted: leads.filter((l) => l.status === 'CONVERTED').length,
    ignored: leads.filter((l) => l.status === 'IGNORED').length,
    failed: leads.filter((l) => l.status === 'FAILED').length,
  }

  // Time series — last 14 days
  const days: { date: string; sent: number; received: number; autoReplied: number }[] = []
  for (let i = 13; i >= 0; i--) {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - i)
    const next = new Date(d)
    next.setDate(d.getDate() + 1)
    days.push({
      date: d.toISOString().slice(0, 10),
      sent: emails.filter(
        (e) =>
          e.direction === 'OUTREACH' &&
          e.sentAt &&
          e.sentAt >= d &&
          e.sentAt < next
      ).length,
      received: emails.filter(
        (e) =>
          e.direction === 'INBOUND_REPLY' &&
          e.createdAt >= d &&
          e.createdAt < next
      ).length,
      autoReplied: emails.filter(
        (e) =>
          e.direction === 'AUTO_REPLY' &&
          e.sentAt &&
          e.sentAt >= d &&
          e.sentAt < next
      ).length,
    })
  }

  // Strategy breakdown
  const byStrategy: Record<string, { sent: number; replies: number }> = {}
  for (const e of emails) {
    if (e.direction === 'OUTREACH' && e.status === 'SENT') {
      const k = e.strategyUsed || 'unknown'
      byStrategy[k] = byStrategy[k] || { sent: 0, replies: 0 }
      byStrategy[k].sent++
    }
  }
  for (const e of emails) {
    if (e.direction === 'INBOUND_REPLY') {
      const k = e.replyIntent || 'unknown'
      byStrategy[k] = byStrategy[k] || { sent: 0, replies: 0 }
      byStrategy[k].replies++
    }
  }
  const strategyBreakdown = Object.entries(byStrategy).map(([k, v]) => ({
    strategy: k,
    sent: v.sent,
    replies: v.replies,
    replyRate: v.sent > 0 ? v.replies / v.sent : 0,
  }))

  // Sentiment breakdown
  const sentiment: Record<string, number> = {
    positive: 0,
    negative: 0,
    neutral: 0,
    curious: 0,
  }
  for (const e of emails) {
    if (e.direction === 'INBOUND_REPLY' && e.sentimentOfReply) {
      sentiment[e.sentimentOfReply] = (sentiment[e.sentimentOfReply] || 0) + 1
    }
  }

  // AI model usage
  const byModel: Record<
    string,
    { calls: number; success: number; totalLatency: number }
  > = {}
  const byModelTask: Record<string, Record<string, { calls: number; avgLatency: number; success: number }>> = {}
  for (const c of aiCalls) {
    byModel[c.model] = byModel[c.model] || { calls: 0, success: 0, totalLatency: 0 }
    byModel[c.model].calls++
    if (c.success) byModel[c.model].success++
    byModel[c.model].totalLatency += c.latencyMs

    byModelTask[c.model] = byModelTask[c.model] || {}
    byModelTask[c.model][c.taskType] = byModelTask[c.model][c.taskType] || {
      calls: 0,
      avgLatency: 0,
      success: 0,
    }
    byModelTask[c.model][c.taskType].calls++
    byModelTask[c.model][c.taskType].avgLatency += c.latencyMs
    if (c.success) byModelTask[c.model][c.taskType].success++
  }
  const aiModelUsage = Object.entries(byModel).map(([model, v]) => ({
    model,
    calls: v.calls,
    successRate: v.calls > 0 ? v.success / v.calls : 0,
    avgLatencyMs: v.calls > 0 ? Math.round(v.totalLatency / v.calls) : 0,
    byTask: Object.entries(byModelTask[model] || {}).map(([task, tv]) => ({
      task,
      calls: tv.calls,
      avgLatencyMs: tv.calls > 0 ? Math.round(tv.avgLatency / tv.calls) : 0,
      successRate: tv.calls > 0 ? tv.success / tv.calls : 0,
    })),
  }))

  // AI calls over time (last 14 days, by model)
  const aiCallsByDay: {
    date: string
    nemotron: number
    mistral: number
    minimax: number
    deepseek: number
    gemma: number
  }[] = []
  for (let i = 13; i >= 0; i--) {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - i)
    const next = new Date(d)
    next.setDate(d.getDate() + 1)
    const inDay = aiCalls.filter((c) => c.createdAt >= d && c.createdAt < next)
    aiCallsByDay.push({
      date: d.toISOString().slice(0, 10),
      nemotron: inDay.filter((c) => c.model === 'nemotron-3-super').length,
      mistral: inDay.filter((c) => c.model === 'mistral-small-4').length,
      minimax: inDay.filter((c) => c.model === 'minimax-m3').length,
      deepseek: inDay.filter((c) => c.model === 'deepseek-v4-flash').length,
      gemma: inDay.filter((c) => c.model === 'gemma-4-31b').length,
    })
  }

  // Industry breakdown
  const byIndustry: Record<string, number> = {}
  for (const l of leads) {
    const k = l.industry || 'Unknown'
    byIndustry[k] = (byIndustry[k] || 0) + 1
  }

  // Industry reply-rate breakdown
  const industryPerformance = Object.entries(byIndustry).map(([industry, total]) => {
    // Approximate: count leads in this industry with status REPLIED/AUTO_REPLIED/CONVERTED
    const industryLeads = leads.filter((l) => (l.industry || 'Unknown') === industry)
    const replied = industryLeads.filter((l) =>
      ['REPLIED', 'AUTO_REPLIED', 'CONVERTED'].includes(l.status)
    ).length
    return {
      industry,
      total,
      replied,
      replyRate: total > 0 ? replied / total : 0,
    }
  })

  return NextResponse.json({
    funnel,
    days,
    strategyBreakdown,
    sentiment,
    byIndustry,
    industryPerformance,
    aiModelUsage,
    aiCallsByDay,
    totals: {
      leads: leads.length,
      outreachSent: emails.filter(
        (e) => e.direction === 'OUTREACH' && e.status === 'SENT'
      ).length,
      replies: emails.filter((e) => e.direction === 'INBOUND_REPLY').length,
      autoReplies: emails.filter((e) => e.direction === 'AUTO_REPLY').length,
      aiCalls: aiCalls.length,
    },
  })
}
