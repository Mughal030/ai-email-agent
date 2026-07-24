'use client'

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Sparkles, Brain, Loader2, FileText, MemoryStick } from 'lucide-react'

interface PreviewResult {
  demoMode: boolean
  lead: {
    id: string
    name: string
    email: string
    company: string | null
    role: string | null
    industry: string | null
  }
  existingProfile: any
  analysis: {
    personalityArchetype: string
    dominantMotivator: string
    communicationStyle: string
    painPoints: string[]
    angleRecommended: string
    reasoningTrace: string
    confidence: number
    aiModel?: string
    aiReasoning?: string | null
    aiLatencyMs?: number
  }
  draft: {
    subject: string
    body: string
    strategyUsed: string
    psychAnalysis: string
    aiModel?: string
    aiReasoning?: string | null
    aiLatencyMs?: number
  }
  memoryText: string
}

interface Props {
  leadId: string | null
  leadName?: string
  onClose: () => void
}

export function AIPreviewDialog({ leadId, leadName, onClose }: Props) {
  const [data, setData] = useState<PreviewResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!leadId) return
    let cancelled = false
    const run = async () => {
      setLoading(true)
      setError(null)
      setData(null)
      try {
        const r = await fetch(`/api/agent/lead/${leadId}/preview`, {
          method: 'POST',
        })
        const j = await r.json()
        if (cancelled) return
        if (j.error) setError(j.error)
        else setData(j)
      } catch (e) {
        if (!cancelled) setError((e as Error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [leadId])

  return (
    <Dialog open={!!leadId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-violet-600" />
            AI Reasoning Preview
            {leadName && <span className="text-muted-foreground">— {leadName}</span>}
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="flex-1 -mx-6 px-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-violet-600" />
              <p className="text-sm text-muted-foreground">
                Agent is analyzing the lead&apos;s psychology...
              </p>
            </div>
          ) : error ? (
            <div className="text-sm text-rose-600 p-4 bg-rose-50 rounded">
              Error: {error}
            </div>
          ) : data ? (
            <div className="space-y-4">
              {data.demoMode ? (
                <div className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded p-2">
                  DEMO MODE: NVIDIA API keys not all configured. Showing
                  simulated AI output. Set NVIDIA_KEY_DEEPSEEK /
                  NVIDIA_KEY_GEMMA / NVIDIA_KEY_MINIMAX in <code>.env</code> to
                  use the real multi-model router.
                </div>
              ) : (
                <div className="text-xs bg-emerald-50 border border-emerald-200 text-emerald-800 rounded p-2">
                  REAL AI MODE: Using the multi-model router (Deepseek for
                  reasoning, Gemma for drafting, MiniMax for classification).
                  Reasoning traces and per-call latency are captured below.
                </div>
              )}

              {/* Analysis */}
              <div>
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <Brain className="w-4 h-4 text-violet-600" />
                  <h4 className="font-medium text-sm">
                    Step 1 — Psychological Analysis
                  </h4>
                  {!data.demoMode && data.analysis.aiModel && (
                    <>
                      <Badge
                        variant="outline"
                        className="text-[10px] border-violet-200 bg-violet-50 text-violet-700"
                      >
                        {data.analysis.aiModel}
                      </Badge>
                      {data.analysis.aiLatencyMs && (
                        <span className="text-[10px] text-muted-foreground">
                          {data.analysis.aiLatencyMs}ms
                        </span>
                      )}
                    </>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3 bg-violet-50/50 border border-violet-100 rounded p-3">
                  <Field
                    label="Archetype"
                    value={data.analysis.personalityArchetype}
                  />
                  <Field
                    label="Dominant motivator"
                    value={data.analysis.dominantMotivator}
                  />
                  <Field
                    label="Communication style"
                    value={data.analysis.communicationStyle}
                  />
                  <Field
                    label="Recommended angle"
                    value={data.analysis.angleRecommended}
                  />
                  <div className="col-span-2">
                    <div className="text-xs text-muted-foreground mb-1">
                      Inferred pain points
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {data.analysis.painPoints?.map((p, i) => (
                        <Badge key={i} variant="outline" className="text-xs">
                          {p}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="col-span-2">
                    <div className="text-xs text-muted-foreground mb-1">
                      Reasoning trace
                    </div>
                    <pre className="text-xs bg-white border rounded p-2 whitespace-pre-wrap font-mono">
                      {data.analysis.reasoningTrace}
                    </pre>
                  </div>
                  <Field
                    label="Confidence"
                    value={`${(data.analysis.confidence * 100).toFixed(0)}%`}
                  />
                </div>
                {!data.demoMode && data.analysis.aiReasoning && (
                  <details className="mt-2">
                    <summary className="text-xs text-violet-700 cursor-pointer hover:underline">
                      Show full chain-of-thought from {data.analysis.aiModel}
                    </summary>
                    <pre className="mt-1 text-xs bg-zinc-50 border rounded p-2 whitespace-pre-wrap font-mono max-h-60 overflow-y-auto">
                      {data.analysis.aiReasoning}
                    </pre>
                  </details>
                )}
              </div>

              {/* Draft */}
              <div>
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <FileText className="w-4 h-4 text-sky-600" />
                  <h4 className="font-medium text-sm">
                    Step 2 — Drafted Outreach
                  </h4>
                  <Badge variant="outline" className="text-[10px]">
                    {data.draft.strategyUsed}
                  </Badge>
                  {!data.demoMode && data.draft.aiModel && (
                    <>
                      <Badge
                        variant="outline"
                        className="text-[10px] border-sky-200 bg-sky-50 text-sky-700"
                      >
                        {data.draft.aiModel}
                      </Badge>
                      {data.draft.aiLatencyMs && (
                        <span className="text-[10px] text-muted-foreground">
                          {data.draft.aiLatencyMs}ms
                        </span>
                      )}
                    </>
                  )}
                </div>
                <div className="bg-sky-50/50 border border-sky-100 rounded p-3 space-y-2">
                  <div>
                    <div className="text-xs text-muted-foreground">Subject</div>
                    <div className="font-medium">{data.draft.subject}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Body</div>
                    <pre className="text-sm whitespace-pre-wrap font-sans bg-white border rounded p-2">
                      {data.draft.body}
                    </pre>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">
                      Why this email will land
                    </div>
                    <div className="text-sm italic">
                      {data.draft.psychAnalysis}
                    </div>
                  </div>
                </div>
                {!data.demoMode && data.draft.aiReasoning && (
                  <details className="mt-2">
                    <summary className="text-xs text-sky-700 cursor-pointer hover:underline">
                      Show full chain-of-thought from {data.draft.aiModel}
                    </summary>
                    <pre className="mt-1 text-xs bg-zinc-50 border rounded p-2 whitespace-pre-wrap font-mono max-h-60 overflow-y-auto">
                      {data.draft.aiReasoning}
                    </pre>
                  </details>
                )}
              </div>

              {/* Memory used */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <MemoryStick className="w-4 h-4 text-emerald-600" />
                  <h4 className="font-medium text-sm">
                    Memory injected into this prompt
                  </h4>
                </div>
                <pre className="text-xs bg-emerald-50/50 border border-emerald-100 rounded p-2 whitespace-pre-wrap font-mono max-h-40 overflow-y-auto">
                  {data.memoryText}
                </pre>
              </div>
            </div>
          ) : null}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  )
}
