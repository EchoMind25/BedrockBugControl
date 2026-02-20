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
import { getProductColor } from '@/lib/charts/product-colors'
import type { ActiveUserCount } from '@/types'

interface ActiveUsersChartProps {
  data: ActiveUserCount[]
  productNames: Record<string, string>
}

export function ActiveUsersChart({ data, productNames }: ActiveUsersChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-slate-500 text-sm">
        No active users right now
      </div>
    )
  }

  const chartData = data.map((d) => ({
    name: productNames[d.product] ?? d.product,
    product: d.product,
    count: d.active_count,
  }))

  return (
    <ResponsiveContainer width="100%" height={Math.max(60, chartData.length * 44)}>
      <BarChart
        data={chartData}
        layout="vertical"
        margin={{ top: 0, right: 30, left: 0, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
        <XAxis
          type="number"
          tick={{ fill: '#64748b', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fill: '#94a3b8', fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          width={90}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: '#0f172a',
            border: '1px solid #334155',
            borderRadius: '8px',
            color: '#e2e8f0',
            fontSize: '12px',
          }}
          formatter={(value: number | undefined) => [value ?? 0, 'Active users']}
        />
        <Bar dataKey="count" radius={[0, 4, 4, 0]} label={{ position: 'right', fill: '#94a3b8', fontSize: 11 }}>
          {chartData.map((entry) => (
            <Cell key={entry.product} fill={getProductColor(entry.product)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
