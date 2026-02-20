'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ResponsiveContainer,
} from 'recharts'
import type { DailyCount } from '@/types'

interface ErrorOccurrenceChartProps {
  data: DailyCount[]
}

function formatDay(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function isToday(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  return (
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  )
}

export function ErrorOccurrenceChart({ data }: ErrorOccurrenceChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-slate-500 text-sm">
        No occurrence data
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis
          dataKey="day"
          tickFormatter={formatDay}
          tick={{ fill: '#64748b', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          interval={Math.floor(data.length / 6)}
        />
        <YAxis
          tick={{ fill: '#64748b', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: '#0f172a',
            border: '1px solid #334155',
            borderRadius: '8px',
            color: '#e2e8f0',
            fontSize: '12px',
          }}
          labelFormatter={(label) => (typeof label === 'string' ? formatDay(label) : String(label))}
          formatter={(value: number | undefined) => [value ?? 0, 'Occurrences']}
        />
        <Bar dataKey="count" radius={[2, 2, 0, 0]}>
          {data.map((entry) => (
            <Cell
              key={entry.day}
              fill={isToday(entry.day) ? '#f59e0b' : '#00D9FF'}
              fillOpacity={isToday(entry.day) ? 0.9 : 0.7}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
