'use client'

import { useState, useCallback, useRef } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Upload,
  FileSpreadsheet,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Download,
  Sparkles,
  ArrowRight,
} from 'lucide-react'
import { toast } from 'sonner'

interface DetectionResult {
  mapping: { [header: string]: string }
  method: string
  unmapped: string[]
  aiReasoning?: string
}

interface ImportResult {
  total: number
  created: number
  duplicates: number
  skipped: number
  errors: string[]
  mapping: { [header: string]: string }
  detectionMethod: string
  aiReasoning?: string
  sampleCreated: Array<{ name: string; email: string; company: string | null }>
}

const SCHEMA_FIELDS = [
  { value: 'name', label: 'Name' },
  { value: 'email', label: 'Email' },
  { value: 'company', label: 'Company' },
  { value: 'role', label: 'Role / Job Title' },
  { value: 'industry', label: 'Industry' },
  { value: 'companySize', label: 'Company Size' },
  { value: 'linkedinUrl', label: 'LinkedIn URL' },
  { value: 'phone', label: 'Phone' },
  { value: 'location', label: 'Location' },
  { value: 'headline', label: 'Headline' },
  { value: 'bio', label: 'Bio / Summary' },
  { value: 'companyDescription', label: 'Company Description' },
  { value: 'website', label: 'Website' },
  { value: 'notes', label: 'Notes (catch-all)' },
  { value: 'ignore', label: 'Ignore' },
]

export function LeadUploader({ onImported }: { onImported: () => void }) {
  const [dragOver, setDragOver] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [parsed, setParsed] = useState<{
    headers: string[]
    sampleRows: Record<string, string>[]
  } | null>(null)
  const [detection, setDetection] = useState<DetectionResult | null>(null)
  const [detecting, setDetecting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [editMapping, setEditMapping] = useState<{
    [header: string]: string
  } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(async (f: File) => {
    setFile(f)
    setParsed(null)
    setDetection(null)
    setImportResult(null)
    setEditMapping(null)

    // Parse the file client-side to get headers + sample rows for detection
    try {
      const text = await f.text()
      // Simple CSV parse (handles most cases; for complex files the
      // server-side parser is more robust)
      const lines = text.split(/\r?\n/).filter(Boolean)
      if (lines.length === 0) {
        toast.error('File is empty')
        return
      }
      const headers = parseCsvLine(lines[0])
      const sampleRows = lines.slice(1, 6).map((line) => {
        const values = parseCsvLine(line)
        const obj: Record<string, string> = {}
        headers.forEach((h, i) => {
          obj[h] = values[i] || ''
        })
        return obj
      })
      setParsed({ headers, sampleRows })
      // Auto-trigger AI detection
      await runDetection(headers, sampleRows)
    } catch (e) {
      toast.error(`Failed to read file: ${(e as Error).message}`)
    }
  }, [])

  async function runDetection(headers: string[], sampleRows: Record<string, string>[]) {
    setDetecting(true)
    try {
      const res = await fetch('/api/leads/detect-columns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headers, sampleRows }),
      })
      const j = await res.json()
      if (j.error) {
        toast.error(j.error)
        return
      }
      setDetection(j)
      setEditMapping(j.mapping)
    } catch (e) {
      toast.error(`Detection failed: ${(e as Error).message}`)
    } finally {
      setDetecting(false)
    }
  }

  async function handleImport() {
    if (!file || !editMapping) return
    setImporting(true)
    setImportResult(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('mapping', JSON.stringify(editMapping))
      const res = await fetch('/api/leads/upload', {
        method: 'POST',
        body: formData,
      })
      const j = await res.json()
      if (j.error) {
        toast.error(j.error)
        return
      }
      setImportResult(j)
      if (j.created > 0) {
        toast.success(`Imported ${j.created} leads (${j.duplicates} duplicates skipped)`)
        onImported()
      } else {
        toast.info(`No new leads imported — all ${j.duplicates} were duplicates`)
      }
    } catch (e) {
      toast.error(`Import failed: ${(e as Error).message}`)
    } finally {
      setImporting(false)
    }
  }

  function reset() {
    setFile(null)
    setParsed(null)
    setDetection(null)
    setImportResult(null)
    setEditMapping(null)
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Upload className="w-5 h-5 text-violet-600" />
          <h2 className="text-xl font-semibold tracking-tight">
            Import Leads (Smart Uploader)
          </h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Upload any CSV or Excel file. The AI auto-detects columns and merges
          into your single unified leads sheet — duplicates are skipped
          automatically.
        </p>
      </div>

      {/* Drop zone */}
      {!file && (
        <Card
          className={`p-10 border-2 border-dashed text-center cursor-pointer transition-colors ${
            dragOver
              ? 'border-violet-400 bg-violet-50'
              : 'border-zinc-300 hover:border-violet-300 hover:bg-violet-50/30'
          }`}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            const f = e.dataTransfer.files?.[0]
            if (f) handleFile(f)
          }}
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx,.xls,.txt"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleFile(f)
            }}
          />
          <FileSpreadsheet className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium text-sm mb-1">
            Drop your CSV or Excel file here
          </p>
          <p className="text-xs text-muted-foreground">
            or click to browse — supports .csv, .xlsx, .xls
          </p>
        </Card>
      )}

      {/* File + detection preview */}
      {file && (
        <div className="space-y-4">
          <Card className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="w-5 h-5 text-violet-600" />
              <div>
                <div className="font-medium text-sm">{file.name}</div>
                <div className="text-xs text-muted-foreground">
                  {(file.size / 1024).toFixed(1)} KB
                  {parsed && ` · ${parsed.headers.length} columns detected`}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {detection && (
                <Badge
                  variant="outline"
                  className={
                    detection.method === 'fuzzy'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : detection.method === 'hybrid'
                      ? 'border-sky-200 bg-sky-50 text-sky-700'
                      : 'border-violet-200 bg-violet-50 text-violet-700'
                  }
                >
                  <Sparkles className="w-3 h-3 mr-1" />
                  {detection.method === 'fuzzy'
                    ? 'Auto-matched'
                    : detection.method === 'hybrid'
                    ? 'AI + auto-matched'
                    : 'AI detected'}
                </Badge>
              )}
              <Button size="sm" variant="ghost" onClick={reset}>
                Change file
              </Button>
            </div>
          </Card>

          {/* Detection status */}
          {detecting && (
            <Card className="p-6 text-center">
              <Loader2 className="w-6 h-6 mx-auto animate-spin text-violet-600 mb-2" />
              <p className="text-sm text-muted-foreground">
                AI is detecting column mapping...
              </p>
            </Card>
          )}

          {/* Column mapping preview */}
          {detection && editMapping && parsed && !detecting && (
            <Card className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-sm">Column Mapping</h3>
                  <p className="text-xs text-muted-foreground">
                    Review the AI&apos;s mapping. Click any field to change it.
                    Unmapped columns go into &quot;Notes&quot; so no data is lost.
                  </p>
                </div>
                {detection.aiReasoning && (
                  <details className="max-w-md">
                    <summary className="text-xs text-violet-700 cursor-pointer">
                      AI reasoning
                    </summary>
                    <pre className="mt-1 text-[10px] bg-muted/40 rounded p-2 whitespace-pre-wrap font-mono max-h-32 overflow-y-auto">
                      {detection.aiReasoning}
                    </pre>
                  </details>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto space-y-1.5">
                {parsed.headers.map((header) => {
                  const mapped = editMapping[header] || 'notes'
                  const sample = parsed.sampleRows[0]?.[header] || ''
                  return (
                    <div
                      key={header}
                      className="flex items-center gap-3 p-2 rounded hover:bg-muted/40"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-xs truncate">
                          {header}
                        </div>
                        <div className="text-[10px] text-muted-foreground truncate">
                          {sample.slice(0, 80) || '(empty)'}
                        </div>
                      </div>
                      <ArrowRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                      <Select
                        value={mapped}
                        onValueChange={(v) =>
                          setEditMapping({ ...editMapping, [header]: v })
                        }
                      >
                        <SelectTrigger className="w-44 h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SCHEMA_FIELDS.map((f) => (
                            <SelectItem key={f.value} value={f.value}>
                              {f.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )
                })}
              </div>
            </Card>
          )}

          {/* Import result */}
          {importResult && (
            <Card className="p-4 space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <h3 className="font-medium text-sm">Import Complete</h3>
              </div>
              <div className="grid grid-cols-4 gap-2 text-sm">
                <Stat label="Total rows" value={importResult.total} />
                <Stat
                  label="New leads"
                  value={importResult.created}
                  color="text-emerald-700"
                />
                <Stat
                  label="Duplicates skipped"
                  value={importResult.duplicates}
                  color="text-amber-700"
                />
                <Stat
                  label="Invalid rows"
                  value={importResult.skipped}
                  color="text-zinc-600"
                />
              </div>
              {importResult.sampleCreated.length > 0 && (
                <div className="pt-2 border-t">
                  <div className="text-xs text-muted-foreground mb-1">
                    Sample imported:
                  </div>
                  {importResult.sampleCreated.slice(0, 3).map((s, i) => (
                    <div key={i} className="text-xs">
                      • {s.name} &lt;{s.email}&gt;
                      {s.company ? ` — ${s.company}` : ''}
                    </div>
                  ))}
                </div>
              )}
              {importResult.errors.length > 0 && (
                <div className="pt-2 border-t">
                  <div className="text-xs text-rose-600 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {importResult.errors.length} errors
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* Action buttons */}
          {detection && editMapping && !importing && (
            <div className="flex gap-2">
              <Button
                onClick={handleImport}
                disabled={!parsed?.headers.length}
                className="flex-1"
              >
                <Upload className="w-4 h-4 mr-2" />
                Import {parsed?.headers.length ? `${parsed.headers.length} columns` : ''}
              </Button>
              <Button variant="outline" onClick={reset}>
                Cancel
              </Button>
            </div>
          )}
          {importing && (
            <Card className="p-4 text-center">
              <Loader2 className="w-5 h-5 mx-auto animate-spin text-violet-600 mb-2" />
              <p className="text-sm text-muted-foreground">
                Importing + deduplicating...
              </p>
            </Card>
          )}
        </div>
      )}

      {/* Export button — always visible */}
      <div className="pt-4 border-t">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium text-sm">Export Unified Sheet</h3>
            <p className="text-xs text-muted-foreground">
              Download all leads (merged across all imports) as a single CSV
            </p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <a href="/api/leads/export" download>
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </a>
          </Button>
        </div>
      </div>
    </div>
  )
}

function parseCsvLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  result.push(current.trim())
  return result
}

function Stat({
  label,
  value,
  color = '',
}: {
  label: string
  value: number
  color?: string
}) {
  return (
    <div className="bg-muted/40 rounded p-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold ${color}`}>{value}</div>
    </div>
  )
}
