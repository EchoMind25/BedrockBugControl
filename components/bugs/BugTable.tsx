'use client'

import Link from 'next/link'
import type { BugReport } from '@/types'

const SEVERITY_BADGE: Record<string, string> = {
  blocker: 'bg-red-500/15 text-red-400 border border-red-500/30',
  major: 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30',
  minor: 'bg-blue-500/15 text-blue-400 border border-blue-500/30',
}

const STATUS_COLOR: Record<string, string> = {
  new: 'text-sky-400',
  'in-progress': 'text-amber-400',
  resolved: 'text-green-400',
  'wont-fix': 'text-slate-400',
  duplicate: 'text-slate-400',
}

const STATUS_LABEL: Record<string, string> = {
  new: 'New',
  'in-progress': 'In Progress',
  resolved: 'Resolved',
  'wont-fix': "Won't Fix",
  duplicate: 'Duplicate',
}

const PRODUCT_LABEL: Record<string, string> = {
  'bedrock-chat': 'Chat',
  echosafe: 'EchoSafe',
  quoteflow: 'QuoteFlow',
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function fullDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

interface BugTableProps {
  bugs: BugReport[]
}

export function BugTable({ bugs }: BugTableProps) {
  if (bugs.length === 0) {
    return (
      <div className="text-center py-16 text-slate-500">
        <p className="text-2xl mb-2">🎉</p>
        <p className="text-sm">No bugs match the current filters.</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-700">
            <th className="text-left px-3 py-2.5 text-xs font-medium text-slate-400 w-20">Severity</th>
            <th className="text-left px-3 py-2.5 text-xs font-medium text-slate-400 w-24">Product</th>
            <th className="text-left px-3 py-2.5 text-xs font-medium text-slate-400">Description</th>
            <th className="text-left px-3 py-2.5 text-xs font-medium text-slate-400 w-24 hidden sm:table-cell">Reporter</th>
            <th className="text-left px-3 py-2.5 text-xs font-medium text-slate-400 w-24">Status</th>
            <th className="text-center px-3 py-2.5 text-xs font-medium text-slate-400 w-10" title="Fix prompt generated">✦</th>
            <th className="text-right px-3 py-2.5 text-xs font-medium text-slate-400 w-24 hidden md:table-cell">Created</th>
          </tr>
        </thead>
        <tbody>
          {bugs.map((bug) => {
            const isNew = bug.status === 'new'
            return (
              <tr
                key={bug.id}
                className={`border-b border-slate-800 hover:bg-slate-800/50 transition-colors cursor-pointer group ${
                  isNew ? 'border-l-2 border-l-sky-500' : ''
                }`}
              >
                <td className="px-3 py-3">
                  <Link href={`/bugs/${bug.id}`} className="block">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${SEVERITY_BADGE[bug.severity]}`}>
                      {bug.severity}
                    </span>
                  </Link>
                </td>
                <td className="px-3 py-3">
                  <Link href={`/bugs/${bug.id}`} className="block">
                    <span className="text-xs text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                      {PRODUCT_LABEL[bug.product] ?? bug.product}
                    </span>
                  </Link>
                </td>
                <td className="px-3 py-3 max-w-0">
                  <Link href={`/bugs/${bug.id}`} className="block">
                    <p className="text-slate-200 line-clamp-2 group-hover:text-white transition-colors">
                      {bug.description}
                    </p>
                  </Link>
                </td>
                <td className="px-3 py-3 hidden sm:table-cell">
                  <Link href={`/bugs/${bug.id}`} className="block">
                    <span className="text-xs text-slate-400 truncate block max-w-[90px]">
                      {bug.username ?? 'Anonymous'}
                    </span>
                  </Link>
                </td>
                <td className="px-3 py-3">
                  <Link href={`/bugs/${bug.id}`} className="block">
                    <span className={`text-xs font-medium ${STATUS_COLOR[bug.status]}`}>
                      {STATUS_LABEL[bug.status]}
                    </span>
                  </Link>
                </td>
                <td className="px-3 py-3 text-center">
                  <Link href={`/bugs/${bug.id}`} className="block">
                    {bug.fix_prompt_generated ? (
                      <span className="text-green-400" title="Fix prompt generated">✓</span>
                    ) : (
                      <span className="text-slate-700">—</span>
                    )}
                  </Link>
                </td>
                <td className="px-3 py-3 text-right hidden md:table-cell">
                  <Link href={`/bugs/${bug.id}`} className="block">
                    <span
                      className="text-xs text-slate-500"
                      title={fullDate(bug.created_at)}
                    >
                      {relativeTime(bug.created_at)}
                    </span>
                  </Link>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
