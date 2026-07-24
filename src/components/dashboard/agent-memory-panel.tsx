'use client'

import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Brain, Lightbulb, TrendingUp, TrendingDown, Clock } from 'lucide-react'
import type { AgentMemoryT } from '@/lib/types'

interface Props {
  memory: AgentMemoryT[]
}

const SCOPE_LABEL: Record<string, string> = {
  GLOBAL: 'Global',
  INDUSTRY: 'Industry',
  ROLE: 'Role',
  COMPANY_SIZE: 'Company Size',
}

const CATEGORY_COLOR: Record<string, string> = {
  subject_line: 'border-sky-200 bg-sky-50 text-sky-700',
  tone: 'border-violet-200 bg-violet-50 text-violet-700',
  timing: 'border-amber-200 bg-amber-50 text-amber-700',
  angle: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  length: 'border-zinc-200 bg-zinc-50 text-zinc-700',
  cta: 'border-rose-200 bg-rose-50 text-rose-700',
}

export function AgentMemoryPanel({ memory }: Props) {
  const active = memory.filter((m) => m.isActive)
  const retired = memory.filter((m) => !m.isActive)

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Brain className="w-5 h-5 text-violet-600" />
          <h2 className="text-xl font-semibold tracking-tight">Agent Memory</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Lessons the AI has extracted from past outcomes. These are
          auto-injected into every new email&apos;s system prompt as
          &quot;prior memory&quot; for the relevant industry / role.
        </p>
      </div>

      {active.length === 0 ? (
        <Card className="p-8 border-dashed text-center">
          <Lightbulb className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            No memories yet. After you&apos;ve sent some emails, click
            &quot;Run Self-Improvement&quot; in the header — the AI will
            analyze outcomes and write its first lessons here.
          </p>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {active.map((m) => (
            <Card key={m.id} className="p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1">
                  <Badge variant="outline" className="text-[10px]">
                    {SCOPE_LABEL[m.scope]}
                    {m.scopeKey ? `: ${m.scopeKey}` : ''}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${
                      CATEGORY_COLOR[m.category] || ''
                    }`}
                  >
                    {m.category}
                  </Badge>
                  {m.impactScore >= 0.7 ? (
                    <TrendingUp className="w-3 h-3 text-emerald-600" />
                  ) : m.impactScore < 0.3 ? (
                    <TrendingDown className="w-3 h-3 text-rose-600" />
                  ) : null}
                </div>
                <span className="text-xs text-muted-foreground">
                  impact {(m.impactScore * 100).toFixed(0)}%
                </span>
              </div>
              <p className="text-sm leading-relaxed">{m.lesson}</p>
              <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1 border-t">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {new Date(m.createdAt).toLocaleDateString()}
                </span>
                <span>sample: {m.sampleSize}</span>
                <span>positive rate: {(m.positiveRate * 100).toFixed(0)}%</span>
              </div>
            </Card>
          ))}
        </div>
      )}

      {retired.length > 0 && (
        <div className="space-y-2 pt-4 border-t">
          <h3 className="text-sm font-medium text-muted-foreground">
            Retired lessons ({retired.length})
          </h3>
          <div className="space-y-1">
            {retired.slice(0, 10).map((m) => (
              <div
                key={m.id}
                className="text-xs text-muted-foreground line-through opacity-60"
              >
                {m.lesson}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
