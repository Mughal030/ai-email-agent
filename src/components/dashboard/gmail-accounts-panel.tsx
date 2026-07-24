'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Mail, Plus, Loader2, Upload, Trash2, FileUp } from 'lucide-react'
import type { GmailAccountT, SystemPromptT } from '@/lib/types'

interface Props {
  gmailAccounts: GmailAccountT[]
  systemPrompts: SystemPromptT[]
  onConnect: (email: string, password: string) => Promise<void>
  onToggle: (id: string, isActive: boolean) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

export function GmailAccountsPanel({
  gmailAccounts,
  systemPrompts,
  onConnect,
  onToggle,
  onDelete,
}: Props) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [csvText, setCsvText] = useState(
    'name,email,company,role,industry,companySize,notes\nSarah Chen,sarah@acme.io,Acme,VP Engineering,SaaS,51-200,Met at SaaStr\n'
  )
  const [importing, setImporting] = useState(false)
  const [fileImportOpen, setFileImportOpen] = useState(false)
  const [filePath, setFilePath] = useState('')
  const [fileLimit, setFileLimit] = useState('')
  const [fileImporting, setFileImporting] = useState(false)
  const [fileImportResult, setFileImportResult] = useState<any>(null)

  async function handleConnect() {
    setBusy(true)
    try {
      await onConnect(email, password)
      setEmail('')
      setPassword('')
      setOpen(false)
    } finally {
      setBusy(false)
    }
  }

  async function handleImport() {
    setImporting(true)
    try {
      const res = await fetch('/api/leads/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format: 'csv', data: csvText }),
      })
      const j = await res.json()
      if (j.created) {
        window.location.reload()
      }
    } finally {
      setImporting(false)
      setImportOpen(false)
    }
  }

  async function handleFileImport() {
    setFileImporting(true)
    setFileImportResult(null)
    try {
      const res = await fetch('/api/leads/import-csv-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filePath,
          limit: fileLimit ? Number(fileLimit) : undefined,
        }),
      })
      const j = await res.json()
      setFileImportResult(j)
      if (j.created > 0) {
        // Trigger a refresh via onConnect (which calls load())
        window.location.reload()
      }
    } catch (e) {
      setFileImportResult({ error: (e as Error).message })
    } finally {
      setFileImporting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Gmail Accounts</h2>
          <p className="text-sm text-muted-foreground">
            Sender mailboxes the agent uses for outreach and reply monitoring.
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog open={fileImportOpen} onOpenChange={setFileImportOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <FileUp className="w-4 h-4 mr-2" />
                Import CSV File
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Import leads from a CSV file on the server</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                Use this when your leads file is already uploaded to the
                server (e.g. via the chat upload). Supports rich 66-column
                exports from sales tools — enrichment data (headline, bio,
                company description, LinkedIn connections) is packed into
                the <code>notes</code> field for the AI to use in
                psychological profiling.
              </p>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="filePath">File path</Label>
                  <Input
                    id="filePath"
                    placeholder="/home/z/my-project/upload/leads.csv"
                    value={filePath}
                    onChange={(e) => setFilePath(e.target.value)}
                    className="font-mono text-xs"
                  />
                  <p className="text-xs text-muted-foreground">
                    Must be in /home/z/my-project/upload/ or /tmp/
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="fileLimit">Limit (optional)</Label>
                  <Input
                    id="fileLimit"
                    type="number"
                    placeholder="leave empty for all rows"
                    value={fileLimit}
                    onChange={(e) => setFileLimit(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Useful for testing with a small sample first
                  </p>
                </div>
                {fileImportResult && (
                  <div className="border rounded p-3 text-sm space-y-1 bg-muted/40">
                    <div className="font-medium">Import result</div>
                    <div>Total rows in file: {fileImportResult.total}</div>
                    <div className="text-emerald-700">
                      Created: {fileImportResult.created}
                    </div>
                    <div className="text-amber-700">
                      Duplicates skipped: {fileImportResult.duplicates}
                    </div>
                    <div className="text-zinc-600">
                      Invalid rows skipped: {fileImportResult.skipped}
                    </div>
                    {fileImportResult.errors?.length > 0 && (
                      <div className="text-rose-600 text-xs mt-1">
                        {fileImportResult.errors.length} errors (first:{' '}
                        {fileImportResult.errors[0].slice(0, 100)})
                      </div>
                    )}
                    {fileImportResult.sampleCreated?.length > 0 && (
                      <div className="text-xs mt-2">
                        <div className="text-muted-foreground">
                          Sample imported:
                        </div>
                        {fileImportResult.sampleCreated
                          .slice(0, 3)
                          .map((s: any, i: number) => (
                            <div key={i}>
                              • {s.name} &lt;{s.email}&gt;
                              {s.company ? ` — ${s.company}` : ''}
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setFileImportOpen(false)}
                >
                  Close
                </Button>
                <Button
                  onClick={handleFileImport}
                  disabled={fileImporting || !filePath}
                >
                  {fileImporting ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <FileUp className="w-4 h-4 mr-2" />
                  )}
                  Import File
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Dialog open={importOpen} onOpenChange={setImportOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Upload className="w-4 h-4 mr-2" />
                Paste CSV
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Bulk import leads (CSV)</DialogTitle>
              </DialogHeader>
              <Label className="text-xs text-muted-foreground">
                Columns: name,email,company,role,industry,companySize,notes,linkedinUrl
              </Label>
              <Textarea
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                rows={10}
                className="font-mono text-xs"
              />
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setImportOpen(false)}
                >
                  Cancel
                </Button>
                <Button onClick={handleImport} disabled={importing}>
                  {importing ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : null}
                  Import
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="w-4 h-4 mr-2" />
                Connect Gmail
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Connect a Gmail account (SMTP)</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                The agent uses SMTP to send and IMAP to read replies. For
                Gmail, generate a 16-char app password at{' '}
                <a
                  href="https://myaccount.google.com/apppasswords"
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  myaccount.google.com/apppasswords
                </a>{' '}
                (your real password won&apos;t work).
              </p>
              <div className="space-y-2">
                <Label htmlFor="email">Gmail address</Label>
                <Input
                  id="email"
                  placeholder="you@gmail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">App password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="abcd efgh ijkl mnop"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  We verify the credentials via SMTP before saving them. Stored
                  AES-256-GCM encrypted.
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleConnect} disabled={busy || !email || !password}>
                  {busy ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Mail className="w-4 h-4 mr-2" />
                  )}
                  Verify &amp; Connect
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {gmailAccounts.length === 0 ? (
        <Card className="p-8 border-dashed text-center">
          <Mail className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            No Gmail accounts connected yet. Click &quot;Connect Gmail&quot;
            to add one.
          </p>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {gmailAccounts.map((a) => (
            <Card key={a.id} className="p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="font-medium text-sm truncate max-w-[180px]">
                    {a.email}
                  </div>
                  <div className="flex gap-2">
                    <Badge
                      variant="outline"
                      className={a.isActive ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-zinc-200 bg-zinc-50 text-zinc-500'}
                    >
                      {a.isActive ? 'Active' : 'Paused'}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {a.sentToday} sent today
                    </Badge>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => onToggle(a.id, !a.isActive)}
                >
                  {a.isActive ? 'Pause' : 'Resume'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (confirm(`Remove ${a.email}? Leads will be unassigned.`)) {
                      onDelete(a.id)
                    }
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {systemPrompts.length > 0 && (
        <div className="text-xs text-muted-foreground pt-2 border-t">
          Default agent strategy:{' '}
          <span className="font-medium text-foreground">
            {systemPrompts.find((s) => s.isDefault)?.name || 'None set'}
          </span>
        </div>
      )}
    </div>
  )
}
