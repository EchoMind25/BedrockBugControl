'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { SparklineChart } from '@/components/charts/SparklineChart'
import { relativeTime } from '@/lib/utils/relativeTime'
import type { ErrorGroup, ErrorGroupStatusRow, ErrorGroupStatus, DailyCount } from '@/types'

const SOURCE_LABEL: Record<string, string> = {
  client: 'Client',
  server: 'Server',
  edge_function: 'Edge',
}

const STATUS_BADGE: Record<string, string> = {
  active: 'text-red-400 bg-red-900/30 border-red-700/40',
  acknowledged: 'text-yellow-400 bg-yellow-900/30 border-yellow-700/40',
  resolved: 'text-emerald-400 bg-emerald-900/30 border-emerald-700/40',
  ignored: 'text-slate-500 bg-slate-800 border-slate-700/40',
}

interface ErrorTableWithBulkProps {
  errorGroups: ErrorGroup[]
  statusMap: Record<string, ErrorGroupStatusRow>
  sparklineMap: Record<string, DailyCount[]>
  productNames: Record<string, string>
}

export function ErrorTableWithBulk({
  errorGroups,
  statusMap,
  sparklineMap,
  productNames,
}: ErrorTableWithBulkProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [applying, setApplying] = useState(false)
  const [applyResult, setApplyResult] = useState<string | null>(null)
  const [statusOverrides, setStatusOverrides] = useState<Record<string, ErrorGroupStatus>>({})

  const isAllSelected = errorGroups.length > 0 && selected.size === errorGroups.length

  function toggleAll() {
    if (isAllSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(errorGroups.map((g) => g.fingerprint)))
    }
  }

  function toggleRow(fingerprint: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(fingerprint)) next.delete(fingerprint)
      else next.add(fingerprint)
      return next
    })
  }

  const applyBulk = useCallback(async (newStatus: ErrorGroupStatus) => {
    if (selected.size === 0) return
    const confirmed = window.confirm(
      `Mark ${selected.size} error group${selected.size !== 1 ? 's' : ''} as "${newStatus}"?`
    )
    if (!confirmed) return

    setApplying(true)
    setApplyResult(null)

    // Build items array from selected fingerprints
    const items = errorGroups
      .filter((g) => selected.has(g.fingerprint))
      .map((g) => ({ fingerprint: g.fingerprint, product: g.product }))

    try {
      const res = await fetch('/api/bcc/bulk-errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, status: newStatus }),
      })
      const data = await res.json() as { ok?: boolean; updated?: number; error?: string }

      if (res.ok && data.ok) {
        // Apply status overrides locally
        setStatusOverrides((prev) => {
          const next = { ...prev }
          for (const fp of selected) next[fp] = newStatus
          return next
        })
        setApplyResult(`Marked ${data.updated ?? selected.size} as ${newStatus}`)
        setSelected(new Set())
      } else {
        setApplyResult(data.error ?? 'Failed')
      }
    } catch {
      setApplyResult('Network error')
    } finally {
      setApplying(false)
    }
  }, [errorGroups, selected])

  if (errorGroups.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-slate-600 text-sm">No errors match the current filters.</p>
      </div>
    )
  }

  return (
    <div>
      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="sticky top-0 z-10 bg-slate-900/95 border-b border-slate-700/50 px-4 py-3 flex flex-wrap items-center gap-3 backdrop-blur">
          <span className="text-xs text-slate-400 font-medium">{selected.size} selected</span>
          <button
            onClick={() => applyBulk('acknowledged')}
            disabled={applying}
            className="text-xs px-3 py-1.5 bg-yellow-900/40 hover:bg-yellow-900/60 border border-yellow-700/50 text-yellow-300 rounded-lg transition-colors disabled:opacity-40"
          >
            Acknowledge All
          </button>
          <button
            onClick={() => applyBulk('resolved')}
            disabled={applying}
            className="text-xs px-3 py-1.5 bg-emerald-900/40 hover:bg-emerald-900/60 border border-emerald-700/50 text-emerald-300 rounded-lg transition-colors disabled:opacity-40"
          >
            Resolve All
          </button>
          <button
            onClick={() => applyBulk('ignored')}
            disabled={applying}
            className="text-xs px-3 py-1.5 bg-slate-700/50 hover:bg-slate-700 border border-slate-600 text-slate-400 rounded-lg transition-colors disabled:opacity-40"
          >
            Ignore All
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            Cancel
          </button>
          {applyResult && (
            <span className={`text-xs ${applyResult.startsWith('Marked') || applyResult.startsWith('Applied') ? 'text-emerald-400' : 'text-red-400'}`}>
              {applyResult}
            </span>
          )}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700/50">
              <th className="px-3 py-2.5 w-8">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={toggleAll}
                  className="rounded border-slate-600 bg-slate-800 accent-blue-500"
                />
              </th>
              {['Error', 'Product', 'Source', 'Count (24h)', 'Users', 'Last Seen', 'Status'].map((h) => (
                <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {errorGroups.map((group) => {
              const status = statusOverrides[group.fingerprint] ?? statusMap[group.fingerprint]?.status ?? 'active'
              const spark = sparklineMap[group.fingerprint] ?? []
              const isSelected = selected.has(group.fingerprint)

              return (
                <tr
                  key={`${group.fingerprint}-${group.product}`}
                  className={`border-b border-slate-700/30 hover:bg-slate-700/20 transition-colors ${isSelected ? 'bg-blue-900/10' : ''}`}
                >
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleRow(group.fingerprint)}
                      onClick={(e) => e.stopPropagation()}
                      className="rounded border-slate-600 bg-slate-800 accent-blue-500"
                    />
                  </td>
                  <td className="px-4 py-3 max-w-xs">
                    <Link href={`/errors/${group.fingerprint}`} className="block">
                      <code className="text-xs text-slate-300 hover:text-slate-100 font-mono truncate block max-w-xs">
                        {group.error_message.slice(0, 80)}
                      </code>
                    </Link>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="text-xs text-slate-400 border border-slate-700/50 bg-slate-800 px-1.5 py-0.5 rounded">
                      {productNames[group.product] ?? group.product}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                    {SOURCE_LABEL[group.source] ?? group.source}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-300">{group.occurrences_24h}</span>
                      {spark.length > 0 && <SparklineChart data={spark} />}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-400 whitespace-nowrap">
                    {group.affected_users}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                    {relativeTime(group.last_seen)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border capitalize ${STATUS_BADGE[status] ?? STATUS_BADGE.active}`}>
                      {status}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
