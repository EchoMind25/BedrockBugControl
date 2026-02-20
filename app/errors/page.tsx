import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { ErrorFilters } from '@/components/errors/ErrorFilters'
import { RefreshErrorGroups } from '@/components/errors/RefreshErrorGroups'
import { ErrorTableWithBulk } from '@/components/errors/ErrorTableWithBulk'
import type { BccProduct, ErrorGroup, ErrorGroupStatusRow, DailyCount } from '@/types'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

async function ErrorsContent({ searchParams }: PageProps) {
  const params = await searchParams
  const supabase = await createClient()

  const { data: products } = await supabase
    .from('bcc_products')
    .select('*')
    .eq('is_active', true)
    .order('display_name')

  const productList: BccProduct[] = (products ?? []) as BccProduct[]
  const productNames: Record<string, string> = {}
  for (const p of productList) productNames[p.id] = p.display_name

  // Build filters
  const productFilter = typeof params.product === 'string' ? params.product : null
  const sourceFilter = typeof params.source === 'string' ? params.source.split(',').filter(Boolean) : []
  const statusFilter = typeof params.status === 'string' ? params.status.split(',').filter(Boolean) : ['active']
  const range = typeof params.range === 'string' ? params.range : '7d'
  const minOccurrences = typeof params.min === 'string' ? parseInt(params.min) || 1 : 1

  const rangeInterval = range === '24h' ? 1 : range === '30d' ? 30 : 7

  // Fetch error groups (materialized view)
  let groupsQuery = supabase.from('error_groups').select('*')
  if (productFilter && productFilter !== 'all') {
    groupsQuery = groupsQuery.eq('product', productFilter)
  }
  if (sourceFilter.length > 0) {
    groupsQuery = groupsQuery.in('source', sourceFilter)
  }
  groupsQuery = groupsQuery
    .gte('last_seen', new Date(Date.now() - rangeInterval * 24 * 60 * 60 * 1000).toISOString())
    .order('last_seen', { ascending: false })

  const { data: groups } = await groupsQuery
  let errorGroups: ErrorGroup[] = (groups ?? []) as ErrorGroup[]

  // Apply min occurrences filter
  if (minOccurrences > 1) {
    errorGroups = errorGroups.filter((g) => g.occurrence_count >= minOccurrences)
  }

  // Fetch status overrides for all groups
  const fingerprints = errorGroups.map((g) => g.fingerprint)
  let statusMap: Record<string, ErrorGroupStatusRow> = {}
  if (fingerprints.length > 0) {
    const { data: statusRows } = await supabase
      .from('error_group_status')
      .select('*')
      .in('fingerprint', fingerprints)
    for (const row of (statusRows ?? []) as ErrorGroupStatusRow[]) {
      statusMap[row.fingerprint] = row
    }
  }

  // Filter by status (from error_group_status, default 'active')
  if (statusFilter.length > 0) {
    errorGroups = errorGroups.filter((g) => {
      const s = statusMap[g.fingerprint]?.status ?? 'active'
      return statusFilter.includes(s)
    })
  }

  // Stats
  const total24hOccurrences = errorGroups.reduce((sum, g) => sum + g.occurrences_24h, 0)
  const totalAffectedUsers = errorGroups.reduce((sum, g) => sum + g.affected_users, 0)

  // Sparkline data per fingerprint (last 7 days, batched per-group from auto_errors)
  // Only fetch if groups are <= 50 to avoid performance issues
  const sparklineMap: Record<string, DailyCount[]> = {}
  if (errorGroups.length <= 50 && errorGroups.length > 0) {
    const fps = errorGroups.map((g) => g.fingerprint)
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data: sparkRaw } = await supabase
      .from('auto_errors')
      .select('fingerprint, created_at')
      .in('fingerprint', fps)
      .gte('created_at', since)

    for (const row of sparkRaw ?? []) {
      const day = (row.created_at as string).slice(0, 10)
      if (!sparklineMap[row.fingerprint]) sparklineMap[row.fingerprint] = []
      const existing = sparklineMap[row.fingerprint].find((d) => d.day === day)
      if (existing) existing.count++
      else sparklineMap[row.fingerprint].push({ day, count: 1 })
    }
  }

  return (
    <>
      {/* Filters */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 mb-4">
        <Suspense fallback={null}>
          <ErrorFilters products={productList} />
        </Suspense>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-3 text-center">
          <p className="text-xl font-bold text-slate-200">{errorGroups.length}</p>
          <p className="text-xs text-slate-500 mt-0.5">Unique error groups</p>
        </div>
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-3 text-center">
          <p className="text-xl font-bold text-slate-200">{total24hOccurrences}</p>
          <p className="text-xs text-slate-500 mt-0.5">Occurrences (24h)</p>
        </div>
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-3 text-center">
          <p className="text-xl font-bold text-slate-200">{totalAffectedUsers}</p>
          <p className="text-xs text-slate-500 mt-0.5">Affected users</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700/50 flex items-center justify-between">
          <h2 className="text-sm font-medium text-slate-300">
            Error Groups
            <span className="ml-2 text-xs text-slate-500">{errorGroups.length} result{errorGroups.length !== 1 ? 's' : ''}</span>
          </h2>
          <div className="flex items-center gap-2">
            <a
              href="/api/bcc/export/errors?format=csv"
              className="text-xs text-slate-400 hover:text-slate-200 border border-slate-700/50 bg-slate-800 hover:bg-slate-700 px-2.5 py-1 rounded-lg transition-colors"
            >
              Export CSV
            </a>
            <RefreshErrorGroups />
          </div>
        </div>

        <ErrorTableWithBulk
          errorGroups={errorGroups}
          statusMap={statusMap}
          sparklineMap={sparklineMap}
          productNames={productNames}
        />
      </div>
    </>
  )
}

export default function ErrorsPage(props: PageProps) {
  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-100">Errors</h1>
        <p className="text-sm text-slate-400 mt-0.5">Grouped automated error captures across all products</p>
      </div>
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-20">
            <div className="text-slate-500 text-sm">Loading errors…</div>
          </div>
        }
      >
        <ErrorsContent {...props} />
      </Suspense>
    </div>
  )
}
