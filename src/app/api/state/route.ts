import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUserId, ensureDemoUser, isProductionMode } from '@/lib/auth'
import { isDemoMode } from '@/lib/ai/demo'

export async function GET() {
  const productionMode = isProductionMode()
  let userId: string | null

  if (productionMode) {
    userId = await getCurrentUserId()
    if (!userId) {
      return NextResponse.json(
        { requireAuth: true, error: 'Not authenticated' },
        { status: 401 }
      )
    }
  } else {
    userId = await ensureDemoUser()
  }

  const [systemPrompts, gmailAccounts, leads, recentEmails, memory, improvementLogs, aiModelCalls] =
    await Promise.all([
      db.systemPrompt.findMany({
        where: { userId },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      }),
      db.gmailAccount.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      }),
      db.lead.findMany({
        where: { userId, isArchived: false },
        include: { psychProfile: true, gmailAccount: true, systemPrompt: true },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
      db.emailLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: { lead: true },
      }),
      db.agentMemory.findMany({
        where: { userId },
        orderBy: [
          { isActive: 'desc' },
          { impactScore: 'desc' },
          { createdAt: 'desc' },
        ],
        take: 50,
      }),
      db.selfImprovementLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      db.aiModelCall.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    ])

  const leadStats = {
    total: leads.length,
    pending: leads.filter((l) => l.status === 'PENDING').length,
    queued: leads.filter((l) => l.status === 'QUEUED').length,
    sent: leads.filter((l) => l.status === 'SENT').length,
    replied: leads.filter((l) =>
      ['REPLIED', 'AUTO_REPLIED'].includes(l.status)
    ).length,
    autoReplied: leads.filter((l) => l.status === 'AUTO_REPLIED').length,
    ignored: leads.filter((l) => l.status === 'IGNORED').length,
    failed: leads.filter((l) => l.status === 'FAILED').length,
    optedOut: leads.filter((l) => l.status === 'OPT_OUT').length,
    converted: leads.filter((l) => l.status === 'CONVERTED').length,
  }

  const emailStats = {
    totalOutreach: recentEmails.filter(
      (e) => e.direction === 'OUTREACH' && e.status === 'SENT'
    ).length,
    totalReplies: recentEmails.filter((e) => e.direction === 'INBOUND_REPLY')
      .length,
    totalAutoReplies: recentEmails.filter((e) => e.direction === 'AUTO_REPLY')
      .length,
    positiveReplies: recentEmails.filter(
      (e) =>
        e.direction === 'INBOUND_REPLY' &&
        (e.sentimentOfReply === 'positive' || e.sentimentOfReply === 'curious')
    ).length,
  }

  return NextResponse.json({
    demoMode: isDemoMode(),
    requireAuth: productionMode,
    user: { id: userId, email: 'operator@agent.local', name: 'Operator' },
    systemPrompts,
    gmailAccounts: gmailAccounts.map((a) => ({
      id: a.id,
      email: a.email,
      displayName: a.displayName,
      isActive: a.isActive,
      sentToday: a.sentToday,
      lastPollAt: a.lastPollAt,
      createdAt: a.createdAt,
      hasTokens: Boolean(a.encryptedSmtpPass),
      // Scheduler fields
      sendingPaused: a.sendingPaused,
      dailySendLimit: a.dailySendLimit,
      sendWindowStartHour: a.sendWindowStartHour,
      sendWindowEndHour: a.sendWindowEndHour,
      senderTimezone: a.senderTimezone,
      minMinutesBetweenSends: a.minMinutesBetweenSends,
    })),
    leads,
    recentEmails,
    memory,
    improvementLogs,
    aiModelCalls,
    stats: { leads: leadStats, emails: emailStats },
  })
}
