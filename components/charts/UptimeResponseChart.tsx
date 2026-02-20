'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts'
import type { UptimeCheck } from '@/types'

interface UptimeResponseChartProps {
  checks: UptimeCheck[]
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
}

export function UptimeResponseChart({ checks }: UptimeResponseChartProps) {
  if (checks.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-slate-500 text-sm">
        No uptime data available yet
      </div>
    )
  }

  const healthy = checks.filter((c) => c.is_healthy && c.response_time_ms !== null)
  const avg =
    healthy.length > 0
      ? Math.round(healthy.reduce((sum, c) => sum + (c.response_time_ms ?? 0), 0) / healthy.length)
      : 0

  const sorted = [...checks].sort(
    (a, b) => new Date(a.checked_at).getTime() - new Date(b.checked_at).getTime()
  )

  const chartData = sorted.map((c) => ({
    time: c.checked_at,
    ms: c.is_healthy ? (c.response_time_ms ?? null) : null,
    unhealthy: c.is_healthy ? null : 0,
  }))

  return (
    <ResponsiveContainer width="100%" height={160}>
      <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis
          dataKey="time"
          tickFormatter={formatTime}
          tick={{ fill: '#64748b', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          interval={Math.floor(chartData.length / 6)}
        />
        <YAxis
          tick={{ fill: '#64748b', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          unit="ms"
        />
        <Tooltip
          contentStyle={{
            backgroundColor: '#0f172a',
            border: '1px solid #334155',
            borderRadius: '8px',
            color: '#e2e8f0',
            fontSize: '12px',
          }}
          labelFormatter={(label) => (typeof label === 'string' ? formatTime(label) : String(label))}
          formatter={(value: unknown, name: string | undefined) => {
            if (name === 'ms' && value !== null && value !== undefined) return [`${value}ms` as unknown as number, 'Response time']
            return [value as number, name ?? '']
          }}
        />
        {avg > 0 && (
          <ReferenceLine
            y={avg}
            stroke="#64748b"
            strokeDasharray="4 4"
            label={{ value: `avg ${avg}ms`, fill: '#64748b', fontSize: 10, position: 'insideTopRight' }}
          />
        )}
        <Line
          type="monotone"
          dataKey="ms"
          stroke="#00D9FF"
          strokeWidth={1.5}
          dot={false}
          activeDot={{ r: 4, fill: '#00D9FF' }}
          connectNulls={false}
        />
        {/* Red dots for unhealthy checks */}
        <Line
          type="monotone"
          dataKey="unhealthy"
          stroke="transparent"
          strokeWidth={0}
          dot={(props: { cx?: number; cy?: number; payload?: { unhealthy: number | null } }) => {
            const { cx, cy, payload } = props
            if (payload?.unhealthy === null || cx === undefined || cy === undefined) return <g key={`${cx}-${cy}`} />
            return <circle key={`u-${cx}-${cy}`} cx={cx} cy={cy} r={4} fill="#ef4444" />
          }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
