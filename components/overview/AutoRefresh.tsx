'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface AutoRefreshProps {
  intervalMs?: number
}

/**
 * Silently refreshes server component data on an interval.
 * Renders nothing visible.
 */
export function AutoRefresh({ intervalMs = 60_000 }: AutoRefreshProps) {
  const router = useRouter()

  useEffect(() => {
    const id = setInterval(() => router.refresh(), intervalMs)
    return () => clearInterval(id)
  }, [router, intervalMs])

  return null
}
