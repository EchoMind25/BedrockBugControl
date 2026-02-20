import Link from 'next/link'
import type { Deployment } from '@/types'
import { relativeTime } from '@/lib/utils/relativeTime'

interface RecentDeploymentsProps {
  deployments: Deployment[]
  productNames: Record<string, string>
  repoUrls: Record<string, string | null>
}

const ENV_BADGE: Record<string, string> = {
  production: 'bg-emerald-900/40 text-emerald-400 border-emerald-700/40',
  staging: 'bg-yellow-900/40 text-yellow-400 border-yellow-700/40',
  preview: 'bg-slate-700/40 text-slate-400 border-slate-600/40',
}

export function RecentDeployments({ deployments, productNames, repoUrls }: RecentDeploymentsProps) {
  if (deployments.length === 0) {
    return (
      <div>
        <p className="text-slate-600 text-sm">No deployments logged yet.</p>
        <div className="mt-3 pt-3 border-t border-slate-700/50">
          <Link href="/deploys" className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
            View all deploys →
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="space-y-2">
        {deployments.map((d) => {
          const repoUrl = repoUrls[d.product]
          const shortHash = d.commit_hash?.slice(0, 7)
          const commitUrl = repoUrl && shortHash ? `${repoUrl}/commit/${d.commit_hash}` : null

          return (
            <div key={d.id} className="flex items-start gap-2 py-2 px-1">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <span className="text-xs text-slate-500 border border-slate-700/50 bg-slate-800 px-1.5 py-0.5 rounded">
                    {productNames[d.product] ?? d.product}
                  </span>
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${ENV_BADGE[d.environment] ?? ENV_BADGE.preview}`}>
                    {d.environment}
                  </span>
                  {d.branch && d.branch !== 'main' && (
                    <span className="text-[10px] text-slate-500 bg-slate-800 border border-slate-700/50 px-1.5 py-0.5 rounded font-mono">
                      {d.branch}
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-300 truncate">
                  {d.commit_message?.slice(0, 60) ?? d.notes?.slice(0, 60) ?? 'No message'}
                </p>
                <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-600">
                  {shortHash && (
                    commitUrl ? (
                      <a href={commitUrl} target="_blank" rel="noopener noreferrer" className="font-mono hover:text-slate-400">
                        {shortHash}
                      </a>
                    ) : (
                      <span className="font-mono">{shortHash}</span>
                    )
                  )}
                  {d.deployed_by && <span>by {d.deployed_by}</span>}
                </div>
              </div>
              <span className="text-xs text-slate-600 flex-shrink-0">{relativeTime(d.deployed_at)}</span>
            </div>
          )
        })}
      </div>
      <div className="mt-3 pt-3 border-t border-slate-700/50">
        <Link href="/deploys" className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
          View all deploys →
        </Link>
      </div>
    </div>
  )
}
