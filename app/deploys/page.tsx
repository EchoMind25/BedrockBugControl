import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { ManualDeployForm } from '@/components/deploys/ManualDeployForm'
import { DeployFilters } from '@/components/deploys/DeployFilters'
import { DeployCard } from '@/components/deploys/DeployCard'
import { AutoRefresh } from '@/components/overview/AutoRefresh'
import type { BccProduct, Deployment, DeployCorrelation } from '@/types'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

async function DeploysContent({ searchParams }: PageProps) {
  const params = await searchParams
  const supabase = await createClient()

  const { data: products } = await supabase
    .from('bcc_products')
    .select('*')
    .eq('is_active', true)
    .order('display_name')

  const productList: BccProduct[] = (products ?? []) as BccProduct[]
  const productNames: Record<string, string> = {}
  const repoUrls: Record<string, string | null> = {}
  for (const p of productList) {
    productNames[p.id] = p.display_name
    repoUrls[p.id] = p.repo_url
  }

  const productFilter = typeof params.product === 'string' && params.product !== 'all' ? params.product : null
  const envFilter = typeof params.env === 'string' ? params.env.split(',').filter(Boolean) : []
  const dateRange = typeof params.range === 'string' ? params.range : '30d'
  const rangeDays = dateRange === '7d' ? 7 : dateRange === '90d' ? 90 : 30

  let query = supabase
    .from('deployments')
    .select('*')
    .gte('deployed_at', new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000).toISOString())
    .order('deployed_at', { ascending: false })

  if (productFilter) query = query.eq('product', productFilter)
  if (envFilter.length > 0) query = query.in('environment', envFilter)

  const { data: deployments } = await query
  const deployList: Deployment[] = (deployments ?? []) as Deployment[]

  // ── Deploy ↔ Error Correlation (Phase 3) ─────────────────
  // Single batched query covers all deploys: find the min/max time window
  // and fetch all errors in that range. Compute pre/post counts in JS.
  const correlationMap: Record<string, DeployCorrelation> = {}

  if (deployList.length > 0) {
    const deployTimes = deployList.map((d) => new Date(d.deployed_at).getTime())
    const minMs = Math.min(...deployTimes)
    const maxMs = Math.max(...deployTimes)

    const windowStart = new Date(minMs - 60 * 60 * 1000).toISOString()
    const windowEnd = new Date(maxMs + 60 * 60 * 1000).toISOString()
    const deployProducts = [...new Set(deployList.map((d) => d.product))]

    let errQuery = supabase
      .from('auto_errors')
      .select('product, created_at')
      .in('product', deployProducts)
      .gte('created_at', windowStart)
      .lte('created_at', windowEnd)

    const { data: rawErrors } = await errQuery
    const errorEvents = (rawErrors ?? []) as { product: string; created_at: string }[]

    for (const d of deployList) {
      const deployMs = new Date(d.deployed_at).getTime()
      const preStart = deployMs - 60 * 60 * 1000
      const postEnd = deployMs + 60 * 60 * 1000

      const pre = errorEvents.filter(
        (e) =>
          e.product === d.product &&
          new Date(e.created_at).getTime() >= preStart &&
          new Date(e.created_at).getTime() < deployMs
      ).length

      const post = errorEvents.filter(
        (e) =>
          e.product === d.product &&
          new Date(e.created_at).getTime() >= deployMs &&
          new Date(e.created_at).getTime() < postEnd
      ).length

      if (pre === 0 && post === 0) {
        correlationMap[d.id] = { pre_count: 0, post_count: 0, badge: 'none', pct_change: 0 }
      } else if (post > pre * 2) {
        const pct = pre > 0 ? Math.round(((post - pre) / pre) * 100) : 100
        correlationMap[d.id] = { pre_count: pre, post_count: post, badge: 'red', pct_change: pct }
      } else if (pre > 0 && post < pre * 0.5) {
        const pct = Math.round(((pre - post) / pre) * 100)
        correlationMap[d.id] = { pre_count: pre, post_count: post, badge: 'green', pct_change: pct }
      } else {
        correlationMap[d.id] = { pre_count: pre, post_count: post, badge: 'gray', pct_change: 0 }
      }
    }
  }

  return (
    <>
      <AutoRefresh intervalMs={60_000} />
      {/* Filters + form */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <Suspense fallback={null}>
          <DeployFilters
            products={productList}
            selectedProduct={productFilter}
            selectedRange={dateRange}
            selectedEnvs={envFilter}
          />
        </Suspense>
        <ManualDeployForm products={productList} />
      </div>

      {/* Timeline */}
      {deployList.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-slate-600 text-sm">No deployments in this time range.</p>
          <p className="text-slate-700 text-xs mt-1">Deploys are logged automatically via the Vercel webhook or manually above.</p>
        </div>
      ) : (
        <div className="relative">
          {/* Vertical timeline line */}
          <div className="absolute left-4 top-0 bottom-0 w-px bg-slate-700/50" />

          <div className="space-y-4 pl-10">
            {deployList.map((d) => {
              const correlation = correlationMap[d.id] ?? { pre_count: 0, post_count: 0, badge: 'none' as const, pct_change: 0 }

              return (
                <div key={d.id} className="relative">
                  {/* Timeline dot — red if deploy caused error spike */}
                  <div className={`absolute -left-[1.6rem] top-4 w-2.5 h-2.5 rounded-full border-2 border-slate-900 ${
                    correlation.badge === 'red' ? 'bg-red-500' : 'bg-slate-600'
                  }`} />

                  <DeployCard
                    deployment={d}
                    productName={productNames[d.product] ?? d.product}
                    repoUrl={repoUrls[d.product] ?? null}
                    correlation={correlation}
                  />
                </div>
              )
            })}
          </div>
        </div>
      )}
    </>
  )
}

export default function DeploysPage(props: PageProps) {
  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-100">Deployments</h1>
        <p className="text-sm text-slate-400 mt-0.5">
          Deployment history with error correlation — red dot = errors spiked after deploy
        </p>
      </div>
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-20">
            <div className="text-slate-500 text-sm">Loading deployments…</div>
          </div>
        }
      >
        <DeploysContent {...props} />
      </Suspense>
    </div>
  )
}
