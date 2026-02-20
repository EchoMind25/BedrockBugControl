import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { BugStats } from '@/components/bugs/BugStats'
import { BugFilters } from '@/components/bugs/BugFilters'
import { BugTableWithBulk } from '@/components/bugs/BugTableWithBulk'
import type { BugReport, BccProduct } from '@/types'

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

async function BugListContent({ searchParams }: PageProps) {
  const params = await searchParams
  const supabase = await createClient()

  // Fetch products for filter dropdown
  const { data: products } = await supabase
    .from('bcc_products')
    .select('*')
    .eq('is_active', true)
    .order('display_name')

  // Build query
  let query = supabase
    .from('bug_reports')
    .select('*')

  // Product filter
  const productFilter = typeof params.product === 'string' ? params.product : null
  if (productFilter && productFilter !== 'all') {
    query = query.eq('product', productFilter)
  }

  // Status filter (default: new + in-progress)
  const statusParam = typeof params.status === 'string' ? params.status : 'new,in-progress'
  const statuses = statusParam.split(',').filter(Boolean)
  if (statuses.length > 0) {
    query = query.in('status', statuses)
  }

  // Severity filter (default: all)
  const severityParam = typeof params.severity === 'string' ? params.severity : 'blocker,major,minor'
  const severities = severityParam.split(',').filter(Boolean)
  if (severities.length > 0) {
    query = query.in('severity', severities)
  }

  // Sort
  const sort = typeof params.sort === 'string' ? params.sort : 'newest'
  if (sort === 'oldest') {
    query = query.order('created_at', { ascending: true })
  } else if (sort === 'severity') {
    // Custom severity order: blocker > major > minor
    // Supabase doesn't support custom enum ordering directly; sort client-side below
    query = query.order('created_at', { ascending: false })
  } else {
    query = query.order('created_at', { ascending: false })
  }

  const { data: bugs } = await query

  // Client-side severity sort
  let sortedBugs: BugReport[] = (bugs ?? []) as BugReport[]
  if (sort === 'severity') {
    const severityRank: Record<string, number> = { blocker: 0, major: 1, minor: 2 }
    sortedBugs = [...sortedBugs].sort(
      (a, b) => (severityRank[a.severity] ?? 3) - (severityRank[b.severity] ?? 3)
    )
  }

  // Stats use ALL bugs (unfiltered, except we need them too)
  // For accurate stats, fetch a separate all-bugs count
  const { data: allBugs } = await supabase.from('bug_reports').select('severity, status, resolved_at')

  return (
    <div>
      <BugStats bugs={(allBugs ?? []) as unknown as BugReport[]} />

      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 mb-4">
        <Suspense fallback={<div className="text-slate-500 text-sm">Loading filters…</div>}>
          <BugFilters products={(products ?? []) as BccProduct[]} />
        </Suspense>
      </div>

      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700/50 flex items-center justify-between">
          <h2 className="text-sm font-medium text-slate-300">
            Bug Reports
          </h2>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500">{sortedBugs.length} result{sortedBugs.length !== 1 ? 's' : ''}</span>
            <a
              href={`/api/bcc/export/bugs?format=csv`}
              className="text-xs text-slate-400 hover:text-slate-200 border border-slate-700/50 bg-slate-800 hover:bg-slate-700 px-2.5 py-1 rounded-lg transition-colors"
            >
              Export CSV
            </a>
          </div>
        </div>
        <BugTableWithBulk bugs={sortedBugs} />
      </div>
    </div>
  )
}

export default function BugsPage(props: PageProps) {
  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-100">Bug Reports</h1>
        <p className="text-sm text-slate-400 mt-0.5">Triage and track bugs across all Bedrock AI products</p>
      </div>

      <Suspense
        fallback={
          <div className="flex items-center justify-center py-20">
            <div className="text-slate-500 text-sm">Loading…</div>
          </div>
        }
      >
        <BugListContent {...props} />
      </Suspense>
    </div>
  )
}
