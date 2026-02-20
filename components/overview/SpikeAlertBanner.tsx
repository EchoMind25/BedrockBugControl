'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { SpikeAlert } from '@/types'

interface SpikeAlertBannerProps {
  alerts: SpikeAlert[]
  productNames: Record<string, string>
}

export function SpikeAlertBanner({ alerts, productNames }: SpikeAlertBannerProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [acknowledging, setAcknowledging] = useState<Set<string>>(new Set())

  const visible = alerts.filter((a) => !dismissed.has(a.id))
  if (visible.length === 0) return null

  async function acknowledge(id: string) {
    setAcknowledging((prev) => new Set(prev).add(id))
    try {
      const res = await fetch('/api/bcc/acknowledge-spike', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (res.ok) {
        setDismissed((prev) => new Set(prev).add(id))
      }
    } catch {
      // silent — user can retry
    } finally {
      setAcknowledging((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  return (
    <div className="mb-5 space-y-2">
      {visible.map((alert) => {
        const productName = productNames[alert.product] ?? alert.product
        const multiplierStr = alert.spike_multiplier.toFixed(1)
        const isAcking = acknowledging.has(alert.id)

        return (
          <div
            key={alert.id}
            className="flex items-center gap-3 flex-wrap bg-amber-900/20 border border-amber-700/50 rounded-xl px-4 py-3"
          >
            <span className="text-amber-400 text-sm flex-shrink-0">⚠️</span>
            <p className="text-sm text-amber-200 flex-1 min-w-0">
              <span className="font-semibold">Error spike detected in {productName}:</span>{' '}
              {alert.current_count} errors in last hour
              {alert.baseline_avg > 0 && (
                <span className="text-amber-400"> ({multiplierStr}x normal)</span>
              )}
            </p>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Link
                href={`/errors?product=${alert.product}`}
                className="text-xs text-amber-300 border border-amber-700/50 hover:bg-amber-900/40 px-2.5 py-1 rounded-lg transition-colors"
              >
                View errors →
              </Link>
              <button
                onClick={() => acknowledge(alert.id)}
                disabled={isAcking}
                className="text-xs text-slate-400 border border-slate-700/50 hover:bg-slate-700/50 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50"
              >
                {isAcking ? 'Acknowledging…' : 'Acknowledge'}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
