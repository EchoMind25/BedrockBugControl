'use client'

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { getProductColor } from '@/lib/charts/product-colors'
import type { ErrorTrendPoint } from '@/types'

interface ErrorTrendChartProps {
  data: ErrorTrendPoint[]
  products: string[]
}

function formatDay(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function ErrorTrendChart({ data, products }: ErrorTrendChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-slate-500 text-sm">
        No error data in the last 14 days
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
        <defs>
          {products.map((product) => (
            <linearGradient key={product} id={`grad-${product}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={getProductColor(product)} stopOpacity={0.3} />
              <stop offset="95%" stopColor={getProductColor(product)} stopOpacity={0.0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis
          dataKey="day"
          tickFormatter={formatDay}
          tick={{ fill: '#64748b', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
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
        />
        {products.length > 1 && (
          <Legend
            wrapperStyle={{ fontSize: '12px', paddingTop: '8px', color: '#94a3b8' }}
          />
        )}
        {products.map((product) => (
          <Area
            key={product}
            type="monotone"
            dataKey={product}
            name={product}
            stackId="1"
            stroke={getProductColor(product)}
            fill={`url(#grad-${product})`}
            strokeWidth={2}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  )
}
