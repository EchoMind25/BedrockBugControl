'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useCallback } from 'react'
import type { BccProduct } from '@/types'

interface ErrorFiltersProps {
  products: BccProduct[]
}

const SOURCES = ['client', 'server', 'edge_function']
const STATUSES = ['active', 'acknowledged', 'resolved', 'ignored']
const TIME_RANGES = [
  { label: '24h', value: '24h' },
  { label: '7 days', value: '7d' },
  { label: '30 days', value: '30d' },
]

export function ErrorFilters({ products }: ErrorFiltersProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const setParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) params.set(key, value)
      else params.delete(key)
      router.push(`${pathname}?${params.toString()}`)
    },
    [router, pathname, searchParams]
  )

  function toggleMulti(key: string, value: string, current: string) {
    const parts = current ? current.split(',').filter(Boolean) : []
    const idx = parts.indexOf(value)
    if (idx >= 0) parts.splice(idx, 1)
    else parts.push(value)
    setParam(key, parts.join(','))
  }

  const selectedProduct = searchParams.get('product') ?? 'all'
  const selectedSources = (searchParams.get('source') ?? '').split(',').filter(Boolean)
  const selectedStatuses = (searchParams.get('status') ?? 'active').split(',').filter(Boolean)
  const selectedRange = searchParams.get('range') ?? '7d'
  const minOccurrences = searchParams.get('min') ?? '1'

  return (
    <div className="flex flex-wrap gap-4 items-start">
      {/* Product */}
      <div className="flex flex-col gap-1">
        <label className="text-[10px] text-slate-500 uppercase tracking-wider">Product</label>
        <select
          value={selectedProduct}
          onChange={(e) => setParam('product', e.target.value === 'all' ? '' : e.target.value)}
          className="bg-slate-900 border border-slate-700/50 text-slate-200 text-sm rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-slate-500"
        >
          <option value="all">All products</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>{p.display_name}</option>
          ))}
        </select>
      </div>

      {/* Source chips */}
      <div className="flex flex-col gap-1">
        <label className="text-[10px] text-slate-500 uppercase tracking-wider">Source</label>
        <div className="flex gap-1.5 flex-wrap">
          {SOURCES.map((src) => {
            const active = selectedSources.includes(src)
            return (
              <button
                key={src}
                onClick={() => toggleMulti('source', src, searchParams.get('source') ?? '')}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  active
                    ? 'bg-slate-200 text-slate-900 border-slate-200'
                    : 'bg-transparent text-slate-400 border-slate-700/50 hover:border-slate-500'
                }`}
              >
                {src.replace('_', ' ')}
              </button>
            )
          })}
        </div>
      </div>

      {/* Status chips */}
      <div className="flex flex-col gap-1">
        <label className="text-[10px] text-slate-500 uppercase tracking-wider">Status</label>
        <div className="flex gap-1.5 flex-wrap">
          {STATUSES.map((st) => {
            const active = selectedStatuses.includes(st)
            return (
              <button
                key={st}
                onClick={() => toggleMulti('status', st, searchParams.get('status') ?? 'active')}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors capitalize ${
                  active
                    ? 'bg-slate-200 text-slate-900 border-slate-200'
                    : 'bg-transparent text-slate-400 border-slate-700/50 hover:border-slate-500'
                }`}
              >
                {st}
              </button>
            )
          })}
        </div>
      </div>

      {/* Time range chips */}
      <div className="flex flex-col gap-1">
        <label className="text-[10px] text-slate-500 uppercase tracking-wider">Time Range</label>
        <div className="flex gap-1.5">
          {TIME_RANGES.map((r) => (
            <button
              key={r.value}
              onClick={() => setParam('range', r.value)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                selectedRange === r.value
                  ? 'bg-slate-200 text-slate-900 border-slate-200'
                  : 'bg-transparent text-slate-400 border-slate-700/50 hover:border-slate-500'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Min occurrences */}
      <div className="flex flex-col gap-1">
        <label className="text-[10px] text-slate-500 uppercase tracking-wider">Min occurrences</label>
        <input
          type="number"
          min="1"
          value={minOccurrences}
          onChange={(e) => setParam('min', e.target.value)}
          className="bg-slate-900 border border-slate-700/50 text-slate-200 text-sm rounded-lg px-2.5 py-1.5 w-20 focus:outline-none focus:border-slate-500"
        />
      </div>
    </div>
  )
}
