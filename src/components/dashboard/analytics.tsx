'use client'

import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Users,
  Mail,
  MailOpen,
  CornerUpLeft,
  Bot,
  CheckCircle2,
  XCircle,
  TrendingUp,
} from 'lucide-react'
import type { DashboardState } from '@/lib/types'

interface Props {
  state: DashboardState
}

export function StatsOverview({ state }: Props) {
  const { leads: ls, emails: es } = state.stats
  const replyRate = es.totalOutreach > 0 ? (es.totalReplies / es.totalOutreach) * 100 : 0
  const positiveRate = es.totalReplies > 0 ? (es.positiveReplies / es.totalReplies) * 100 : 0

  const cards = [
    {
      label: 'Total Leads',
      value: ls.total,
      sub: `${ls.pending} pending · ${ls.queued} queued`,
      icon: Users,
      color: 'text-zinc-700',
      bg: 'bg-zinc-50',
    },
    {
      label: 'Outreach Sent',
      value: es.totalOutreach,
      sub: `${ls.sent} awaiting reply`,
      icon: Mail,
      color: 'text-sky-700',
      bg: 'bg-sky-50',
    },
    {
      label: 'Replies',
      value: es.totalReplies,
      sub: `${replyRate.toFixed(1)}% reply rate`,
      icon: CornerUpLeft,
      color: 'text-emerald-700',
      bg: 'bg-emerald-50',
    },
    {
      label: 'Auto-Replies',
      value: es.totalAutoReplies,
      sub: `AI-handled`,
      icon: Bot,
      color: 'text-violet-700',
      bg: 'bg-violet-50',
    },
    {
      label: 'Positive Replies',
      value: es.positiveReplies,
      sub: `${positiveRate.toFixed(1)}% of replies`,
      icon: TrendingUp,
      color: 'text-emerald-700',
      bg: 'bg-emerald-50',
    },
    {
      label: 'Converted',
      value: ls.converted,
      sub: `${ls.optedOut} opted out`,
      icon: CheckCircle2,
      color: 'text-emerald-700',
      bg: 'bg-emerald-100',
    },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {cards.map((c) => (
        <Card key={c.label} className="p-4 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{c.label}</span>
            <div className={`p-1.5 rounded ${c.bg}`}>
              <c.icon className={`w-3.5 h-3.5 ${c.color}`} />
            </div>
          </div>
          <div className="text-2xl font-semibold tracking-tight">{c.value}</div>
          <div className="text-xs text-muted-foreground">{c.sub}</div>
        </Card>
      ))}
    </div>
  )
}

export function FunnelCard({ state }: Props) {
  const { leads: ls } = state.stats
  const stages = [
    { label: 'Pending', value: ls.pending, color: 'bg-zinc-400' },
    { label: 'Queued', value: ls.queued, color: 'bg-amber-400' },
    { label: 'Sent', value: ls.sent, color: 'bg-sky-400' },
    { label: 'Replied', value: ls.replied, color: 'bg-emerald-400' },
    { label: 'Auto-Replied', value: ls.autoReplied, color: 'bg-violet-400' },
    { label: 'Converted', value: ls.converted, color: 'bg-emerald-600' },
    { label: 'Ignored', value: ls.ignored, color: 'bg-zinc-300' },
    { label: 'Failed', value: ls.failed, color: 'bg-rose-400' },
  ]
  const max = Math.max(1, ...stages.map((s) => s.value))

  return (
    <Card className="p-5 space-y-3">
      <div>
        <h3 className="font-semibold text-sm">Lead Funnel</h3>
        <p className="text-xs text-muted-foreground">
          How leads flow through the agent pipeline
        </p>
      </div>
      <div className="space-y-2">
        {stages.map((s) => (
          <div key={s.label} className="flex items-center gap-3">
            <div className="w-24 text-xs text-right text-muted-foreground">
              {s.label}
            </div>
            <div className="flex-1 h-5 bg-muted/40 rounded relative overflow-hidden">
              <div
                className={`h-full ${s.color} transition-all`}
                style={{ width: `${(s.value / max) * 100}%` }}
              />
              <div className="absolute inset-0 flex items-center px-2">
                <span className="text-xs font-medium">{s.value}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

export function RecentEmailsCard({ state }: Props) {
  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-sm">Recent Activity</h3>
          <p className="text-xs text-muted-foreground">
            Last {state.recentEmails.length} emails across all leads
          </p>
        </div>
      </div>
      <div className="max-h-80 overflow-y-auto space-y-1.5 pr-1">
        {state.recentEmails.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No emails yet. Queue leads to start the agent.
          </p>
        ) : (
          state.recentEmails.slice(0, 30).map((e) => {
            const isInbound = e.direction === 'INBOUND_REPLY'
            return (
              <div
                key={e.id}
                className="flex items-start gap-2 text-xs p-2 rounded hover:bg-muted/40"
              >
                <div className="mt-0.5">
                  {isInbound ? (
                    <CornerUpLeft className="w-3.5 h-3.5 text-emerald-600" />
                  ) : e.direction === 'AUTO_REPLY' ? (
                    <Bot className="w-3.5 h-3.5 text-violet-600" />
                  ) : e.status === 'SENT' ? (
                    <Mail className="w-3.5 h-3.5 text-sky-600" />
                  ) : (
                    <MailOpen className="w-3.5 h-3.5 text-zinc-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">
                      {e.lead?.name || 'Unknown'}
                    </span>
                    {e.sentimentOfReply && (
                      <Badge variant="outline" className="text-[10px] py-0 px-1">
                        {e.sentimentOfReply}
                      </Badge>
                    )}
                    {e.strategyUsed && (
                      <Badge variant="outline" className="text-[10px] py-0 px-1">
                        {e.strategyUsed}
                      </Badge>
                    )}
                  </div>
                  <div className="text-muted-foreground truncate">
                    {e.subject || '(no subject)'}
                  </div>
                </div>
                <div className="text-muted-foreground whitespace-nowrap">
                  {new Date(e.createdAt).toLocaleDateString()}
                </div>
              </div>
            )
          })
        )}
      </div>
    </Card>
  )
}
