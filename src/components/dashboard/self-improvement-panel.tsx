'use client'

import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Sparkles, TrendingUp, History } from 'lucide-react'
import type { SelfImprovementLogT } from '@/lib/types'

interface Props {
  logs: SelfImprovementLogT[]
}

export function SelfImprovementLogsPanel({ logs }: Props) {
  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-5 h-5 text-violet-600" />
          <h2 className="text-xl font-semibold tracking-tight">
            Self-Improvement Logs
          </h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Every time you (or the scheduler) trigger a self-improvement cycle,
          the AI looks back at recent outcomes, extracts new lessons, retires
          stale ones, and writes a log entry here.
        </p>
      </div>

      {logs.length === 0 ? (
        <Card className="p-8 border-dashed text-center">
          <History className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            No self-improvement runs yet. Click the
            &quot;Run Self-Improvement&quot; button in the header to trigger
            the first cycle.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {logs.map((log) => {
            let newLessons: any[] = []
            let metrics: any = null
            try {
              newLessons = JSON.parse(log.newLessons || '[]')
            } catch {}
            try {
              metrics = JSON.parse(log.metricsJson || '{}')
            } catch {}

            return (
              <Card key={log.id} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-muted-foreground">
                        {new Date(log.createdAt).toLocaleString()}
                      </span>
                      <Badge variant="outline" className="text-[10px]">
                        {log.emailsAnalyzed} emails · {log.leadsAnalyzed} leads
                      </Badge>
                    </div>
                    <p className="text-sm font-medium">{log.summary}</p>
                  </div>
                </div>

                {metrics && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                    {metrics.replyRate !== undefined && (
                      <Metric
                        label="Reply rate"
                        value={`${((metrics.replyRate as number) * 100).toFixed(1)}%`}
                      />
                    )}
                    {metrics.positiveRate !== undefined && (
                      <Metric
                        label="Positive rate"
                        value={`${((metrics.positiveRate as number) * 100).toFixed(1)}%`}
                      />
                    )}
                    <Metric
                      label="New lessons"
                      value={String(newLessons.length)}
                    />
                    <Metric
                      label="Window"
                      value={`${new Date(log.windowStart).toLocaleDateString()} → ${new Date(log.windowEnd).toLocaleDateString()}`}
                    />
                  </div>
                )}

                {newLessons.length > 0 && (
                  <div className="space-y-1.5 pt-2 border-t">
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" />
                      New lessons written to memory:
                    </div>
                    {newLessons.map((l, i) => (
                      <div
                        key={i}
                        className="text-xs bg-violet-50 border border-violet-100 rounded p-2"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="text-[10px]">
                            {l.scope}
                            {l.scopeKey ? `: ${l.scopeKey}` : ''}
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            {l.category}
                          </Badge>
                          <span className="text-muted-foreground">
                            impact {(l.impactScore * 100).toFixed(0)}% · sample {l.sampleSize}
                          </span>
                        </div>
                        <div>{l.lesson}</div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/40 rounded p-2">
      <div className="text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  )
}
