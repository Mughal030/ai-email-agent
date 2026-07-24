'use client'

import { useEffect, useState } from 'react'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, TrendingUp, Clock, CheckCircle2, Activity } from 'lucide-react'
import {
  type AnalyticsData,
  MODEL_LABELS,
  TASK_LABELS,
} from '@/lib/types'

const SENTIMENT_COLORS: Record<string, string> = {
  positive: '#10b981',
  curious: '#0ea5e9',
  neutral: '#71717a',
  negative: '#e11d48',
}

export function AnalyticsCharts() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const res = await fetch('/api/analytics')
        const j = await res.json()
        if (!cancelled) setData(j)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    const id = setInterval(run, 30000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Top KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard
          label="Outreach Sent"
          value={data.totals.outreachSent}
          icon={TrendingUp}
          color="text-sky-600"
        />
        <KpiCard
          label="Replies Received"
          value={data.totals.replies}
          icon={Activity}
          color="text-emerald-600"
        />
        <KpiCard
          label="Auto-Replies"
          value={data.totals.autoReplies}
          icon={CheckCircle2}
          color="text-violet-600"
        />
        <KpiCard
          label="AI Calls Total"
          value={data.totals.aiCalls}
          icon={Activity}
          color="text-amber-600"
        />
        <KpiCard
          label="Reply Rate"
          value={`${
            data.totals.outreachSent > 0
              ? ((data.totals.replies / data.totals.outreachSent) * 100).toFixed(1)
              : '0.0'
          }%`}
          icon={TrendingUp}
          color="text-emerald-600"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Email activity over time */}
        <Card className="p-5">
          <div className="mb-3">
            <h3 className="font-semibold text-sm">Email Activity (last 14 days)</h3>
            <p className="text-xs text-muted-foreground">
              Outreach sent vs replies received vs auto-replies sent
            </p>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={data.days} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="sent" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="received" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="autoReplied" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10 }}
                tickFormatter={(d) => d.slice(5)}
              />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  fontSize: 11,
                  borderRadius: 6,
                  border: '1px solid #e4e4e7',
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area
                type="monotone"
                dataKey="sent"
                name="Outreach"
                stroke="#0ea5e9"
                fill="url(#sent)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="received"
                name="Replies"
                stroke="#10b981"
                fill="url(#received)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="autoReplied"
                name="Auto-Replies"
                stroke="#7c3aed"
                fill="url(#autoReplied)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        {/* Sentiment breakdown */}
        <Card className="p-5">
          <div className="mb-3">
            <h3 className="font-semibold text-sm">Reply Sentiment Distribution</h3>
            <p className="text-xs text-muted-foreground">
              How leads are reacting to your outreach
            </p>
          </div>
          {data.totals.replies === 0 ? (
            <div className="h-[240px] flex items-center justify-center text-sm text-muted-foreground">
              No replies yet — sentiment chart will populate once leads reply.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={Object.entries(data.sentiment).map(([k, v]) => ({
                    name: k,
                    value: v,
                  }))}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  innerRadius={40}
                  label={(entry) =>
                    entry.value > 0 ? `${entry.name}: ${entry.value}` : ''
                  }
                  labelLine={false}
                >
                  {Object.entries(data.sentiment).map(([k]) => (
                    <Cell key={k} fill={SENTIMENT_COLORS[k] || '#71717a'} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    fontSize: 11,
                    borderRadius: 6,
                    border: '1px solid #e4e4e7',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Strategy / intent breakdown */}
        <Card className="p-5">
          <div className="mb-3">
            <h3 className="font-semibold text-sm">Reply Intent Breakdown</h3>
            <p className="text-xs text-muted-foreground">
              What leads are saying when they reply
            </p>
          </div>
          {data.strategyBreakdown.length === 0 ? (
            <div className="h-[240px] flex items-center justify-center text-sm text-muted-foreground">
              No data yet.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart
                data={data.strategyBreakdown}
                layout="vertical"
                margin={{ top: 5, right: 20, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="strategy"
                  tick={{ fontSize: 10 }}
                  width={90}
                />
                <Tooltip
                  contentStyle={{
                    fontSize: 11,
                    borderRadius: 6,
                    border: '1px solid #e4e4e7',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="sent" name="Sent" fill="#0ea5e9" radius={[0, 4, 4, 0]} />
                <Bar dataKey="replies" name="Replies" fill="#10b981" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Industry reply rate */}
        <Card className="p-5">
          <div className="mb-3">
            <h3 className="font-semibold text-sm">Reply Rate by Industry</h3>
            <p className="text-xs text-muted-foreground">
              Which industries respond best to the agent&apos;s outreach
            </p>
          </div>
          {data.industryPerformance.length === 0 ? (
            <div className="h-[240px] flex items-center justify-center text-sm text-muted-foreground">
              No leads yet.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart
                data={data.industryPerformance}
                margin={{ top: 5, right: 20, left: -20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                <XAxis dataKey="industry" tick={{ fontSize: 10 }} />
                <YAxis
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                  domain={[0, 1]}
                />
                <Tooltip
                  contentStyle={{
                    fontSize: 11,
                    borderRadius: 6,
                    border: '1px solid #e4e4e7',
                  }}
                  formatter={(v: number, name: string) =>
                    name === 'Reply Rate' ? `${(v * 100).toFixed(0)}%` : v
                  }
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="total" name="Total Leads" fill="#a78bfa" radius={[4, 4, 0, 0]} />
                <Bar dataKey="replied" name="Replied" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* AI Model Usage — the headline chart for the multi-model architecture */}
      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-sm">
              Multi-Model AI Usage — 5 Models (Nemotron · Mistral · MiniMax + Fallbacks)
            </h3>
            <p className="text-xs text-muted-foreground">
              Each task type is routed to the best model for that job
            </p>
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Model cards */}
          <div className="space-y-2 lg:col-span-1">
            {data.aiModelUsage.length === 0 ? (
              <p className="text-xs text-muted-foreground py-8 text-center">
                No AI calls yet. Queue a lead and run an agent tick to see
                the multi-model router in action.
              </p>
            ) : (
              data.aiModelUsage.map((m) => {
                const meta = MODEL_LABELS[m.model] || {
                  label: m.model,
                  color: '#71717a',
                  task: '',
                }
                return (
                  <div
                    key={m.model}
                    className="border rounded p-3 space-y-1.5"
                    style={{ borderColor: meta.color + '40' }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: meta.color }}
                        />
                        <span className="font-medium text-sm">{meta.label}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {m.calls} calls
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">{meta.task}</div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        {(m.successRate * 100).toFixed(0)}% success
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-amber-600" />
                        {m.avgLatencyMs}ms avg
                      </span>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* AI calls over time */}
          <div className="lg:col-span-2">
            {data.aiCallsByDay.every(
              (d) =>
                d.nemotron + d.mistral + d.minimax + d.deepseek + d.gemma === 0
            ) ? (
              <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">
                No AI calls in the last 14 days.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart
                  data={data.aiCallsByDay}
                  margin={{ top: 5, right: 10, left: -20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(d) => d.slice(5)}
                  />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      fontSize: 11,
                      borderRadius: 6,
                      border: '1px solid #e4e4e7',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Line
                    type="monotone"
                    dataKey="nemotron"
                    name="Nemotron (primary reasoning)"
                    stroke={MODEL_LABELS['nemotron-3-super'].color}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="mistral"
                    name="Mistral (primary drafting)"
                    stroke={MODEL_LABELS['mistral-small-4'].color}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="minimax"
                    name="MiniMax (classification)"
                    stroke={MODEL_LABELS['minimax-m3'].color}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="deepseek"
                    name="Deepseek (fallback)"
                    stroke={MODEL_LABELS['deepseek-v4-flash'].color}
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    dot={{ r: 2 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="gemma"
                    name="Gemma (fallback)"
                    stroke={MODEL_LABELS['gemma-4-31b'].color}
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    dot={{ r: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Per-task-per-model breakdown */}
        {data.aiModelUsage.some((m) => m.byTask.length > 0) && (
          <div className="mt-5 pt-4 border-t">
            <h4 className="text-sm font-medium mb-3">
              Per-task performance (which model handled what)
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 pr-4 font-medium">Model</th>
                    <th className="py-2 pr-4 font-medium">Task</th>
                    <th className="py-2 pr-4 font-medium">Calls</th>
                    <th className="py-2 pr-4 font-medium">Success</th>
                    <th className="py-2 pr-4 font-medium">Avg latency</th>
                  </tr>
                </thead>
                <tbody>
                  {data.aiModelUsage.flatMap((m) =>
                    m.byTask.map((t) => (
                      <tr key={`${m.model}-${t.task}`} className="border-b last:border-0">
                        <td className="py-2 pr-4">
                          <div className="flex items-center gap-1.5">
                            <div
                              className="w-2 h-2 rounded-full"
                              style={{
                                backgroundColor:
                                  MODEL_LABELS[m.model]?.color || '#71717a',
                              }}
                            />
                            {MODEL_LABELS[m.model]?.label || m.model}
                          </div>
                        </td>
                        <td className="py-2 pr-4">
                          {TASK_LABELS[t.task] || t.task}
                        </td>
                        <td className="py-2 pr-4">{t.calls}</td>
                        <td className="py-2 pr-4">
                          {(t.successRate * 100).toFixed(0)}%
                        </td>
                        <td className="py-2 pr-4">{t.avgLatencyMs}ms</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}

function KpiCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string
  value: number | string
  icon: typeof TrendingUp
  color: string
}) {
  return (
    <Card className="p-4 space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Icon className={`w-3.5 h-3.5 ${color}`} />
      </div>
      <div className="text-2xl font-semibold tracking-tight">{value}</div>
    </Card>
  )
}
