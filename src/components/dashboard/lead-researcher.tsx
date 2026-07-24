'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import {
  Search,
  Loader2,
  TrendingUp,
  Mail,
  Linkedin,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  Target,
  AlertCircle,
} from 'lucide-react'
import { toast } from 'sonner'

interface ResearchedLead {
  id: string
  companyName: string
  website: string
  industryInferred: string | null
  locationInferred: string | null
  estimatedSize: string | null
  description: string | null
  whyGoodProspect: string
  aiSolutionRec: string
  painPoint: string
  opportunityScore: number
  reasoningTrace: string | null
  coldEmail: string | null
  linkedinMessage: string | null
  followupDay2: string | null
  followupDay5: string | null
  followupDay10: string | null
  isImportedToPipeline: boolean
  createdAt: string
}

const INDUSTRIES = [
  { value: 'plumbing', label: 'Plumbing / HVAC' },
  { value: 'dental', label: 'Dental / Medical practices' },
  { value: 'real estate', label: 'Real Estate' },
  { value: 'law firm', label: 'Law Firms' },
  { value: 'accounting', label: 'Accounting / CPA' },
  { value: 'construction', label: 'Construction' },
  { value: 'restaurant', label: 'Restaurants' },
  { value: 'auto repair', label: 'Auto Repair' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'marketing agency', label: 'Marketing Agencies' },
  { value: 'e-commerce', label: 'E-commerce' },
  { value: 'logistics', label: 'Logistics / Trucking' },
]

export function LeadResearcher() {
  const [industry, setIndustry] = useState('')
  const [location, setLocation] = useState('United States')
  const [keywords, setKeywords] = useState('')
  const [numLeads, setNumLeads] = useState('5')
  const [searching, setSearching] = useState(false)
  const [leads, setLeads] = useState<ResearchedLead[]>([])
  const [selectedLead, setSelectedLead] = useState<ResearchedLead | null>(null)
  const [importing, setImporting] = useState<string | null>(null)

  const loadLeads = useCallback(async () => {
    try {
      const res = await fetch('/api/lead-research/list')
      const j = await res.json()
      setLeads(j.leads || [])
    } catch {
      // silent
    }
  }, [])

  useEffect(() => {
    loadLeads()
  }, [loadLeads])

  async function handleSearch() {
    if (!industry && !location && !keywords) {
      toast.error('Enter at least one search criteria')
      return
    }
    setSearching(true)
    try {
      const res = await fetch('/api/lead-research/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ industry, location, keywords, numLeads }),
      })
      const j = await res.json()
      if (j.error) {
        toast.error(j.error)
        return
      }
      toast.success(
        `Found ${j.totalFound} companies, analyzed ${j.analyzed}, saved ${j.saved} with outreach`
      )
      await loadLeads()
    } catch (e) {
      toast.error(`Research failed: ${(e as Error).message}`)
    } finally {
      setSearching(false)
    }
  }

  async function handleImport(id: string) {
    setImporting(id)
    try {
      const res = await fetch(`/api/lead-research/${id}/import`, {
        method: 'POST',
      })
      const j = await res.json()
      if (j.error) {
        toast.error(j.error)
        return
      }
      toast.success('Imported to pipeline — edit the email address before sending')
      await loadLeads()
    } catch (e) {
      toast.error(`Import failed: ${(e as Error).message}`)
    } finally {
      setImporting(null)
    }
  }

  function scoreColor(score: number): string {
    if (score >= 80) return 'border-emerald-200 bg-emerald-50 text-emerald-700'
    if (score >= 60) return 'border-sky-200 bg-sky-50 text-sky-700'
    if (score >= 40) return 'border-amber-200 bg-amber-50 text-amber-700'
    return 'border-zinc-200 bg-zinc-50 text-zinc-600'
  }

  function parseColdEmail(raw: string | null): { subject: string; body: string } {
    if (!raw) return { subject: '', body: '' }
    try {
      const parsed = JSON.parse(raw)
      return {
        subject: parsed.subject || '',
        body: parsed.body || '',
      }
    } catch {
      return { subject: '', body: raw }
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Target className="w-5 h-5 text-violet-600" />
          <h2 className="text-xl font-semibold tracking-tight">
            AI Lead Researcher
          </h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Finds real companies matching your criteria, analyzes them as AI
          automation prospects, and generates personalized cold email +
          LinkedIn message + follow-up sequence for each.
        </p>
      </div>

      {/* Search form */}
      <Card className="p-5 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Industry / Type</Label>
            <Select value={industry} onValueChange={setIndustry}>
              <SelectTrigger>
                <SelectValue placeholder="e.g. Plumbing" />
              </SelectTrigger>
              <SelectContent>
                {INDUSTRIES.map((i) => (
                  <SelectItem key={i.value} value={i.value}>
                    {i.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Location</Label>
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Texas, United States"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Keywords (optional)</Label>
            <Input
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="e.g. growing team, hiring"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Number of leads</Label>
            <Select value={numLeads} onValueChange={setNumLeads}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[3, 5, 10, 15, 20].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n} leads
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            ~20s per lead (Nemotron analysis + Mistral outreach generation)
          </p>
          <Button
            onClick={handleSearch}
            disabled={searching}
            className="bg-violet-600 hover:bg-violet-700"
          >
            {searching ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Search className="w-4 h-4 mr-2" />
            )}
            {searching ? 'Researching...' : 'Find & Analyze Leads'}
          </Button>
        </div>
      </Card>

      {/* Results */}
      {leads.length === 0 && !searching ? (
        <Card className="p-8 border-dashed text-center">
          <Target className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            No researched leads yet. Set your criteria above and click
            &quot;Find &amp; Analyze Leads&quot; to start.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-sm">
              {leads.length} researched lead{leads.length !== 1 ? 's' : ''}
              <span className="text-muted-foreground ml-2">
                (sorted by opportunity score)
              </span>
            </h3>
            <Button variant="outline" size="sm" onClick={loadLeads}>
              Refresh
            </Button>
          </div>

          {/* Ranked table */}
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Rank</th>
                    <th className="text-left px-3 py-2 font-medium">Company</th>
                    <th className="text-left px-3 py-2 font-medium">Industry / Location</th>
                    <th className="text-left px-3 py-2 font-medium">AI Solution</th>
                    <th className="text-left px-3 py-2 font-medium">Score</th>
                    <th className="text-right px-3 py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead, i) => (
                    <tr
                      key={lead.id}
                      className="border-b last:border-0 hover:bg-muted/30 cursor-pointer"
                      onClick={() => setSelectedLead(lead)}
                    >
                      <td className="px-3 py-2.5 text-muted-foreground">
                        #{i + 1}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="font-medium">{lead.companyName}</div>
                        <div className="text-xs text-muted-foreground">
                          {lead.website}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div>{lead.industryInferred || '—'}</div>
                        <div className="text-xs text-muted-foreground">
                          {lead.locationInferred || '—'}
                          {lead.estimatedSize ? ` · ${lead.estimatedSize} emp` : ''}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground max-w-xs truncate">
                        {lead.aiSolutionRec || '—'}
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-md border ${scoreColor(lead.opportunityScore)}`}
                        >
                          <TrendingUp className="w-3 h-3" />
                          {lead.opportunityScore}
                        </span>
                      </td>
                      <td
                        className="px-3 py-2.5 text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {lead.isImportedToPipeline ? (
                          <Badge variant="outline" className="text-xs border-emerald-200 bg-emerald-50 text-emerald-700">
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            In Pipeline
                          </Badge>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            disabled={importing === lead.id}
                            onClick={() => handleImport(lead.id)}
                          >
                            {importing === lead.id ? (
                              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                            ) : (
                              <ArrowRight className="w-3 h-3 mr-1" />
                            )}
                            Import
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Detail dialog — shows full analysis + outreach */}
      <LeadDetailDialog
        lead={selectedLead}
        onClose={() => setSelectedLead(null)}
        onImport={() => {
          if (selectedLead) handleImport(selectedLead.id)
        }}
      />
    </div>
  )
}

function LeadDetailDialog({
  lead,
  onClose,
  onImport,
}: {
  lead: ResearchedLead | null
  onClose: () => void
  onImport: () => void
}) {
  if (!lead) return null
  const coldEmail = parseColdEmail(lead.coldEmail)

  return (
    <Dialog open={!!lead} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 flex-wrap">
            <span>{lead.companyName}</span>
            <Badge variant="outline" className="text-xs">
              {lead.website}
            </Badge>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-md border border-violet-200 bg-violet-50 text-violet-700">
              <TrendingUp className="w-3 h-3" />
              Score: {lead.opportunityScore}
            </span>
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-4">
            {/* Company info */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Field label="Industry" value={lead.industryInferred || '—'} />
              <Field label="Location" value={lead.locationInferred || '—'} />
              <Field label="Estimated size" value={lead.estimatedSize || '—'} />
              <Field label="Website" value={lead.website} />
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Description</div>
              <div className="text-sm bg-muted/40 rounded p-2">
                {lead.description || '—'}
              </div>
            </div>

            {/* AI analysis */}
            <div className="bg-violet-50/50 border border-violet-100 rounded p-3 space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="w-4 h-4 text-violet-600" />
                <h4 className="font-medium text-sm">AI Analysis</h4>
              </div>
              <div className="text-sm">
                <div className="text-xs text-muted-foreground mb-1">Why good prospect</div>
                <div>{lead.whyGoodProspect}</div>
              </div>
              <div className="text-sm">
                <div className="text-xs text-muted-foreground mb-1">Recommended AI solution</div>
                <div>{lead.aiSolutionRec}</div>
              </div>
              <div className="text-sm">
                <div className="text-xs text-muted-foreground mb-1">Pain point to highlight</div>
                <div className="font-medium">{lead.painPoint}</div>
              </div>
              {lead.reasoningTrace && (
                <details className="mt-2">
                  <summary className="text-xs text-violet-700 cursor-pointer">
                    Show reasoning
                  </summary>
                  <pre className="mt-1 text-xs bg-white border rounded p-2 whitespace-pre-wrap font-mono max-h-40 overflow-y-auto">
                    {lead.reasoningTrace}
                  </pre>
                </details>
              )}
            </div>

            {/* Cold email */}
            <div className="bg-sky-50/50 border border-sky-100 rounded p-3 space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <Mail className="w-4 h-4 text-sky-600" />
                <h4 className="font-medium text-sm">Cold Email</h4>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Subject</div>
                <div className="font-medium text-sm">{coldEmail.subject || '—'}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Body</div>
                <pre className="text-sm whitespace-pre-wrap font-sans bg-white border rounded p-2">
                  {coldEmail.body || '—'}
                </pre>
              </div>
            </div>

            {/* LinkedIn message */}
            <div className="bg-blue-50/50 border border-blue-100 rounded p-3 space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <Linkedin className="w-4 h-4 text-blue-600" />
                <h4 className="font-medium text-sm">LinkedIn Outreach Message</h4>
              </div>
              <pre className="text-sm whitespace-pre-wrap font-sans bg-white border rounded p-2">
                {lead.linkedinMessage || '—'}
              </pre>
            </div>

            {/* Follow-up sequence */}
            <div className="space-y-2">
              <h4 className="font-medium text-sm">Follow-up Email Sequence</h4>
              <div className="bg-amber-50/50 border border-amber-100 rounded p-3 space-y-1">
                <div className="text-xs font-medium text-amber-800">Day 2 — Value add</div>
                <pre className="text-sm whitespace-pre-wrap font-sans">
                  {lead.followupDay2 || '—'}
                </pre>
              </div>
              <div className="bg-amber-50/50 border border-amber-100 rounded p-3 space-y-1">
                <div className="text-xs font-medium text-amber-800">Day 5 — Different angle</div>
                <pre className="text-sm whitespace-pre-wrap font-sans">
                  {lead.followupDay5 || '—'}
                </pre>
              </div>
              <div className="bg-amber-50/50 border border-amber-100 rounded p-3 space-y-1">
                <div className="text-xs font-medium text-amber-800">Day 10 — Breakup email</div>
                <pre className="text-sm whitespace-pre-wrap font-sans">
                  {lead.followupDay10 || '—'}
                </pre>
              </div>
            </div>

            {/* Import warning */}
            {!lead.isImportedToPipeline && (
              <div className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded p-2 flex items-start gap-2">
                <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                <div>
                  Importing creates a lead with a placeholder email
                  (contact@{lead.website}). You must edit the lead to add the
                  real decision-maker&apos;s email address before sending.
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
        <DialogFooter>
          {!lead.isImportedToPipeline && (
            <Button onClick={onImport} size="sm">
              <ArrowRight className="w-4 h-4 mr-2" />
              Import to Pipeline
            </Button>
          )}
          <Button variant="outline" onClick={onClose} size="sm">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm">{value}</div>
    </div>
  )
}
