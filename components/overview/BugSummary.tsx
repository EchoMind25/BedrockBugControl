import Link from 'next/link'
import type { BugReport } from '@/types'
import { relativeTime } from '@/lib/utils/relativeTime'

interface BugSummaryProps {
  allBugs: Pick<BugReport, 'severity' | 'status' | 'resolved_at'>[]
  recentNew: Pick<BugReport, 'id' | 'severity' | 'product' | 'description' | 'created_at'>[]
  productNames: Record<string, string>
}

const SEVERITY_BADGE: Record<string, string> = {
  blocker: 'bg-red-900/50 text-red-300 border-red-700/50',
  major: 'bg-yellow-900/50 text-yellow-300 border-yellow-700/50',
  minor: 'bg-slate-700/50 text-slate-400 border-slate-600/50',
}

export function BugSummary({ allBugs, recentNew, productNames }: BugSummaryProps) {
  const open = allBugs.filter((b) => ['new', 'in-progress'].includes(b.status))
  const blockers = open.filter((b) => b.severity === 'blocker').length
  const majors = open.filter((b) => b.severity === 'major').length
  const total = open.length

  return (
    <div>
      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className={`rounded-xl p-4 border ${blockers > 0 ? 'bg-red-950/40 border-red-700/50' : 'bg-slate-800/60 border-slate-700/50'}`}>
          <p className={`text-2xl font-bold ${blockers > 0 ? 'text-red-400' : 'text-slate-200'}`}>{blockers}</p>
          <p className="text-xs text-slate-400 mt-0.5">Blockers</p>
        </div>
        <div className={`rounded-xl p-4 border ${majors > 5 ? 'bg-yellow-950/40 border-yellow-700/50' : 'bg-slate-800/60 border-slate-700/50'}`}>
          <p className={`text-2xl font-bold ${majors > 5 ? 'text-yellow-400' : 'text-slate-200'}`}>{majors}</p>
          <p className="text-xs text-slate-400 mt-0.5">Major</p>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4">
          <p className="text-2xl font-bold text-slate-200">{total}</p>
          <p className="text-xs text-slate-400 mt-0.5">Total Open</p>
        </div>
      </div>

      {/* Recent new bugs */}
      {recentNew.length > 0 ? (
        <div className="space-y-1">
          {recentNew.map((bug) => (
            <Link
              key={bug.id}
              href={`/bugs/${bug.id}`}
              className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-800/60 transition-colors group"
            >
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border uppercase tracking-wide flex-shrink-0 ${SEVERITY_BADGE[bug.severity]}`}>
                {bug.severity}
              </span>
              <span className="text-xs text-slate-500 border border-slate-700/50 bg-slate-800 px-1.5 py-0.5 rounded flex-shrink-0">
                {productNames[bug.product] ?? bug.product}
              </span>
              <span className="text-sm text-slate-300 truncate group-hover:text-slate-100 flex-1 min-w-0">
                {bug.description}
              </span>
              <span className="text-xs text-slate-600 flex-shrink-0">{relativeTime(bug.created_at)}</span>
            </Link>
          ))}
        </div>
      ) : (
        <p className="text-slate-600 text-sm px-1">No new bugs. 🎉</p>
      )}

      <div className="mt-3 pt-3 border-t border-slate-700/50">
        <Link href="/bugs" className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
          View all bugs →
        </Link>
      </div>
    </div>
  )
}
