'use client'

import { useState } from 'react'
import Link from 'next/link'
import { DeployCorrelationChart } from '@/components/deploys/DeployCorrelationChart'
import { relativeTime } from '@/lib/utils/relativeTime'
import type { Deployment, DeployCorrelation, DeployCorrelationBucket } from '@/types'

interface DeployCardProps {
  deployment: Deployment
  productName: string
  repoUrl: string | null
  correlation: DeployCorrelation
}

interface NewError {
  fingerprint: string
  error_message: string
}

interface CorrelationDetail {
  buckets: DeployCorrelationBucket[]
  newErrors: NewError[]
  deployedAt: string
}

const ENV_BADGE: Record<string, string> = {
  production: 'bg-emerald-900/40 text-emerald-400 border-emerald-700/40',
  staging: 'bg-yellow-900/40 text-yellow-400 border-yellow-700/40',
  preview: 'bg-slate-700/40 text-slate-400 border-slate-600/40',
}

const BADGE_STYLES: Record<string, string> = {
  red: 'bg-red-900/30 text-red-400 border-red-700/40',
  green: 'bg-emerald-900/30 text-emerald-400 border-emerald-700/40',
  gray: 'bg-slate-800 text-slate-400 border-slate-700/40',
}

function CorrelationBadge({ correlation }: { correlation: DeployCorrelation }) {
  if (correlation.badge === 'none') return null

  let label: string
  if (correlation.badge === 'red') {
    label = `Errors ↑ ${correlation.pct_change}%`
  } else if (correlation.badge === 'green') {
    label = `Errors ↓ ${correlation.pct_change}%`
  } else {
    label = 'No significant change'
  }

  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${BADGE_STYLES[correlation.badge]}`}>
      {label}
    </span>
  )
}

export function DeployCard({ deployment: d, productName, repoUrl, correlation }: DeployCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [detail, setDetail] = useState<CorrelationDetail | null>(null)
  const [loading, setLoading] = useState(false)

  const shortHash = d.commit_hash?.slice(0, 7)
  const commitUrl = repoUrl && d.commit_hash ? `${repoUrl}/commit/${d.commit_hash}` : null

  async function handleExpand() {
    const next = !expanded
    setExpanded(next)
    if (next && detail === null && !loading) {
      setLoading(true)
      try {
        const res = await fetch(`/api/bcc/deploy-correlation/${d.id}`)
        if (res.ok) {
          const data = await res.json() as CorrelationDetail
          setDetail(data)
        }
      } catch {
        // silent — user can retry
      } finally {
        setLoading(false)
      }
    }
  }

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl">
      {/* Main deploy card */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 flex-wrap mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-slate-400 border border-slate-700/50 bg-slate-800 px-1.5 py-0.5 rounded">
              {productName}
            </span>
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${ENV_BADGE[d.environment] ?? ENV_BADGE.preview}`}>
              {d.environment}
            </span>
            {d.branch && d.branch !== 'main' && (
              <span className="text-[10px] text-slate-500 bg-slate-800 border border-slate-700/50 px-1.5 py-0.5 rounded font-mono">
                {d.branch}
              </span>
            )}
            {/* Correlation badge */}
            <CorrelationBadge correlation={correlation} />
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs text-slate-500">{relativeTime(d.deployed_at)}</span>
            {/* Expand/collapse button for correlation detail */}
            <button
              onClick={handleExpand}
              className="text-[10px] text-slate-500 hover:text-slate-300 border border-slate-700/50 bg-slate-800 hover:bg-slate-700/50 px-1.5 py-0.5 rounded transition-colors"
              title={expanded ? 'Hide detail' : 'Show error correlation detail'}
            >
              {expanded ? '▲' : '▼'}
            </button>
          </div>
        </div>

        {(d.commit_message || d.notes) && (
          <p className="text-sm text-slate-200 mb-2">
            {d.commit_message?.slice(0, 120) ?? d.notes?.slice(0, 120)}
          </p>
        )}

        <div className="flex items-center gap-3 text-xs text-slate-500">
          {shortHash && (
            commitUrl ? (
              <a href={commitUrl} target="_blank" rel="noopener noreferrer" className="font-mono hover:text-slate-300">
                {shortHash}
              </a>
            ) : (
              <span className="font-mono">{shortHash}</span>
            )
          )}
          {d.deployed_by && <span>by {d.deployed_by}</span>}
        </div>

        {d.notes && d.commit_message && (
          <p className="mt-2 text-xs text-slate-500 italic">{d.notes}</p>
        )}
      </div>

      {/* Expanded correlation detail */}
      {expanded && (
        <div className="border-t border-slate-700/50 p-4 space-y-4">
          {loading && (
            <p className="text-xs text-slate-500">Loading error data…</p>
          )}

          {!loading && detail && (
            <>
              {/* Mini chart: ±2h around deploy */}
              <div>
                <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-2">
                  Errors ±2 hours around deploy
                </p>
                <DeployCorrelationChart
                  buckets={detail.buckets}
                  deployedAt={detail.deployedAt}
                />
                <div className="flex items-center gap-2 mt-1">
                  <span className="inline-block w-3 h-0.5 bg-amber-500" />
                  <span className="text-[10px] text-slate-500">deploy time</span>
                </div>
              </div>

              {/* Pre/post summary */}
              {correlation.badge !== 'none' && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-900/50 rounded-lg p-3 text-center">
                    <p className="text-lg font-bold text-slate-300">{correlation.pre_count}</p>
                    <p className="text-[10px] text-slate-500">errors 1h before</p>
                  </div>
                  <div className="bg-slate-900/50 rounded-lg p-3 text-center">
                    <p className={`text-lg font-bold ${correlation.badge === 'red' ? 'text-red-400' : correlation.badge === 'green' ? 'text-emerald-400' : 'text-slate-300'}`}>
                      {correlation.post_count}
                    </p>
                    <p className="text-[10px] text-slate-500">errors 1h after</p>
                  </div>
                </div>
              )}

              {/* New errors introduced by this deploy */}
              {detail.newErrors.length > 0 && (
                <div>
                  <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-2">
                    New errors after this deploy
                  </p>
                  <div className="space-y-1.5">
                    {detail.newErrors.map((err) => (
                      <Link
                        key={err.fingerprint}
                        href={`/errors/${err.fingerprint}`}
                        className="flex items-center gap-2 p-2 bg-red-900/10 border border-red-900/30 rounded-lg hover:bg-red-900/20 transition-colors group"
                      >
                        <span className="text-[10px] text-red-400 flex-shrink-0">NEW</span>
                        <code className="text-xs text-slate-300 group-hover:text-slate-100 truncate flex-1">
                          {err.error_message.slice(0, 80)}
                        </code>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {detail.newErrors.length === 0 && correlation.badge !== 'red' && (
                <p className="text-xs text-slate-500">No new error fingerprints appeared after this deploy.</p>
              )}
            </>
          )}

          {!loading && detail === null && (
            <p className="text-xs text-slate-500">Failed to load correlation data.</p>
          )}
        </div>
      )}
    </div>
  )
}
