'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { ErrorGroupStatus } from '@/types'

interface ErrorGroupStatusEditorProps {
  fingerprint: string
  product: string
  initialStatus: ErrorGroupStatus
  initialNotes: string | null
}

const STATUS_OPTIONS: { value: ErrorGroupStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'acknowledged', label: 'Acknowledged' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'ignored', label: 'Ignored' },
]

const STATUS_COLOR: Record<ErrorGroupStatus, string> = {
  active: 'text-red-400',
  acknowledged: 'text-yellow-400',
  resolved: 'text-emerald-400',
  ignored: 'text-slate-500',
}

export function ErrorGroupStatusEditor({
  fingerprint,
  product,
  initialStatus,
  initialNotes,
}: ErrorGroupStatusEditorProps) {
  const [status, setStatus] = useState<ErrorGroupStatus>(initialStatus)
  const [notes, setNotes] = useState(initialNotes ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  async function save(newStatus: ErrorGroupStatus, newNotes: string) {
    setSaving(true)
    setSaveError(null)
    const supabase = createClient()
    const { error: upsertError } = await supabase.from('error_group_status').upsert(
      {
        fingerprint,
        product,
        status: newStatus,
        notes: newNotes || null,
        resolved_at: newStatus === 'resolved' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'fingerprint,product' }
    )
    setSaving(false)
    if (upsertError) {
      setSaveError('Failed to save')
      return
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function handleStatusChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newStatus = e.target.value as ErrorGroupStatus
    setStatus(newStatus)
    await save(newStatus, notes)
  }

  async function handleNotesBlur() {
    await save(status, notes)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <select
          value={status}
          onChange={handleStatusChange}
          disabled={saving}
          className={`bg-slate-800 border border-slate-700/50 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-slate-500 ${STATUS_COLOR[status]} disabled:opacity-50`}
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value} className="text-slate-200 bg-slate-800">
              {opt.label}
            </option>
          ))}
        </select>
        {saved && <span className="text-xs text-emerald-400">Saved</span>}
        {saving && <span className="text-xs text-slate-500">Saving…</span>}
        {saveError && <span className="text-xs text-red-400">{saveError}</span>}
      </div>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={handleNotesBlur}
        placeholder="Add notes (optional) — saves on blur"
        rows={3}
        className="bg-slate-800 border border-slate-700/50 text-sm text-slate-300 placeholder-slate-600 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-500 resize-y w-full"
      />
    </div>
  )
}
