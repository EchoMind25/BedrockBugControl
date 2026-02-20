'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'
import type { BccProduct } from '@/types'

type StatusValue = 'new' | 'in-progress' | 'resolved' | 'wont-fix' | 'duplicate'
type SeverityValue = 'blocker' | 'major' | 'minor'

const STATUSES: { value: StatusValue; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'in-progress', label: 'In Progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'wont-fix', label: "Won't Fix" },
  { value: 'duplicate', label: 'Duplicate' },
]

const SEVERITIES: { value: SeverityValue; label: string; color: string }[] = [
  { value: 'blocker', label: 'Blocker', color: 'text-red-400 border-red-500/40 bg-red-500/10' },
  { value: 'major', label: 'Major', color: 'text-yellow-400 border-yellow-500/40 bg-yellow-500/10' },
  { value: 'minor', label: 'Minor', color: 'text-blue-400 border-blue-500/40 bg-blue-500/10' },
]

interface BugFiltersProps {
  products: BccProduct[]
}

export function BugFilters({ products }: BugFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) {
        params.set(key, value)
      } else {
        params.delete(key)
      }
      router.push(`/bugs?${params.toString()}`)
    },
    [router, searchParams]
  )

  const toggleMulti = useCallback(
    (key: string, value: string, current: string[]) => {
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value]
      updateParam(key, next.join(','))
    },
    [updateParam]
  )

  const product = searchParams.get('product') ?? 'all'
  const sort = searchParams.get('sort') ?? 'newest'
  const statusParam = searchParams.get('status') ?? 'new,in-progress'
  const severityParam = searchParams.get('severity') ?? 'blocker,major,minor'
  const selectedStatuses = statusParam ? statusParam.split(',') : []
  const selectedSeverities = severityParam ? severityParam.split(',') : []

  return (
    <div className="space-y-3">
      {/* Row 1: Product + Sort */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400 whitespace-nowrap">Product</label>
          <select
            value={product}
            onChange={(e) => updateParam('product', e.target.value === 'all' ? '' : e.target.value)}
            className="bg-slate-800 border border-slate-600 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
          >
            <option value="all">All Products</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <label className="text-xs text-slate-400">Sort</label>
          <select
            value={sort}
            onChange={(e) => updateParam('sort', e.target.value)}
            className="bg-slate-800 border border-slate-600 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="severity">Severity High→Low</option>
          </select>
        </div>
      </div>

      {/* Row 2: Status chips */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-400">Status</span>
        {STATUSES.map(({ value, label }) => {
          const active = selectedStatuses.includes(value)
          return (
            <button
              key={value}
              onClick={() => toggleMulti('status', value, selectedStatuses)}
              className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                active
                  ? 'bg-slate-600 border-slate-500 text-slate-100'
                  : 'bg-transparent border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-300'
              }`}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* Row 3: Severity chips */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-400">Severity</span>
        {SEVERITIES.map(({ value, label, color }) => {
          const active = selectedSeverities.includes(value)
          return (
            <button
              key={value}
              onClick={() => toggleMulti('severity', value, selectedSeverities)}
              className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                active ? color : 'bg-transparent border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-300'
              }`}
            >
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
