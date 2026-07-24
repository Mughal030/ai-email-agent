'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Play,
  Pause,
  Loader2,
  Clock,
  Calendar,
  Zap,
  Settings2,
  RefreshCw,
  MailCheck,
  AlertTriangle,
} from 'lucide-react'
import { toast } from 'sonner'

interface SenderStatus {
  account: { email: string; displayName: string | null }
  guard: { allowed: boolean; reason: string; remainingToday: number }
  sendingPaused: boolean
  dailySendLimit: number
  sendWindowStartHour: number
  sendWindowEndHour: number
  senderTimezone: string
  minMinutesBetweenSends: number
  sentToday: number
  remainingToday: number
  counts: { pending: number; queued: number; sent: number }
  upcoming: Array<{
    id: string
    name: string
    email: string
    company: string | null
    industry: string | null
    scheduledFor: string
  }>
}

const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Paris',
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
]

export function SenderPanel() {
  const [status, setStatus] = useState<SenderStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(false)
  const [saving, setSaving] = useState(false)
  const [checkingReplies, setCheckingReplies] = useState(false)
  const [recovering, setRecovering] = useState(false)
  const [settings, setSettings] = useState({
    dailySendLimit: 50,
    sendWindowStartHour: 9,
    sendWindowEndHour: 17,
    senderTimezone: 'America/New_York',
    minMinutesBetweenSends: 3,
  })

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/sender/status')
      if (!res.ok) {
        setLoading(false)
        return
      }
      const j = await res.json()
      setStatus(j)
      setSettings({
        dailySendLimit: j.dailySendLimit,
        sendWindowStartHour: j.sendWindowStartHour,
        sendWindowEndHour: j.sendWindowEndHour,
        senderTimezone: j.senderTimezone,
        minMinutesBetweenSends: j.minMinutesBetweenSends,
      })
    } catch (e) {
      // silent
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, 15000) // refresh every 15s
    return () => clearInterval(id)
  }, [load])

  async function togglePause() {
    if (!status) return
    setToggling(true)
    try {
      const newPaused = !status.sendingPaused
      const res = await fetch('/api/sender/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sendingPaused: newPaused }),
      })
      if (res.ok) {
        toast.success(newPaused ? 'Sending paused' : 'Sending resumed')
        await load()
      }
    } finally {
      setToggling(false)
    }
  }

  async function saveSettings() {
    setSaving(true)
    try {
      const res = await fetch('/api/sender/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      if (res.ok) {
        toast.success('Sender settings saved')
        // Re-schedule queued leads with new settings
        await fetch('/api/sender/schedule', { method: 'POST' })
        await load()
      } else {
        const j = await res.json()
        toast.error(j.error || 'Failed to save')
      }
    } finally {
      setSaving(false)
    }
  }

  async function runTick() {
    try {
      const res = await fetch('/api/agent/tick', { method: 'POST' })
      const j = await res.json()
      if (j.senderStatus && !j.senderStatus.allowed) {
        toast.info(`Sending paused: ${j.senderStatus.reason}`)
      } else {
        toast.success(`Tick: ${j.processed} sent, ${j.replies} replies`)
      }
      await load()
    } catch (e) {
      toast.error('Tick failed')
    }
  }

  async function checkReplies() {
    setCheckingReplies(true)
    try {
      const res = await fetch('/api/agent/check-replies', { method: 'POST' })
      const j = await res.json()
      if (j.repliesProcessed > 0) {
        toast.success(
          `Found ${j.repliesProcessed} new replies! Auto-replied to ${j.autoRepliesSent}.`
        )
      } else {
        toast.info('No new replies found.')
      }
      if (j.errors?.length > 0) {
        console.error('Reply check errors:', j.errors)
      }
      await load()
    } catch (e) {
      toast.error('Check replies failed')
    } finally {
      setCheckingReplies(false)
    }
  }

  async function recoverMissedReplies() {
    setRecovering(true)
    try {
      const res = await fetch('/api/agent/recover', { method: 'POST' })
      const j = await res.json()
      if (j.repliesProcessed > 0) {
        toast.success(
          `Recovery complete! Found ${j.repliesProcessed} missed replies, auto-replied to ${j.autoRepliesSent}.`
        )
      } else {
        toast.info('Recovery complete — no missed replies found.')
      }
      await load()
    } catch (e) {
      toast.error('Recovery failed')
    } finally {
      setRecovering(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!status) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm text-muted-foreground">
          No active sender account. Connect Gmail first.
        </p>
      </Card>
    )
  }

  const progressPct = status.dailySendLimit > 0
    ? (status.sentToday / status.dailySendLimit) * 100
    : 0

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Zap className="w-5 h-5 text-violet-600" />
            <h2 className="text-xl font-semibold tracking-tight">
              Send Scheduler
            </h2>
            {status.sendingPaused ? (
              <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                <Pause className="w-3 h-3 mr-1" />
                Paused
              </Badge>
            ) : (
              <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                <Play className="w-3 h-3 mr-1" />
                Active
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Sender: {status.account.displayName || status.account.email}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={runTick}>
            <Zap className="w-3.5 h-3.5 mr-1.5" />
            Run Tick Now
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={checkReplies}
            disabled={checkingReplies}
            className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
          >
            {checkingReplies ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <MailCheck className="w-3.5 h-3.5 mr-1.5" />
            )}
            Check Replies
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={recoverMissedReplies}
            disabled={recovering}
            className="border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
            title="Full inbox scan — finds any replies missed while the server was down"
          >
            {recovering ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5 mr-1.5" />
            )}
            Recover Missed
          </Button>
          <Button
            size="sm"
            onClick={togglePause}
            disabled={toggling}
            variant={status.sendingPaused ? 'default' : 'outline'}
          >
            {toggling ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : status.sendingPaused ? (
              <Play className="w-3.5 h-3.5 mr-1.5" />
            ) : (
              <Pause className="w-3.5 h-3.5 mr-1.5" />
            )}
            {status.sendingPaused ? 'Resume Sending' : 'Pause Sending'}
          </Button>
        </div>
      </div>

      {/* Daily quota progress */}
      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium text-sm">Today&apos;s Quota</h3>
            <p className="text-xs text-muted-foreground">
              {status.sentToday} sent of {status.dailySendLimit} daily limit
            </p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-semibold">
              {status.remainingToday}
            </div>
            <div className="text-xs text-muted-foreground">remaining</div>
          </div>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full transition-all ${
              progressPct >= 100
                ? 'bg-rose-500'
                : progressPct >= 80
                ? 'bg-amber-500'
                : 'bg-emerald-500'
            }`}
            style={{ width: `${Math.min(100, progressPct)}%` }}
          />
        </div>
        {!status.guard.allowed && !status.sendingPaused && (
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {status.guard.reason}
          </div>
        )}
      </Card>

      {/* Lead counts */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Pending</div>
          <div className="text-2xl font-semibold">{status.counts.pending}</div>
          <div className="text-xs text-muted-foreground">not yet queued</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Queued</div>
          <div className="text-2xl font-semibold text-amber-700">
            {status.counts.queued}
          </div>
          <div className="text-xs text-muted-foreground">scheduled to send</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Sent</div>
          <div className="text-2xl font-semibold text-sky-700">
            {status.counts.sent}
          </div>
          <div className="text-xs text-muted-foreground">awaiting reply</div>
        </Card>
      </div>

      {/* Settings */}
      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-violet-600" />
          <h3 className="font-medium text-sm">Send Schedule Settings</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="dailyLimit" className="text-xs">Daily send limit</Label>
            <Input
              id="dailyLimit"
              type="number"
              min={1}
              max={500}
              value={settings.dailySendLimit}
              onChange={(e) =>
                setSettings({ ...settings, dailySendLimit: Number(e.target.value) })
              }
            />
            <p className="text-[10px] text-muted-foreground">Gmail cap: 500/day</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="startHour" className="text-xs">Send window start</Label>
            <Select
              value={String(settings.sendWindowStartHour)}
              onValueChange={(v) =>
                setSettings({ ...settings, sendWindowStartHour: Number(v) })
              }
            >
              <SelectTrigger id="startHour">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 24 }, (_, i) => i).map((h) => (
                  <SelectItem key={h} value={String(h)}>
                    {h.toString().padStart(2, '0')}:00
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="endHour" className="text-xs">Send window end</Label>
            <Select
              value={String(settings.sendWindowEndHour)}
              onValueChange={(v) =>
                setSettings({ ...settings, sendWindowEndHour: Number(v) })
              }
            >
              <SelectTrigger id="endHour">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 24 }, (_, i) => i).map((h) => (
                  <SelectItem key={h} value={String(h)}>
                    {h.toString().padStart(2, '0')}:00
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="timezone" className="text-xs">Sender timezone</Label>
            <Select
              value={settings.senderTimezone}
              onValueChange={(v) => setSettings({ ...settings, senderTimezone: v })}
            >
              <SelectTrigger id="timezone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="minGap" className="text-xs">Min minutes between sends</Label>
            <Input
              id="minGap"
              type="number"
              min={1}
              max={60}
              value={settings.minMinutesBetweenSends}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  minMinutesBetweenSends: Number(e.target.value),
                })
              }
            />
            <p className="text-[10px] text-muted-foreground">Anti-spam delay</p>
          </div>
        </div>
        <Button onClick={saveSettings} disabled={saving} size="sm">
          {saving ? (
            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
          ) : null}
          Save &amp; Re-schedule
        </Button>
      </Card>

      {/* Upcoming scheduled sends */}
      <Card className="p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-violet-600" />
          <h3 className="font-medium text-sm">Upcoming Scheduled Sends</h3>
          <Badge variant="outline" className="text-[10px]">
            next {status.upcoming.length}
          </Badge>
        </div>
        {status.upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No upcoming sends. Queue leads to populate the schedule.
          </p>
        ) : (
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {status.upcoming.map((lead, i) => (
              <div
                key={lead.id}
                className="flex items-center justify-between p-2 rounded hover:bg-muted/40 text-xs"
              >
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground w-6">#{i + 1}</span>
                  <div>
                    <div className="font-medium">{lead.name}</div>
                    <div className="text-muted-foreground">
                      {lead.email}
                      {lead.company ? ` · ${lead.company}` : ''}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-medium">
                    {new Date(lead.scheduledFor).toLocaleString('en-US', {
                      weekday: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                      timeZone: status.senderTimezone,
                    })}
                  </div>
                  <div className="text-muted-foreground text-[10px]">
                    {lead.industry || '—'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
