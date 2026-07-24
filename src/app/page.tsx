'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, Zap, Sparkles, RefreshCw, AlertCircle, LogOut, LayoutDashboard, BarChart3, Users, Upload, Search, Brain, Settings } from 'lucide-react'
import { GmailAccountsPanel } from '@/components/dashboard/gmail-accounts-panel'
import { LeadsTable } from '@/components/dashboard/leads-table'
import {
  StatsOverview,
  FunnelCard,
  RecentEmailsCard,
} from '@/components/dashboard/analytics'
import { AnalyticsCharts } from '@/components/dashboard/analytics-charts'
import { AgentMemoryPanel } from '@/components/dashboard/agent-memory-panel'
import { SelfImprovementLogsPanel } from '@/components/dashboard/self-improvement-panel'
import { SettingsPanel } from '@/components/dashboard/settings-panel'
import { AIPreviewDialog } from '@/components/dashboard/ai-preview-dialog'
import { LeadUploader } from '@/components/dashboard/lead-uploader'
import { SenderPanel } from '@/components/dashboard/sender-panel'
import { LeadResearcher } from '@/components/dashboard/lead-researcher'
import { toast } from 'sonner'
import type { DashboardState } from '@/lib/types'

type Tab = 'dashboard' | 'analytics' | 'leads' | 'import' | 'research' | 'sender' | 'memory' | 'logs' | 'settings'

const TABS: { value: Tab; label: string }[] = [
  { value: 'dashboard', label: 'Dashboard' },
  { value: 'analytics', label: 'Analytics' },
  { value: 'leads', label: 'Leads' },
  { value: 'import', label: 'Import' },
  { value: 'research', label: '🔍 Lead Researcher' },
  { value: 'sender', label: 'Send Scheduler' },
  { value: 'memory', label: 'Agent Memory' },
  { value: 'logs', label: 'Self-Improvement Logs' },
  { value: 'settings', label: 'Strategy Settings' },
]

export default function Home() {
  const { data: session, status } = useSession()
  const [state, setState] = useState<DashboardState | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('dashboard')
  const [ticking, setTicking] = useState(false)
  const [improving, setImproving] = useState(false)
  const [previewLeadId, setPreviewLeadId] = useState<string | null>(null)
  const [previewLeadName, setPreviewLeadName] = useState<string | undefined>()

  // In production mode, redirect to login if not authenticated
  useEffect(() => {
    if (status === 'unauthenticated' && state?.requireAuth) {
      window.location.href = '/login'
    }
  }, [status, state?.requireAuth])

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/state')
      // If 401 (not authenticated in production mode), redirect to login
      if (res.status === 401) {
        window.location.href = '/login'
        return
      }
      const j = await res.json()
      // Guard against partial state (e.g. if API returned an error object)
      if (!j || !j.gmailAccounts) {
        setState(null)
        return
      }
      setState(j)
    } catch (e) {
      toast.error('Failed to load dashboard state')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    // Auto-refresh every 30s
    const id = setInterval(load, 30000)
    return () => clearInterval(id)
  }, [load])

  async function handleTick() {
    setTicking(true)
    try {
      const res = await fetch('/api/agent/tick', { method: 'POST' })
      const j = await res.json()
      if (j.errors?.length) {
        toast.error(`Tick ran with ${j.errors.length} errors`)
      } else {
        toast.success(
          `Tick complete: ${j.processed} sent, ${j.replies} replies processed`
        )
      }
      await load()
    } catch (e) {
      toast.error('Tick failed — check console')
    } finally {
      setTicking(false)
    }
  }

  async function handleImprove() {
    setImproving(true)
    try {
      const res = await fetch('/api/agent/improve', { method: 'POST' })
      const j = await res.json()
      if (j.ok) {
        toast.success(
          `Self-improvement complete: ${j.newLessonsCount} new lessons, ${j.retiredCount} retired`
        )
      } else {
        toast.error(`Self-improvement failed: ${j.summary}`)
      }
      await load()
    } catch (e) {
      toast.error('Self-improvement failed — check console')
    } finally {
      setImproving(false)
    }
  }

  async function handleConnectGmail(email: string, password: string) {
    const res = await fetch('/api/gmail/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    const j = await res.json()
    if (res.ok) {
      toast.success(`SMTP verified — ${email} connected`)
      await load()
    } else {
      toast.error(j?.error || 'Failed to connect Gmail (SMTP verification failed)')
    }
  }

  async function handleToggleGmail(id: string, isActive: boolean) {
    await fetch(`/api/gmail/accounts/${id}/toggle`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive }),
    })
    await load()
  }

  async function handleDeleteGmail(id: string) {
    await fetch(`/api/gmail/accounts/${id}`, { method: 'DELETE' })
    await load()
  }

  async function handleQueueLead(id: string) {
    const res = await fetch(`/api/leads/${id}/queue`, { method: 'POST' })
    if (res.ok) {
      toast.success('Lead queued — agent will process on next tick')
      await load()
    }
  }

  async function handleSimulateReply(id: string) {
    const res = await fetch('/api/agent/simulate-reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId: id }),
    })
    const j = await res.json()
    if (j.ok) {
      const messages: Record<string, string> = {
        opt_out: 'Simulated reply: lead opted out',
        human_handoff: 'Simulated reply: high-value signal — flagged for human handoff',
        close_loop: 'Simulated reply: lead politely declined — graceful exit sent',
        auto_replied: 'Simulated reply: AI auto-replied to push the conversation forward',
      }
      toast.success(messages[j.outcome] || 'Reply simulated')
      await load()
    } else {
      toast.error(j.error || 'Simulate reply failed')
    }
  }

  async function handleQueueAll() {
    const res = await fetch('/api/leads/queue-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const j = await res.json()
    if (j.error) {
      toast.error(j.error)
      return
    }
    toast.success(
      `Queued ${j.queued} leads · scheduled ${j.scheduled} · first send ${j.firstSendAt ? new Date(j.firstSendAt).toLocaleString() : 'now'}`
    )
    await load()
  }

  async function handleBulkAction(action: string, leadIds: string[]) {
    const res = await fetch('/api/leads/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, leadIds }),
    })
    const j = await res.json()
    if (j.error) {
      toast.error(j.error)
      return
    }
    toast.success(`Bulk ${action}: ${j.updated} leads updated`)
    await load()
  }

  function handlePreviewLead(id: string, name?: string) {
    setPreviewLeadId(id)
    setPreviewLeadName(name)
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="border-b sticky top-0 z-30 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="px-3 md:px-6 h-14 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <div className="w-7 h-7 rounded bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-semibold tracking-tight leading-none truncate">
                AI Email Agent
              </h1>
              <p className="text-[10px] text-muted-foreground leading-none mt-0.5 hidden sm:block">
                Self-improving Gmail outreach · NVIDIA API
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 md:gap-2">
            {state?.demoMode && (
              <Badge
                variant="outline"
                className="text-[10px] border-amber-200 bg-amber-50 text-amber-800 hidden sm:inline-flex"
              >
                <AlertCircle className="w-3 h-3 mr-1" />
                DEMO MODE
              </Badge>
            )}
            {state?.gmailAccounts?.[0] && (
              <Badge
                variant="outline"
                className={`text-[10px] hidden sm:inline-flex ${
                  state.gmailAccounts[0].sendingPaused
                    ? 'border-amber-200 bg-amber-50 text-amber-700'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                }`}
              >
                {state.gmailAccounts[0].sendingPaused ? '⏸ Paused' : '▶ Active'}
                <span className="ml-1 opacity-70">
                  · {state.gmailAccounts[0].sentToday || 0}/{state.gmailAccounts[0].dailySendLimit || 50}
                </span>
              </Badge>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={load}
              title="Refresh"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleImprove}
              disabled={improving}
            >
              {improving ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 mr-1.5" />
              )}
              <span className="hidden sm:inline">Run Self-Improvement</span>
              <span className="sm:hidden">Improve</span>
            </Button>
            <Button size="sm" onClick={handleTick} disabled={ticking}>
              {ticking ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <Zap className="w-3.5 h-3.5 mr-1.5" />
              )}
              <span className="hidden sm:inline">Run Agent Tick</span>
              <span className="sm:hidden">Tick</span>
            </Button>
            {state?.requireAuth && session?.user && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => signOut({ callbackUrl: '/login' })}
                title="Sign out"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline ml-1.5">Sign Out</span>
              </Button>
            )}
          </div>
        </div>
        {/* Tabs — horizontal scroll on desktop, hidden on mobile (use bottom nav) */}
        <div className="px-4 md:px-6 flex gap-1 overflow-x-auto hidden md:flex">
          {TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={`text-xs px-3 py-2 border-b-2 transition-colors whitespace-nowrap ${
                tab === t.value
                  ? 'border-violet-500 text-violet-700 font-medium'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 px-3 md:px-6 py-4 md:py-6 max-w-7xl w-full mx-auto pb-20 md:pb-6">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : !state ? (
          <div className="text-center py-12 text-muted-foreground">
            Failed to load dashboard.
          </div>
        ) : (
          <div className="space-y-6">
            {tab === 'dashboard' && (
              <>
                <StatsOverview state={state} />
                <div className="grid gap-4 lg:grid-cols-2">
                  <FunnelCard state={state} />
                  <RecentEmailsCard state={state} />
                </div>
                <GmailAccountsPanel
                  gmailAccounts={state.gmailAccounts}
                  systemPrompts={state.systemPrompts}
                  onConnect={handleConnectGmail}
                  onToggle={handleToggleGmail}
                  onDelete={handleDeleteGmail}
                />
              </>
            )}

            {tab === 'analytics' && <AnalyticsCharts />}

            {tab === 'leads' && (
              <LeadsTable
                leads={state.leads}
                recentEmails={state.recentEmails}
                gmailAccounts={state.gmailAccounts}
                demoMode={state.demoMode}
                onQueue={handleQueueLead}
                onPreview={(id) => {
                  const lead = state.leads.find((l) => l.id === id)
                  handlePreviewLead(id, lead?.name)
                }}
                onSimulateReply={handleSimulateReply}
                onQueueAll={handleQueueAll}
                onBulkAction={handleBulkAction}
              />
            )}

            {tab === 'import' && <LeadUploader onImported={load} />}

            {tab === 'research' && <LeadResearcher />}

            {tab === 'sender' && <SenderPanel />}

            {tab === 'memory' && <AgentMemoryPanel memory={state.memory} />}

            {tab === 'logs' && (
              <SelfImprovementLogsPanel logs={state.improvementLogs} />
            )}

            {tab === 'settings' && (
              <SettingsPanel prompts={state.systemPrompts} onSaved={load} />
            )}
          </div>
        )}
      </main>

      <footer className="border-t mt-auto hidden md:block">
        <div className="px-4 md:px-6 py-3 text-xs text-muted-foreground flex items-center justify-between max-w-7xl mx-auto">
          <span>
            AI Email Agent · GBOB-powered · NVIDIA API · Gmail OAuth2
          </span>
          <span className="hidden sm:inline">
            Auto-refreshes every 30s · Click &quot;Run Agent Tick&quot; to drain the queue
          </span>
        </div>
      </footer>

      {/* Mobile bottom navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-background border-t z-40">
        <div className="flex overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={`flex-1 min-w-[70px] flex flex-col items-center gap-0.5 py-2 px-1 text-[10px] whitespace-nowrap ${
                tab === t.value
                  ? 'text-violet-700 font-medium'
                  : 'text-muted-foreground'
              }`}
            >
              <TabIcon tab={t.value} active={tab === t.value} />
              <span>{t.label.replace('🔍 ', '').replace(' ', ' ')}</span>
            </button>
          ))}
        </div>
      </nav>

      <AIPreviewDialog
        leadId={previewLeadId}
        leadName={previewLeadName}
        onClose={() => {
          setPreviewLeadId(null)
          setPreviewLeadName(undefined)
        }}
      />
    </div>
  )
}

/** Mobile bottom-nav icons. */
function TabIcon({ tab, active }: { tab: Tab; active: boolean }) {
  const cls = `w-5 h-5 ${active ? 'text-violet-600' : 'text-muted-foreground'}`
  switch (tab) {
    case 'dashboard':
      return <LayoutDashboard className={cls} />
    case 'analytics':
      return <BarChart3 className={cls} />
    case 'leads':
      return <Users className={cls} />
    case 'import':
      return <Upload className={cls} />
    case 'research':
      return <Search className={cls} />
    case 'sender':
      return <Zap className={cls} />
    case 'memory':
      return <Brain className={cls} />
    case 'logs':
      return <Sparkles className={cls} />
    case 'settings':
      return <Settings className={cls} />
  }
}
