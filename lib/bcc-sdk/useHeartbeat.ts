'use client'

import { useEffect, useRef } from 'react'
import { sendHeartbeat } from './bcc-client'

interface UseHeartbeatOptions {
  product: string
  userId?: string
}

/**
 * React hook that sends periodic activity heartbeats to BCC.
 *
 * - Generates a session_id (UUID) stored in sessionStorage.
 * - Tracks user activity (mousemove, keydown, touchstart, scroll).
 * - Sends heartbeat every 60s only when the page is visible and user was recently active.
 * - Sends a final beacon on page unload.
 *
 * Payload is kept tiny (<200 bytes).
 *
 * Usage (in a client component near root):
 *   useHeartbeat({ product: 'bedrock-chat', userId: session?.user?.id })
 */
export function useHeartbeat({ product, userId }: UseHeartbeatOptions) {
  const sessionIdRef = useRef<string | null>(null)
  const lastActivityRef = useRef<number>(Date.now())
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return

    // Get or create session_id (persists across page navigations in same tab)
    const SESSION_KEY = `bcc_session_${product}`
    let sessionId = sessionStorage.getItem(SESSION_KEY)
    if (!sessionId) {
      sessionId = crypto.randomUUID()
      sessionStorage.setItem(SESSION_KEY, sessionId)
    }
    sessionIdRef.current = sessionId

    // Activity tracking — throttled to once per 10 seconds
    let activityThrottle = false
    function onActivity() {
      if (activityThrottle) return
      activityThrottle = true
      lastActivityRef.current = Date.now()
      setTimeout(() => {
        activityThrottle = false
      }, 10_000)
    }

    window.addEventListener('mousemove', onActivity, { passive: true })
    window.addEventListener('keydown', onActivity, { passive: true })
    window.addEventListener('touchstart', onActivity, { passive: true })
    window.addEventListener('scroll', onActivity, { passive: true })

    // Heartbeat interval — every 60 seconds
    const IDLE_THRESHOLD_MS = 2 * 60_000 // 2 minutes

    function maybeSendHeartbeat() {
      const isVisible = document.visibilityState === 'visible'
      const wasRecentlyActive = Date.now() - lastActivityRef.current < IDLE_THRESHOLD_MS
      if (!isVisible || !wasRecentlyActive) return

      sendHeartbeat('', {
        product,
        session_id: sessionIdRef.current!,
        user_id: userId,
      })
    }

    intervalRef.current = setInterval(maybeSendHeartbeat, 60_000)

    // Send an initial heartbeat on mount
    maybeSendHeartbeat()

    // Final beacon on unload
    function onUnload() {
      if (!sessionIdRef.current) return
      const payload = JSON.stringify({
        product,
        session_id: sessionIdRef.current,
        user_id: userId,
      })
      navigator.sendBeacon('/api/bcc/heartbeat', new Blob([payload], { type: 'application/json' }))
    }

    window.addEventListener('beforeunload', onUnload)

    return () => {
      window.removeEventListener('mousemove', onActivity)
      window.removeEventListener('keydown', onActivity)
      window.removeEventListener('touchstart', onActivity)
      window.removeEventListener('scroll', onActivity)
      window.removeEventListener('beforeunload', onUnload)
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [product, userId])
}
