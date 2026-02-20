'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { BugReport } from '@/types'

interface TriagePanelProps {
  bug: BugReport
  onOpenPrompt: () => void
}

const STATUSES = [
  { value: 'new', label: 'New' },
  { value: 'in-progress', label: 'In Progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'wont-fix', label: "Won't Fix" },
  { value: 'duplicate', label: 'Duplicate' },
]

const SEVERITIES = [
  { value: 'blocker', label: '🔴 Blocker' },
  { value: 'major', label: '🟡 Major' },
  { value: 'minor', label: '🔵 Minor' },
]

function formatTs(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export function TriagePanel({ bug, onOpenPrompt }: TriagePanelProps) {
  const supabase = createClient()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [saving, setSaving] = useState<string | null>(null)
  const [assignedTo, setAssignedTo] = useState(bug.assigned_to ?? '')
  const [resolutionNotes, setResolutionNotes] = useState(bug.resolution_notes ?? '')
  const [error, setError] = useState<string | null>(null)

  const showResolutionNotes = ['resolved', 'wont-fix', 'duplicate'].includes(bug.status)

  async function updateField(field: string, value: string | boolean | null) {
    setSaving(field)
    setError(null)

    const updates: Record<string, unknown> = { [field]: value }

    // Auto-set resolved_at when status changes to resolved
    if (field === 'status' && value === 'resolved' && !bug.resolved_at) {
      updates.resolved_at = new Date().toISOString()
    }
    if (field === 'status' && value !== 'resolved') {
      updates.resolved_at = null
    }

    const { error: updateError } = await supabase
      .from('bug_reports')
      .update(updates)
      .eq('id', bug.id)

    setSaving(null)

    if (updateError) {
      setError('Failed to save. Please try again.')
      return
    }

    startTransition(() => {
      router.refresh()
    })
  }

  async function saveAssignedTo() {
    await updateField('assigned_to', assignedTo.trim() || null)
  }

  async function saveResolutionNotes() {
    await updateField('resolution_notes', resolutionNotes.trim() || null)
  }

  return (
    <div className="space-y-4">
      {/* Status */}
      <div>
        <label className="block text-xs font-medium text-slate-400 mb-1.5">Status</label>
        <div className="relative">
          <select
            value={bug.status}
            onChange={(e) => updateField('status', e.target.value)}
            disabled={saving === 'status'}
            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500 disabled:opacity-50 appearance-none"
          >
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          {saving === 'status' && (
            <span className="absolute right-8 top-2 text-xs text-slate-400">Saving…</span>
          )}
        </div>
      </div>

      {/* Severity */}
      <div>
        <label className="block text-xs font-medium text-slate-400 mb-1.5">Severity</label>
        <select
          value={bug.severity}
          onChange={(e) => updateField('severity', e.target.value)}
          disabled={saving === 'severity'}
          className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500 disabled:opacity-50 appearance-none"
        >
          {SEVERITIES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      {/* Assigned To */}
      <div>
        <label className="block text-xs font-medium text-slate-400 mb-1.5">Assigned To</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            onBlur={saveAssignedTo}
            placeholder="Type a name…"
            className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Resolution Notes (shown when status is closed) */}
      {showResolutionNotes && (
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Resolution Notes</label>
          <textarea
            value={resolutionNotes}
            onChange={(e) => setResolutionNotes(e.target.value)}
            onBlur={saveResolutionNotes}
            rows={3}
            placeholder="What was the fix or reason?"
            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none"
          />
        </div>
      )}

      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}

      {/* Timestamps */}
      <div className="pt-1 space-y-1.5 border-t border-slate-700">
        <div className="flex justify-between text-xs">
          <span className="text-slate-500">Created</span>
          <span className="text-slate-400">{formatTs(bug.created_at)}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-slate-500">Updated</span>
          <span className="text-slate-400">{formatTs(bug.updated_at)}</span>
        </div>
        {bug.resolved_at && (
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">Resolved</span>
            <span className="text-green-400">{formatTs(bug.resolved_at)}</span>
          </div>
        )}
      </div>

      {/* Fix Prompt Generator */}
      <div className="pt-1 border-t border-slate-700">
        <button
          onClick={onOpenPrompt}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg py-2.5 text-sm transition-colors"
        >
          <span>✦</span>
          Generate Fix Prompt
        </button>
        {bug.fix_prompt_generated && bug.fix_prompt_copied_at && (
          <p className="text-center text-xs text-slate-500 mt-2">
            Prompt generated {relativeTime(bug.fix_prompt_copied_at)}
          </p>
        )}
      </div>

      {isPending && (
        <p className="text-xs text-slate-500 text-center">Refreshing…</p>
      )}
    </div>
  )
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}
