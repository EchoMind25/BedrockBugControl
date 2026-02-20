import Link from 'next/link'
import type { BccProduct, UptimeCheck, ActiveUserCount } from '@/types'
import { relativeTime } from '@/lib/utils/relativeTime'

interface ProductHealthBarProps {
  products: BccProduct[]
  latestChecks: Record<string, UptimeCheck>
  activeUsers: Record<string, ActiveUserCount>
}

function statusDot(check: UptimeCheck | undefined, hasEndpoint: boolean) {
  if (!hasEndpoint || !check) {
    return { color: 'bg-slate-600', label: 'No endpoint', textColor: 'text-slate-400' }
  }
  if (!check.is_healthy) {
    return { color: 'bg-red-500', label: 'Down', textColor: 'text-red-400' }
  }
  if (check.response_time_ms && check.response_time_ms > 2000) {
    return { color: 'bg-yellow-400', label: 'Degraded', textColor: 'text-yellow-400' }
  }
  return { color: 'bg-emerald-400', label: 'Healthy', textColor: 'text-emerald-400' }
}

export function ProductHealthBar({ products, latestChecks, activeUsers }: ProductHealthBarProps) {
  if (products.length === 0) {
    return (
      <p className="text-slate-500 text-sm">No active products configured.</p>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {products.map((p) => {
        const check = latestChecks[p.id]
        const hasEndpoint = !!p.health_endpoint
        const { color, label, textColor } = statusDot(check, hasEndpoint)
        const users = activeUsers[p.id]

        return (
          <Link
            key={p.id}
            href="/uptime"
            className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 hover:border-slate-600 transition-colors block"
          >
            <div className="flex items-start justify-between mb-2">
              <p className="text-sm font-medium text-slate-200">{p.display_name}</p>
              <span className={`flex items-center gap-1.5 text-xs font-medium ${textColor}`}>
                <span className={`inline-block w-2 h-2 rounded-full ${color}`} />
                {label}
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-500">
              {check && hasEndpoint && (
                <>
                  <span>{relativeTime(check.checked_at)}</span>
                  {check.response_time_ms !== null && (
                    <span>{check.response_time_ms}ms</span>
                  )}
                </>
              )}
              {users && users.active_count > 0 ? (
                <span className="text-slate-400">{users.active_count} active</span>
              ) : (
                <span>0 active</span>
              )}
            </div>
          </Link>
        )
      })}
    </div>
  )
}
