'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function RefreshErrorGroups() {
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function handleRefresh() {
    setRefreshing(true)
    setError(null)
    try {
      const res = await fetch('/api/bcc/refresh-error-groups', { method: 'POST' })
      if (!res.ok) {
        setError('Refresh failed')
        setRefreshing(false)
        return
      }
    } catch {
      setError('Refresh failed')
      setRefreshing(false)
      return
    }
    router.refresh()
    setRefreshing(false)
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-red-400">{error}</span>}
      <button
        onClick={handleRefresh}
        disabled={refreshing}
        className="text-xs text-slate-400 border border-slate-700/50 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
      >
        {refreshing ? 'Refreshing…' : '↻ Refresh data'}
      </button>
    </div>
  )
}
