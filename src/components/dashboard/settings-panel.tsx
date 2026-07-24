'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog'
import { Settings, Plus, Pencil, Trash2, Loader2, Star } from 'lucide-react'
import type { SystemPromptT } from '@/lib/types'

interface Props {
  prompts: SystemPromptT[]
  onSaved: () => void
}

const DEFAULT_GBOB_PROMPT = `You are an expert sales agent trained in the GBOB (Greatest Bundle of Benefits) methodology.

CORE PRINCIPLES:
1. Lead with a single, specific outcome the prospect cares about — never a feature list.
2. Frame the offer as a "bundle": the tangible result + the time/effort saved + the risk removed.
3. Use the "Future-Past" technique: write so the prospect can imagine looking back, having already gotten the result.
4. Identify the prospect's dominant motivator (speed, cost, status, innovation, risk-avoidance) and engineer every sentence around it.
5. Pattern-interrupt in the first 5 words. Never open with "I hope" or "Just checking in".
6. Earn the right to ask. The ask must be proportionate to the value demonstrated in the email body.
7. Personalize using ONLY verified facts about the lead. Never invent shared connections.

EMAIL STRUCTURE (60-120 words):
- Hook (1 sentence): pattern interrupt tied to lead's context
- Value bundle (2-3 sentences): result + speed + risk-removal, tailored to their motivator
- Tiny ask (1 sentence): one frictionless next step (10-min call, reply with X, etc.)

TONE: confident, specific, respectful of their time. No hype words.`

export function SettingsPanel({ prompts, onSaved }: Props) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<SystemPromptT | null>(null)
  const [name, setName] = useState('')
  const [content, setContent] = useState(DEFAULT_GBOB_PROMPT)
  const [isDefault, setIsDefault] = useState(true)
  const [saving, setSaving] = useState(false)

  function openNew() {
    setEditing(null)
    setName('')
    setContent(DEFAULT_GBOB_PROMPT)
    setIsDefault(prompts.length === 0)
    setOpen(true)
  }

  function openEdit(p: SystemPromptT) {
    setEditing(p)
    setName(p.name)
    setContent(p.content)
    setIsDefault(p.isDefault)
    setOpen(true)
  }

  async function save() {
    setSaving(true)
    try {
      const url = editing
        ? `/api/system-prompts/${editing.id}`
        : '/api/system-prompts'
      const method = editing ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, content, isDefault }),
      })
      if (res.ok) {
        setOpen(false)
        onSaved()
      }
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this system prompt?')) return
    await fetch(`/api/system-prompts/${id}`, { method: 'DELETE' })
    onSaved()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Settings className="w-5 h-5 text-violet-600" />
            <h2 className="text-xl font-semibold tracking-tight">
              Agent Strategy Settings
            </h2>
          </div>
          <p className="text-sm text-muted-foreground">
            The system prompt is the AI&apos;s &quot;north star&quot;. Define
            your GBOB (or any) methodology here. The agent combines this with
            its operating principles and lead-specific memory to draft every
            email.
          </p>
        </div>
        <Button onClick={openNew} size="sm">
          <Plus className="w-4 h-4 mr-2" />
          New Strategy
        </Button>
      </div>

      {prompts.length === 0 ? (
        <Card className="p-8 border-dashed text-center">
          <Settings className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground mb-3">
            No system prompts yet. Create one to define the agent&apos;s
            strategy (GBOB methodology is the default suggestion).
          </p>
          <Button onClick={openNew} size="sm" variant="outline">
            Create Default GBOB Prompt
          </Button>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {prompts.map((p) => (
            <Card key={p.id} className="p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  {p.isDefault && (
                    <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  )}
                  <h3 className="font-medium text-sm">{p.name}</h3>
                  {p.isDefault && (
                    <Badge variant="outline" className="text-[10px] border-amber-200 bg-amber-50 text-amber-700">
                      Default
                    </Badge>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    onClick={() => openEdit(p)}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-rose-600"
                    onClick={() => remove(p.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
              <pre className="text-xs text-muted-foreground bg-muted/40 rounded p-2 max-h-32 overflow-y-auto whitespace-pre-wrap font-sans">
                {p.content}
              </pre>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {editing ? 'Edit Strategy' : 'New Agent Strategy'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 flex-1 overflow-y-auto">
            <div className="space-y-1.5">
              <Label htmlFor="name">Strategy name</Label>
              <Input
                id="name"
                placeholder="GBOB Default"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="content">System prompt</Label>
              <Textarea
                id="content"
                rows={18}
                className="font-mono text-xs"
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                This becomes the &quot;AGENT STRATEGY&quot; section of every
                AI call. Operating principles and memory are layered on top
                automatically.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="default"
                checked={isDefault}
                onCheckedChange={setIsDefault}
              />
              <Label htmlFor="default" className="text-sm cursor-pointer">
                Use as default strategy for new leads
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving || !name || !content}>
              {saving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
