'use client'

import {
  ComposedChart,
  Bar,
  ReferenceLine,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { DeployCorrelationBucket } from '@/types'

interface DeployCorrelationChartProps {
  buckets: DeployCorrelationBucket[]
  deployedAt: string  // ISO timestamp — draws vertical reference line
}

function formatBucketTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

// Snap the deploy timestamp to the nearest 15-minute bucket boundary
function findDeployBucket(deployedAt: string): string {
  const deployMs = new Date(deployedAt).getTime()
  const BUCKET_MS = 15 * 60 * 1000
  const bucketKey = Math.floor(deployMs / BUCKET_MS) * BUCKET_MS
  return new Date(bucketKey).toISOString()
}

export function DeployCorrelationChart({
  buckets,
  deployedAt,
}: DeployCorrelationChartProps) {
  if (buckets.length === 0) {
    return (
      <p className="text-xs text-slate-500 text-center py-4">No error data in this window.</p>
    )
  }

  const deployBucket = findDeployBucket(deployedAt)

  return (
    <ResponsiveContainer width="100%" height={120}>
      <ComposedChart data={buckets} margin={{ top: 4, right: 4, bottom: 4, left: -20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
        <XAxis
          dataKey="bucket"
          tickFormatter={formatBucketTime}
          tick={{ fill: '#64748b', fontSize: 9 }}
          tickLine={false}
          axisLine={false}
          interval={3}
        />
        <YAxis
          tick={{ fill: '#64748b', fontSize: 9 }}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={{
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '6px',
            fontSize: '11px',
            color: '#e2e8f0',
          }}
          labelFormatter={(label) => formatBucketTime(label as string)}
          formatter={(value) => [value, 'Errors']}
        />
        <Bar dataKey="count" fill="#3b82f6" radius={[2, 2, 0, 0]} maxBarSize={16} />
        <ReferenceLine
          x={deployBucket}
          stroke="#f59e0b"
          strokeDasharray="4 2"
          strokeWidth={2}
          label={{ value: 'Deploy', fill: '#f59e0b', fontSize: 9, position: 'insideTopRight' }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
