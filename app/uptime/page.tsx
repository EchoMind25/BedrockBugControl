import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { UptimeResponseChart } from '@/components/charts/UptimeResponseChart'
import { AutoRefresh } from '@/components/overview/AutoRefresh'
import type { BccProduct, UptimeCheck } from '@/types'
import { relativeTime } from '@/lib/utils/relativeTime'

export const dynamic = 'force-dynamic'

function pct(healthy: bigint | number, total: bigint | number) {
  const h = Number(healthy)
  const t = Number(total)
  if (t === 0) return '—'
  return ((h / t) * 100).toFixed(1) + '%'
}

function pctColor(val: string) {
  if (val === '—') return 'text-slate-500'
  const n = parseFloat(val)
  if (n >= 99) return 'text-emerald-400'
  if (n >= 95) return 'text-yellow-400'
  return 'text-red-400'
}

function statusLabel(check: UptimeCheck | undefined, hasEndpoint: boolean) {
  if (!hasEndpoint) return { text: 'No endpoint configured', color: 'text-slate-500 bg-slate-800 border-slate-700' }
  if (!check) return { text: 'No data', color: 'text-slate-500 bg-slate-800 border-slate-700' }
  if (!check.is_healthy) return { text: 'Down', color: 'text-red-400 bg-red-950/40 border-red-700/50' }
  if (check.response_time_ms && check.response_time_ms > 2000) return { text: 'Degraded', color: 'text-yellow-400 bg-yellow-950/40 border-yellow-700/50' }
  return { text: 'Healthy', color: 'text-emerald-400 bg-emerald-950/30 border-emerald-700/50' }
}

function formatDuration(ms: number) {
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remainMinutes = minutes % 60
  return `${hours}h ${remainMinutes}m`
}

interface Incident {
  start: string
  end: string | null
  duration: number | null
  errorMessage: string | null
}

// Expects checks sorted ASC by checked_at
function computeIncidents(checks: UptimeCheck[]): Incident[] {
  if (checks.length === 0) return []

  const sorted = [...checks].sort(
    (a, b) => new Date(a.checked_at).getTime() - new Date(b.checked_at).getTime()
  )

  const incidents: Incident[] = []
  let inIncident: Incident | null = null

  for (const check of sorted) {
    if (!check.is_healthy) {
      if (!inIncident) {
        inIncident = {
          start: check.checked_at,
          end: null,
          duration: null,
          errorMessage: check.error_message,
        }
      }
    } else {
      if (inIncident) {
        const endMs = new Date(check.checked_at).getTime()
        const startMs = new Date(inIncident.start).getTime()
        inIncident.end = check.checked_at
        inIncident.duration = endMs - startMs
        incidents.unshift(inIncident)
        inIncident = null
      }
    }
  }

  if (inIncident) incidents.unshift(inIncident)
  return incidents
}

interface UptimeStat {
  window_label: string
  total_checks: bigint
  healthy_checks: bigint
}

async function UptimeContent() {
  const supabase = await createClient()

  const { data: products } = await supabase
    .from('bcc_products')
    .select('*')
    .eq('is_active', true)
    .order('display_name')

  const productList: BccProduct[] = (products ?? []) as BccProduct[]
  const productsWithEndpoints = productList.filter((p) => p.health_endpoint)

  if (productsWithEndpoints.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-500 text-sm mb-2">No products with health endpoints configured.</p>
        <p className="text-slate-600 text-xs">Add <code className="font-mono">health_endpoint</code> to your products in Supabase.</p>
      </div>
    )
  }

  // Per product: RPC for uptime stats + bounded recent checks for chart & incidents
  const window30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const results = await Promise.all(
    productsWithEndpoints.map((p) =>
      Promise.all([
        // Uptime % via RPC — no raw row scan needed
        supabase.rpc('get_uptime_stats', { p_product: p.id }),
        // Last 500 checks from 30d window for chart + incidents
        supabase
          .from('uptime_checks')
          .select('*')
          .eq('product', p.id)
          .gte('checked_at', window30d)
          .order('checked_at', { ascending: false })
          .limit(500),
      ])
    )
  )

  return (
    <div className="space-y-8">
      <AutoRefresh intervalMs={60_000} />
      {productsWithEndpoints.map((p, idx) => {
        const [statsResult, checksResult] = results[idx]
        const statsRows: UptimeStat[] = (statsResult.data ?? []) as UptimeStat[]
        const allChecks: UptimeCheck[] = (checksResult.data ?? []) as UptimeCheck[]
        const latestCheck = allChecks[0]

        const statByWindow = (label: string) =>
          statsRows.find((s) => s.window_label === label)

        const s24h = statByWindow('24h')
        const s7d = statByWindow('7d')
        const s30d = statByWindow('30d')

        const uptime24h = s24h ? pct(s24h.healthy_checks, s24h.total_checks) : '—'
        const uptime7d = s7d ? pct(s7d.healthy_checks, s7d.total_checks) : '—'
        const uptime30d = s30d ? pct(s30d.healthy_checks, s30d.total_checks) : '—'

        // Chart: last 24h only (max 288 points = every 5min for 24h)
        const cutoff24h = Date.now() - 24 * 60 * 60 * 1000
        const chartChecks = allChecks
          .filter((c) => new Date(c.checked_at).getTime() > cutoff24h)
          .slice(0, 288)

        const incidents = computeIncidents(allChecks)
        const { text: statusText, color: statusColor } = statusLabel(latestCheck, true)

        return (
          <section key={p.id} className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
            {/* Status header */}
            <div className="px-5 py-4 border-b border-slate-700/50">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-100">{p.display_name}</h2>
                  <p className="text-xs text-slate-500 mt-0.5 font-mono">{p.health_endpoint}</p>
                </div>
                <div className="flex items-center gap-4">
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${statusColor}`}>
                    {statusText}
                  </span>
                  {latestCheck && (
                    <div className="text-right text-xs text-slate-500">
                      <div>{latestCheck.response_time_ms !== null ? `${latestCheck.response_time_ms}ms` : '—'}</div>
                      <div>{relativeTime(latestCheck.checked_at)}</div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="p-5">
              {/* Uptime percentages */}
              <div className="grid grid-cols-3 gap-4 mb-5">
                {[
                  { label: '24-hour uptime', val: uptime24h },
                  { label: '7-day uptime', val: uptime7d },
                  { label: '30-day uptime', val: uptime30d },
                ].map(({ label, val }) => (
                  <div key={label}>
                    <p className={`text-xl font-bold ${pctColor(val)}`}>{val}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{label}</p>
                  </div>
                ))}
              </div>

              {/* Response time chart */}
              <div className="mb-5">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">
                  Response Time — Last 24h
                </p>
                <UptimeResponseChart checks={chartChecks} />
              </div>

              {/* Incident log */}
              {incidents.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">
                    Incident Log
                  </p>
                  <div className="space-y-2">
                    {incidents.slice(0, 10).map((incident, i) => (
                      <div key={i} className="flex items-start gap-3 text-xs py-2 border-b border-slate-700/30 last:border-0">
                        <div className={`w-2 h-2 rounded-full mt-0.5 flex-shrink-0 ${incident.end ? 'bg-yellow-500' : 'bg-red-500'}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-slate-300">{new Date(incident.start).toLocaleString()}</span>
                            {!incident.end && (
                              <span className="text-red-400 font-medium">Ongoing</span>
                            )}
                            {incident.duration && (
                              <span className="text-slate-500">→ {formatDuration(incident.duration)}</span>
                            )}
                          </div>
                          {incident.errorMessage && (
                            <p className="text-slate-600 mt-0.5 truncate">{incident.errorMessage}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        )
      })}
    </div>
  )
}

export default function UptimePage() {
  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-100">Uptime</h1>
        <p className="text-sm text-slate-400 mt-0.5">Health endpoint monitoring — checked every 5 minutes</p>
      </div>
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-20">
            <div className="text-slate-500 text-sm">Loading uptime data…</div>
          </div>
        }
      >
        <UptimeContent />
      </Suspense>
    </div>
  )
}
