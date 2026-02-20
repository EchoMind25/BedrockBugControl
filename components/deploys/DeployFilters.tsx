'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import type { BccProduct } from '@/types'

interface DeployFiltersProps {
  products: BccProduct[]
  selectedProduct: string | null
  selectedRange: string
  selectedEnvs: string[]
}

const DATE_RANGES = [
  { label: '7 days', value: '7d' },
  { label: '30 days', value: '30d' },
  { label: '90 days', value: '90d' },
]

const ENVIRONMENTS = [
  { label: 'Production', value: 'production' },
  { label: 'Staging', value: 'staging' },
  { label: 'Preview', value: 'preview' },
]

export function DeployFilters({ products, selectedProduct, selectedRange, selectedEnvs }: DeployFiltersProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    router.push(`${pathname}?${params.toString()}`)
  }

  function toggleEnv(env: string) {
    const params = new URLSearchParams(searchParams.toString())
    const current = params.get('env')?.split(',').filter(Boolean) ?? []
    const next = current.includes(env)
      ? current.filter((e) => e !== env)
      : [...current, env]
    if (next.length > 0) params.set('env', next.join(','))
    else params.delete('env')
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="flex flex-wrap gap-4 items-start">
      <div className="flex flex-col gap-1">
        <label className="text-[10px] text-slate-500 uppercase tracking-wider">Product</label>
        <select
          value={selectedProduct ?? 'all'}
          onChange={(e) => setParam('product', e.target.value === 'all' ? '' : e.target.value)}
          className="bg-slate-900 border border-slate-700/50 text-slate-200 text-sm rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-slate-500"
        >
          <option value="all">All products</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>{p.display_name}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[10px] text-slate-500 uppercase tracking-wider">Environment</label>
        <div className="flex gap-1.5">
          {ENVIRONMENTS.map((e) => {
            const active = selectedEnvs.includes(e.value)
            return (
              <button
                key={e.value}
                onClick={() => toggleEnv(e.value)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  active
                    ? 'bg-slate-200 text-slate-900 border-slate-200'
                    : 'bg-transparent text-slate-400 border-slate-700/50 hover:border-slate-500'
                }`}
              >
                {e.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[10px] text-slate-500 uppercase tracking-wider">Date range</label>
        <div className="flex gap-1.5">
          {DATE_RANGES.map((r) => (
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
    </div>
  )
}
