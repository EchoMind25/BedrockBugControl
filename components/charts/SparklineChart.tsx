'use client'

import { LineChart, Line, ResponsiveContainer } from 'recharts'
import type { DailyCount } from '@/types'

interface SparklineChartProps {
  data: DailyCount[]
  color?: string
}

export function SparklineChart({ data, color = '#00D9FF' }: SparklineChartProps) {
  if (data.length === 0) {
    return <div className="w-[50px] h-[20px] bg-slate-800 rounded opacity-30" />
  }

  return (
    <div className="w-[50px] h-[20px] inline-block">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Line
            type="monotone"
            dataKey="count"
            stroke={color}
            strokeWidth={1.5}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
