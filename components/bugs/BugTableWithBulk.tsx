'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import type { BugReport, BugStatus, Severity } from '@/types'

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
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

interface BulkState {
  action: 'status' | 'severity' | 'assign' | null
  value: string
}

interface BugTableWithBulkProps {
  bugs: BugReport[]
}

export function BugTableWithBulk({ bugs }: BugTableWithBulkProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulk, setBulk] = useState<BulkState>({ action: null, value: '' })
  const [applying, setApplying] = useState(false)
  const [applyResult, setApplyResult] = useState<string | null>(null)
  // Track locally-applied changes so the UI reflects bulk actions without a full reload
  const [overrides, setOverrides] = useState<Record<string, Partial<BugReport>>>({})

  const isAllSelected = bugs.length > 0 && selected.size === bugs.length

  function toggleAll() {
    if (isAllSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(bugs.map((b) => b.id)))
    }
  }

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const applyBulk = useCallback(async () => {
    if (!bulk.action || !bulk.value || selected.size === 0) return
    const confirmed = window.confirm(
      `Apply "${bulk.action}: ${bulk.value}" to ${selected.size} bug${selected.size !== 1 ? 's' : ''}?`
    )
    if (!confirmed) return

    setApplying(true)
    setApplyResult(null)

    try {
      const res = await fetch('/api/bcc/bulk-bugs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: Array.from(selected),
          action: bulk.action,
          value: bulk.value,
        }),
      })
      const data = await res.json() as { ok?: boolean; updated?: number; error?: string }

      if (res.ok && data.ok) {
        // Apply overrides locally so the table reflects the change immediately
        const patch: Partial<BugReport> = {}
        if (bulk.action === 'status') patch.status = bulk.value as BugStatus
        if (bulk.action === 'severity') patch.severity = bulk.value as Severity
        if (bulk.action === 'assign') patch.assigned_to = bulk.value || null

        setOverrides((prev) => {
          const next = { ...prev }
          for (const id of selected) {
            next[id] = { ...next[id], ...patch }
          }
          return next
        })

        setApplyResult(`Applied to ${data.updated ?? selected.size} bugs`)
        setSelected(new Set())
        setBulk({ action: null, value: '' })
      } else {
        setApplyResult(data.error ?? 'Failed to apply')
      }
    } catch {
      setApplyResult('Network error — try again')
    } finally {
      setApplying(false)
    }
  }, [bulk, selected])

  if (bugs.length === 0) {
    return (
      <div className="text-center py-16 text-slate-500">
        <p className="text-2xl mb-2">🎉</p>
        <p className="text-sm">No bugs match the current filters.</p>
      </div>
    )
  }

  return (
    <div>
      {/* Bulk action bar — appears when rows are selected */}
      {selected.size > 0 && (
        <div className="sticky top-0 z-10 bg-slate-900/95 border-b border-slate-700/50 px-4 py-3 flex flex-wrap items-center gap-3 backdrop-blur">
          <span className="text-xs text-slate-400 font-medium">
            {selected.size} selected
          </span>

          {/* Action selector */}
          <select
            value={bulk.action ?? ''}
            onChange={(e) => setBulk({ action: (e.target.value as BulkState['action']) || null, value: '' })}
            className="bg-slate-800 border border-slate-700/50 text-sm text-slate-300 rounded-lg px-2 py-1 focus:outline-none"
          >
            <option value="">Choose action…</option>
            <option value="status">Change Status</option>
            <option value="severity">Change Severity</option>
            <option value="assign">Assign To</option>
          </select>

          {/* Value selector based on action */}
          {bulk.action === 'status' && (
            <select
              value={bulk.value}
              onChange={(e) => setBulk((prev) => ({ ...prev, value: e.target.value }))}
              className="bg-slate-800 border border-slate-700/50 text-sm text-slate-300 rounded-lg px-2 py-1 focus:outline-none"
            >
              <option value="">Pick status…</option>
              <option value="new">New</option>
              <option value="in-progress">In Progress</option>
              <option value="resolved">Resolved</option>
              <option value="wont-fix">Won&apos;t Fix</option>
              <option value="duplicate">Duplicate</option>
            </select>
          )}

          {bulk.action === 'severity' && (
            <select
              value={bulk.value}
              onChange={(e) => setBulk((prev) => ({ ...prev, value: e.target.value }))}
              className="bg-slate-800 border border-slate-700/50 text-sm text-slate-300 rounded-lg px-2 py-1 focus:outline-none"
            >
              <option value="">Pick severity…</option>
              <option value="blocker">Blocker</option>
              <option value="major">Major</option>
              <option value="minor">Minor</option>
            </select>
          )}

          {bulk.action === 'assign' && (
            <input
              type="text"
              placeholder="Assignee name or email…"
              value={bulk.value}
              onChange={(e) => setBulk((prev) => ({ ...prev, value: e.target.value }))}
              className="bg-slate-800 border border-slate-700/50 text-sm text-slate-300 rounded-lg px-3 py-1 focus:outline-none w-48"
            />
          )}

          <button
            onClick={applyBulk}
            disabled={!bulk.action || !bulk.value || applying}
            className="text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-lg transition-colors font-medium"
          >
            {applying ? 'Applying…' : 'Apply'}
          </button>

          <button
            onClick={() => { setSelected(new Set()); setBulk({ action: null, value: '' }) }}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            Cancel
          </button>

          {applyResult && (
            <span className={`text-xs ${applyResult.startsWith('Applied') ? 'text-emerald-400' : 'text-red-400'}`}>
              {applyResult}
            </span>
          )}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700">
              <th className="px-3 py-2.5 w-8">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={toggleAll}
                  className="rounded border-slate-600 bg-slate-800 accent-blue-500"
                  title="Select all"
                />
              </th>
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
              const effective = { ...bug, ...overrides[bug.id] }
              const isSelected = selected.has(bug.id)
              const isNew = effective.status === 'new'
              return (
                <tr
                  key={bug.id}
                  className={`border-b border-slate-800 hover:bg-slate-800/50 transition-colors group ${
                    isNew ? 'border-l-2 border-l-sky-500' : ''
                  } ${isSelected ? 'bg-blue-900/10' : ''}`}
                >
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleRow(bug.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="rounded border-slate-600 bg-slate-800 accent-blue-500"
                    />
                  </td>
                  <td className="px-3 py-3">
                    <Link href={`/bugs/${bug.id}`} className="block">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${SEVERITY_BADGE[effective.severity]}`}>
                        {effective.severity}
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
                      <span className={`text-xs font-medium ${STATUS_COLOR[effective.status]}`}>
                        {STATUS_LABEL[effective.status]}
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
                      <span className="text-xs text-slate-500" title={fullDate(bug.created_at)}>
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
    </div>
  )
}
