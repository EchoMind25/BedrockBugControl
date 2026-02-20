'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { BccProduct } from '@/types'

interface ManualDeployFormProps {
  products: BccProduct[]
}

export function ManualDeployForm({ products }: ManualDeployFormProps) {
  const [open, setOpen] = useState(false)
  const [product, setProduct] = useState(products[0]?.id ?? '')
  const [commitHash, setCommitHash] = useState('')
  const [notes, setNotes] = useState('')
  const [environment, setEnvironment] = useState<'production' | 'staging' | 'preview'>('production')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!product) { setError('Select a product'); return }
    if (!commitHash && !notes) { setError('Provide a commit hash or notes'); return }

    setSaving(true)
    setError(null)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { error: insertError } = await supabase.from('deployments').insert({
      product,
      commit_hash: commitHash.trim().slice(0, 40) || null,
      notes: notes.trim() || null,
      environment,
      deployed_by: user?.email?.slice(0, 100) ?? 'manual',
      branch: 'main',
      deployed_at: new Date().toISOString(),
    })

    setSaving(false)

    if (insertError) {
      setError(insertError.message)
      return
    }

    setOpen(false)
    setCommitHash('')
    setNotes('')
    router.refresh()
  }

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="text-xs text-slate-400 border border-slate-700/50 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg transition-colors"
      >
        + Log a deploy
      </button>

      {open && (
        <div className="mt-3 bg-slate-800/70 border border-slate-700/50 rounded-xl p-4">
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="text-xs text-slate-500 block mb-1">Product</label>
              <select
                value={product}
                onChange={(e) => setProduct(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700/50 text-slate-200 text-sm rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-slate-500"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.display_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Environment</label>
              <select
                value={environment}
                onChange={(e) => setEnvironment(e.target.value as typeof environment)}
                className="w-full bg-slate-900 border border-slate-700/50 text-slate-200 text-sm rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-slate-500"
              >
                <option value="production">Production</option>
                <option value="staging">Staging</option>
                <option value="preview">Preview</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Commit hash (optional)</label>
              <input
                type="text"
                value={commitHash}
                onChange={(e) => setCommitHash(e.target.value)}
                placeholder="abc1234"
                maxLength={40}
                className="w-full bg-slate-900 border border-slate-700/50 text-slate-200 text-sm rounded-lg px-2.5 py-1.5 font-mono focus:outline-none focus:border-slate-500"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Notes {!commitHash && <span className="text-red-400">*</span>}</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Brief deploy description"
                className="w-full bg-slate-900 border border-slate-700/50 text-slate-200 text-sm rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-slate-500"
              />
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={saving}
                className="text-xs bg-slate-200 text-slate-900 hover:bg-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 font-medium"
              >
                {saving ? 'Saving…' : 'Log deploy'}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-xs text-slate-400 border border-slate-700/50 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
