import { Suspense } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { ProductHealthBar } from '@/components/overview/ProductHealthBar'
import { BugSummary } from '@/components/overview/BugSummary'
import { RecentDeployments } from '@/components/overview/RecentDeployments'
import { ErrorTrendChart } from '@/components/charts/ErrorTrendChart'
import { ActiveUsersChart } from '@/components/charts/ActiveUsersChart'
import { AutoRefresh } from '@/components/overview/AutoRefresh'
import { SpikeAlertBanner } from '@/components/overview/SpikeAlertBanner'
import type {
  BccProduct,
  UptimeCheck,
  ActiveUserCount,
  BugReport,
  Deployment,
  ErrorGroup,
  ErrorTrendPoint,
  SpikeAlert,
} from '@/types'

export const dynamic = 'force-dynamic'

async function OverviewContent() {
  const supabase = await createClient()

  // Parallel data fetch
  const [
    productsResult,
    latestUptimeResult,
    activeUsersResult,
    allBugsResult,
    recentBugsResult,
    errorTrendResult,
    topErrorsResult,
    deploymentsResult,
    spikeAlertsResult,
  ] = await Promise.all([
    supabase.from('bcc_products').select('*').eq('is_active', true).order('display_name'),

    // Latest uptime check per product (last 24h)
    supabase
      .from('uptime_checks')
      .select('*')
      .order('checked_at', { ascending: false })
      .limit(50),

    supabase.from('active_user_counts').select('*'),

    // Bug stats (all bugs)
    supabase.from('bug_reports').select('severity, status, resolved_at'),

    // 5 most recent new bugs
    supabase
      .from('bug_reports')
      .select('id, severity, product, description, created_at')
      .eq('status', 'new')
      .order('created_at', { ascending: false })
      .limit(5),

    // Error trend: last 14 days by product
    supabase.rpc('get_error_trend_14d').select('*'),

    // Top 3 errors in last 24h
    supabase
      .from('error_groups')
      .select('*')
      .order('occurrences_24h', { ascending: false })
      .limit(3),

    // Recent deployments
    supabase
      .from('deployments')
      .select('*')
      .order('deployed_at', { ascending: false })
      .limit(5),

    // Unacknowledged spike alerts (Phase 3)
    supabase
      .from('error_spike_alerts')
      .select('*')
      .eq('acknowledged', false)
      .order('alerted_at', { ascending: false })
      .limit(5),
  ])

  const products: BccProduct[] = (productsResult.data ?? []) as BccProduct[]
  const allUptimeChecks: UptimeCheck[] = (latestUptimeResult.data ?? []) as UptimeCheck[]
  const activeUserRows: ActiveUserCount[] = (activeUsersResult.data ?? []) as ActiveUserCount[]
  const allBugs = (allBugsResult.data ?? []) as Pick<BugReport, 'severity' | 'status' | 'resolved_at'>[]
  const recentBugs = (recentBugsResult.data ?? []) as Pick<BugReport, 'id' | 'severity' | 'product' | 'description' | 'created_at'>[]
  const topErrors: ErrorGroup[] = (topErrorsResult.data ?? []) as ErrorGroup[]
  const deployments: Deployment[] = (deploymentsResult.data ?? []) as Deployment[]
  const spikeAlerts: SpikeAlert[] = (spikeAlertsResult.data ?? []) as SpikeAlert[]

  // Build lookup maps
  const productNames: Record<string, string> = {}
  const repoUrls: Record<string, string | null> = {}
  for (const p of products) {
    productNames[p.id] = p.display_name
    repoUrls[p.id] = p.repo_url
  }

  // Latest uptime check per product
  const latestChecks: Record<string, UptimeCheck> = {}
  for (const check of allUptimeChecks) {
    if (!latestChecks[check.product]) {
      latestChecks[check.product] = check
    }
  }

  // Active users map
  const activeUsers: Record<string, ActiveUserCount> = {}
  for (const row of activeUserRows) {
    activeUsers[row.product] = row
  }

  // Error trend chart data
  // Fall back to a direct query if the RPC doesn't exist yet
  let errorTrendData: ErrorTrendPoint[] = []
  let trendProducts: string[] = []

  if (!errorTrendResult.error && errorTrendResult.data) {
    // If RPC works, use it
    const raw = errorTrendResult.data as { day: string; product: string; count: number }[]
    const dayMap: Record<string, ErrorTrendPoint> = {}
    const productSet = new Set<string>()
    for (const row of raw) {
      if (!dayMap[row.day]) dayMap[row.day] = { day: row.day }
      dayMap[row.day][row.product] = row.count
      productSet.add(row.product)
    }
    errorTrendData = Object.values(dayMap).sort((a, b) => a.day.localeCompare(b.day as string))
    trendProducts = Array.from(productSet)
  } else {
    // Fallback: direct auto_errors query
    const { data: rawErrors } = await supabase
      .from('auto_errors')
      .select('created_at, product')
      .gte('created_at', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())

    if (rawErrors) {
      const dayMap: Record<string, ErrorTrendPoint> = {}
      const productSet = new Set<string>()
      for (const row of rawErrors) {
        const day = row.created_at.slice(0, 10)
        if (!dayMap[day]) dayMap[day] = { day }
        dayMap[day][row.product] = ((dayMap[day][row.product] as number) ?? 0) + 1
        productSet.add(row.product)
      }
      errorTrendData = Object.values(dayMap).sort((a, b) => a.day.localeCompare(b.day as string))
      trendProducts = Array.from(productSet)
    }
  }

  const productNamesAll = [...new Set([...products.map((p) => p.id), ...trendProducts])]
  const trendProductList = trendProducts.length > 0 ? trendProducts : productNamesAll

  return (
    <>
      {/* Auto-refresh every 60 seconds */}
      <AutoRefresh intervalMs={60_000} />

      {/* Spike alert banners (Phase 3) */}
      {spikeAlerts.length > 0 && (
        <SpikeAlertBanner alerts={spikeAlerts} productNames={productNames} />
      )}

      {/* Section 1: Product Health Bar */}
      <section className="mb-6">
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">
          Product Health
        </h2>
        <ProductHealthBar
          products={products}
          latestChecks={latestChecks}
          activeUsers={activeUsers}
        />
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Section 2: Open Bug Summary */}
        <section className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">
            Open Bugs
          </h2>
          <BugSummary
            allBugs={allBugs}
            recentNew={recentBugs}
            productNames={productNames}
          />
        </section>

        {/* Section 4: Recent Deployments */}
        <section className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">
            Recent Deployments
          </h2>
          <RecentDeployments
            deployments={deployments}
            productNames={productNames}
            repoUrls={repoUrls}
          />
        </section>
      </div>

      {/* Section 3: Error Trend Chart */}
      <section className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
            Error Trend — Last 14 Days
          </h2>
          <Link href="/errors" className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
            View all →
          </Link>
        </div>
        <ErrorTrendChart data={errorTrendData} products={trendProductList} />

        {topErrors.length > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-700/50">
            <p className="text-xs text-slate-500 uppercase tracking-widest mb-2">Top Errors (24h)</p>
            <div className="space-y-1.5">
              {topErrors.map((err) => (
                <Link
                  key={`${err.fingerprint}-${err.product}`}
                  href={`/errors/${err.fingerprint}`}
                  className="flex items-center gap-3 py-1.5 px-2 rounded-lg hover:bg-slate-700/30 transition-colors group"
                >
                  <span className="font-mono text-xs text-slate-300 truncate flex-1 min-w-0 group-hover:text-slate-100">
                    {err.error_message.slice(0, 80)}
                  </span>
                  <span className="text-xs text-slate-500 border border-slate-700/50 bg-slate-800 px-1.5 py-0.5 rounded flex-shrink-0">
                    {productNames[err.product] ?? err.product}
                  </span>
                  <span className="text-xs font-medium text-slate-400 flex-shrink-0">{err.occurrences_24h}x</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Section 5: Active Users by Product */}
      <section className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">
          Active Users Right Now
        </h2>
        <ActiveUsersChart data={activeUserRows} productNames={productNames} />
      </section>
    </>
  )
}

export default function OverviewPage() {
  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-100">Command Center</h1>
        <p className="text-sm text-slate-400 mt-0.5">
          All signals in one view — health, bugs, errors, deploys, users
        </p>
      </div>

      <Suspense
        fallback={
          <div className="flex items-center justify-center py-20">
            <div className="text-slate-500 text-sm">Loading overview…</div>
          </div>
        }
      >
        <OverviewContent />
      </Suspense>
    </div>
  )
}
