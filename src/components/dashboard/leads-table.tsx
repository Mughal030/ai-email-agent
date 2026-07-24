'use client'

import { useState, useMemo } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Sparkles,
  Loader2,
  Hourglass,
  Search,
  ArrowRight,
  Brain,
  Mail,
  MailOpen,
  CornerUpLeft,
  Bot,
  XCircle,
  CheckCircle2,
  MessageSquarePlus,
  CheckSquare,
  Square,
  Zap,
  Archive,
} from 'lucide-react'
import {
  LEAD_STATUS_META,
  SENTIMENT_META,
  type LeadT,
  type EmailLogT,
  type LeadStatus,
} from '@/lib/types'

interface Props {
  leads: LeadT[]
  recentEmails: EmailLogT[]
  gmailAccounts: { id: string; email: string }[]
  demoMode: boolean
  onQueue: (id: string) => Promise<void>
  onPreview: (id: string) => Promise<void>
  onSimulateReply?: (id: string) => Promise<void>
  onQueueAll?: () => Promise<void>
  onBulkAction?: (action: string, leadIds: string[]) => Promise<void>
}

const STATUS_FILTERS: { value: LeadStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'All statuses' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'QUEUED', label: 'Queued' },
  { value: 'SENT', label: 'Sent' },
  { value: 'REPLIED', label: 'Replied' },
  { value: 'AUTO_REPLIED', label: 'Auto-Replied' },
  { value: 'IGNORED', label: 'Ignored' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'OPT_OUT', label: 'Opt-Out' },
]

function StatusIcon({ status }: { status: LeadStatus }) {
  switch (status) {
    case 'PENDING':
    case 'QUEUED':
      return <Hourglass className="w-3.5 h-3.5" />
    case 'ANALYZING':
    case 'DRAFTING':
      return <Brain className="w-3.5 h-3.5" />
    case 'SENT':
      return <Mail className="w-3.5 h-3.5" />
    case 'OPENED':
      return <MailOpen className="w-3.5 h-3.5" />
    case 'REPLIED':
    case 'AUTO_REPLIED':
      return <CornerUpLeft className="w-3.5 h-3.5" />
    case 'IGNORED':
      return <XCircle className="w-3.5 h-3.5" />
    case 'OPT_OUT':
      return <XCircle className="w-3.5 h-3.5" />
    case 'FAILED':
    case 'BOUNCED':
      return <XCircle className="w-3.5 h-3.5" />
    case 'CONVERTED':
      return <CheckCircle2 className="w-3.5 h-3.5" />
    default:
      return null
  }
}

export function LeadsTable({
  leads,
  recentEmails,
  gmailAccounts,
  demoMode,
  onQueue,
  onPreview,
  onSimulateReply,
  onQueueAll,
  onBulkAction,
}: Props) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<LeadStatus | 'ALL'>('ALL')
  const [selectedLead, setSelectedLead] = useState<LeadT | null>(null)
  const [previewing, setPreviewing] = useState<string | null>(null)
  const [queuing, setQueuing] = useState<string | null>(null)
  const [simulating, setSimulating] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [queueAllBusy, setQueueAllBusy] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)

  const filtered = useMemo(() => {
    return leads.filter((l) => {
      if (statusFilter !== 'ALL' && l.status !== statusFilter) return false
      if (search) {
        const q = search.toLowerCase()
        return (
          l.name.toLowerCase().includes(q) ||
          l.email.toLowerCase().includes(q) ||
          (l.company || '').toLowerCase().includes(q) ||
          (l.industry || '').toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [leads, search, statusFilter])

  const emailsByLead = useMemo(() => {
    const m: Record<string, EmailLogT[]> = {}
    for (const e of recentEmails) {
      m[e.leadId] = m[e.leadId] || []
      m[e.leadId].push(e)
    }
    return m
  }, [recentEmails])

  async function handleQueue(id: string) {
    setQueuing(id)
    try {
      await onQueue(id)
    } finally {
      setQueuing(null)
    }
  }

  async function handlePreview(id: string) {
    setPreviewing(id)
    try {
      await onPreview(id)
    } finally {
      setPreviewing(null)
    }
  }

  async function handleSimulateReply(id: string) {
    if (!onSimulateReply) return
    setSimulating(id)
    try {
      await onSimulateReply(id)
    } finally {
      setSimulating(null)
    }
  }

  async function handleQueueAll() {
    if (!onQueueAll) return
    setQueueAllBusy(true)
    try {
      await onQueueAll()
    } finally {
      setQueueAllBusy(false)
    }
  }

  async function handleBulk(action: string) {
    if (!onBulkAction || selectedIds.size === 0) return
    setBulkBusy(true)
    try {
      await onBulkAction(action, Array.from(selectedIds))
      setSelectedIds(new Set())
    } finally {
      setBulkBusy(false)
    }
  }

  function toggleSelect(id: string) {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }

  function selectAllVisible() {
    const visibleIds = filtered.slice(0, 50).map((l) => l.id)
    setSelectedIds(new Set(visibleIds))
  }

  function clearSelection() {
    setSelectedIds(new Set())
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Leads</h2>
          <p className="text-sm text-muted-foreground">
            {filtered.length} of {leads.length} leads shown
            {selectedIds.size > 0 && (
              <span className="ml-2 text-violet-700 font-medium">
                · {selectedIds.size} selected
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {onQueueAll && (
            <Button
              size="sm"
              variant="default"
              onClick={handleQueueAll}
              disabled={queueAllBusy}
              className="bg-violet-600 hover:bg-violet-700"
            >
              {queueAllBusy ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <Zap className="w-3.5 h-3.5 mr-1.5" />
              )}
              Queue All Pending
            </Button>
          )}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search leads..."
              className="pl-8 w-48"
            />
          </div>
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as LeadStatus | 'ALL')}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Bulk action toolbar — shows when leads are selected */}
      {selectedIds.size > 0 && onBulkAction && (
        <Card className="p-2 flex items-center gap-2 bg-violet-50 border-violet-200">
          <span className="text-xs font-medium text-violet-900 px-2">
            {selectedIds.size} selected
          </span>
          <div className="h-4 w-px bg-violet-200" />
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            disabled={bulkBusy}
            onClick={() => handleBulk('queue')}
          >
            <Hourglass className="w-3 h-3 mr-1" />
            Queue Selected
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            disabled={bulkBusy}
            onClick={() => handleBulk('unqueue')}
          >
            Unqueue
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            disabled={bulkBusy}
            onClick={() => handleBulk('archive')}
          >
            <Archive className="w-3 h-3 mr-1" />
            Archive
          </Button>
          <div className="flex-1" />
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={selectAllVisible}
          >
            <CheckSquare className="w-3 h-3 mr-1" />
            Select all visible
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={clearSelection}
          >
            <Square className="w-3 h-3 mr-1" />
            Clear
          </Button>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="w-8 px-3 py-2">
                  <Checkbox
                    checked={
                      filtered.slice(0, 50).length > 0 &&
                      filtered.slice(0, 50).every((l) => selectedIds.has(l.id))
                    }
                    onCheckedChange={(checked) => {
                      if (checked) selectAllVisible()
                      else clearSelection()
                    }}
                  />
                </th>
                <th className="text-left px-3 py-2 font-medium">Lead</th>
                <th className="text-left px-3 py-2 font-medium">Company / Industry</th>
                <th className="text-left px-3 py-2 font-medium">Status</th>
                <th className="text-left px-3 py-2 font-medium">Psych Profile</th>
                <th className="text-left px-3 py-2 font-medium">Last Activity</th>
                <th className="text-right px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                    No leads match this filter. Add leads via &quot;Import Leads (CSV)&quot; above.
                  </td>
                </tr>
              ) : (
                filtered.slice(0, 50).map((lead) => {
                  const meta = LEAD_STATUS_META[lead.status]
                  const emails = (emailsByLead[lead.id] || []).sort(
                    (a, b) =>
                      new Date(b.createdAt).getTime() -
                      new Date(a.createdAt).getTime()
                  )
                  const lastEmail = emails[0]
                  return (
                    <tr
                      key={lead.id}
                      className={`border-b last:border-0 hover:bg-muted/30 cursor-pointer ${
                        selectedIds.has(lead.id) ? 'bg-violet-50/50' : ''
                      }`}
                      onClick={() => setSelectedLead(lead)}
                    >
                      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.has(lead.id)}
                          onCheckedChange={() => toggleSelect(lead.id)}
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="font-medium">{lead.name}</div>
                        <div className="text-xs text-muted-foreground">{lead.email}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div>{lead.company || '—'}</div>
                        <div className="text-xs text-muted-foreground">
                          {[lead.role, lead.industry].filter(Boolean).join(' · ') || '—'}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-md border ${meta.bg} ${meta.color}`}
                        >
                          <StatusIcon status={lead.status} />
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        {lead.psychProfile ? (
                          <div className="space-y-0.5">
                            <div className="text-xs font-medium">
                              {lead.psychProfile.personalityArchetype || '—'}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {lead.psychProfile.angleRecommended || '—'}
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Not analyzed yet</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">
                        {lastEmail ? (
                          <div className="space-y-0.5">
                            <div>
                              {lastEmail.direction === 'INBOUND_REPLY'
                                ? 'Replied'
                                : lastEmail.direction === 'AUTO_REPLY'
                                ? 'Auto-replied'
                                : 'Sent'}
                            </div>
                            <div>
                              {new Date(lastEmail.createdAt).toLocaleDateString()}
                            </div>
                          </div>
                        ) : lead.status === 'QUEUED' && lead.scheduledFor ? (
                          <div className="space-y-0.5">
                            <div className="text-violet-700 font-medium">Scheduled</div>
                            <div>
                              {new Date(lead.scheduledFor).toLocaleString('en-US', {
                                weekday: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                                month: 'short',
                                day: 'numeric',
                              })}
                            </div>
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td
                        className="px-3 py-2.5 text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            disabled={previewing === lead.id}
                            onClick={() => handlePreview(lead.id)}
                          >
                            {previewing === lead.id ? (
                              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                            ) : (
                              <Sparkles className="w-3 h-3 mr-1" />
                            )}
                            AI Preview
                          </Button>
                          {lead.status === 'PENDING' && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-xs"
                              disabled={queuing === lead.id}
                              onClick={() => handleQueue(lead.id)}
                            >
                              {queuing === lead.id ? (
                                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                              ) : (
                                <Hourglass className="w-3 h-3 mr-1" />
                              )}
                              Queue
                            </Button>
                          )}
                          {demoMode && onSimulateReply && lead.status === 'SENT' && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-xs border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                              disabled={simulating === lead.id}
                              onClick={() => handleSimulateReply(lead.id)}
                              title="Demo only: simulate a random inbound reply from this lead"
                            >
                              {simulating === lead.id ? (
                                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                              ) : (
                                <MessageSquarePlus className="w-3 h-3 mr-1" />
                              )}
                              Simulate Reply
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <LeadDetailDialog
        lead={selectedLead}
        emails={selectedLead ? emailsByLead[selectedLead.id] || [] : []}
        onClose={() => setSelectedLead(null)}
      />
    </div>
  )
}

function LeadDetailDialog({
  lead,
  emails,
  onClose,
}: {
  lead: LeadT | null
  emails: EmailLogT[]
  onClose: () => void
}) {
  if (!lead) return null
  const meta = LEAD_STATUS_META[lead.status]
  const sortedEmails = [...emails].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  )

  return (
    <Dialog open={!!lead} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span>{lead.name}</span>
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-md border ${meta.bg} ${meta.color}`}
            >
              {meta.label}
            </span>
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-4">
            {/* Lead info */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <InfoRow label="Email" value={lead.email} />
              <InfoRow label="Company" value={lead.company || '—'} />
              <InfoRow label="Role" value={lead.role || '—'} />
              <InfoRow label="Industry" value={lead.industry || '—'} />
              <InfoRow label="Company size" value={lead.companySize || '—'} />
              <InfoRow label="LinkedIn" value={lead.linkedinUrl || '—'} />
            </div>
            {lead.notes && (
              <div className="text-sm">
                <div className="text-xs text-muted-foreground mb-1">Notes</div>
                <div className="bg-muted/40 rounded p-2">{lead.notes}</div>
              </div>
            )}

            {/* Psych profile */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Brain className="w-4 h-4 text-violet-600" />
                <h4 className="font-medium text-sm">AI Psychological Profile</h4>
              </div>
              {lead.psychProfile ? (
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <InfoRow label="Archetype" value={lead.psychProfile.personalityArchetype || '—'} />
                  <InfoRow label="Dominant motivator" value={lead.psychProfile.dominantMotivator || '—'} />
                  <InfoRow label="Communication style" value={lead.psychProfile.communicationStyle || '—'} />
                  <InfoRow label="Recommended angle" value={lead.psychProfile.angleRecommended || '—'} />
                  <div className="col-span-2">
                    <div className="text-xs text-muted-foreground mb-1">Pain points</div>
                    <div className="bg-muted/40 rounded p-2 text-sm">
                      {(() => {
                        try {
                          return (JSON.parse(lead.psychProfile.painPoints || '[]') as string[]).join(', ')
                        } catch {
                          return lead.psychProfile.painPoints || '—'
                        }
                      })()}
                    </div>
                  </div>
                  <div className="col-span-2">
                    <div className="text-xs text-muted-foreground mb-1 flex items-center gap-2">
                      <span>Reasoning trace</span>
                      {lead.psychProfile.aiModel && (
                        <Badge variant="outline" className="text-[10px] border-violet-200 bg-violet-50 text-violet-700">
                          {lead.psychProfile.aiModel}
                          {lead.psychProfile.aiLatencyMs
                            ? ` · ${lead.psychProfile.aiLatencyMs}ms`
                            : ''}
                        </Badge>
                      )}
                    </div>
                    <div className="bg-violet-50 border border-violet-100 rounded p-2 text-xs font-mono whitespace-pre-wrap">
                      {lead.psychProfile.reasoningTrace || '—'}
                    </div>
                  </div>
                  <InfoRow
                    label="Confidence"
                    value={`${(lead.psychProfile.confidence * 100).toFixed(0)}% (v${lead.psychProfile.version})`}
                  />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No psychological profile yet — the agent will build one when this lead is queued.
                </p>
              )}
            </div>

            {/* Thread */}
            <div>
              <h4 className="font-medium text-sm mb-2">Email Thread ({sortedEmails.length})</h4>
              {sortedEmails.length === 0 ? (
                <p className="text-sm text-muted-foreground">No emails exchanged yet.</p>
              ) : (
                <div className="space-y-2">
                  {sortedEmails.map((e) => {
                    const isInbound = e.direction === 'INBOUND_REPLY'
                    return (
                      <div
                        key={e.id}
                        className={`rounded border p-3 text-sm ${
                          isInbound
                            ? 'bg-emerald-50/50 border-emerald-100'
                            : 'bg-sky-50/50 border-sky-100'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            {isInbound ? (
                              <CornerUpLeft className="w-3.5 h-3.5 text-emerald-600" />
                            ) : e.direction === 'AUTO_REPLY' ? (
                              <Bot className="w-3.5 h-3.5 text-violet-600" />
                            ) : (
                              <ArrowRight className="w-3.5 h-3.5 text-sky-600" />
                            )}
                            <span className="font-medium">
                              {isInbound
                                ? 'Lead replied'
                                : e.direction === 'AUTO_REPLY'
                                ? 'AI auto-reply'
                                : 'Outreach'}
                            </span>
                            {e.strategyUsed && (
                              <Badge variant="outline" className="text-xs">
                                {e.strategyUsed}
                              </Badge>
                            )}
                            {e.sentimentOfReply && (
                              <Badge
                                variant="outline"
                                className={`text-xs ${SENTIMENT_META[e.sentimentOfReply]?.color || ''}`}
                              >
                                {e.sentimentOfReply}
                              </Badge>
                            )}
                            {e.aiModel && e.aiModel !== 'demo' && (
                              <Badge
                                variant="outline"
                                className={`text-xs ${
                                  e.direction === 'INBOUND_REPLY'
                                    ? 'border-amber-200 bg-amber-50 text-amber-700'
                                    : 'border-sky-200 bg-sky-50 text-sky-700'
                                }`}
                              >
                                {e.aiModel}
                                {e.aiLatencyMs ? ` · ${e.aiLatencyMs}ms` : ''}
                              </Badge>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {new Date(e.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <div className="text-xs font-medium mb-1">
                          {e.subject || '(no subject)'}
                        </div>
                        <pre className="text-xs whitespace-pre-wrap font-sans bg-white/60 rounded p-2">
                          {e.bodyText}
                        </pre>
                        {e.psychAnalysis && (
                          <div className="text-xs text-muted-foreground mt-2 italic">
                            AI: {e.psychAnalysis}
                          </div>
                        )}
                        {e.aiReasoning && (
                          <details className="mt-2">
                            <summary className="text-[10px] text-violet-700 cursor-pointer hover:underline">
                              Show chain-of-thought from {e.aiModel}
                            </summary>
                            <pre className="mt-1 text-[10px] bg-zinc-50 border rounded p-2 whitespace-pre-wrap font-mono max-h-40 overflow-y-auto">
                              {e.aiReasoning}
                            </pre>
                          </details>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm">{value}</div>
    </div>
  )
}
