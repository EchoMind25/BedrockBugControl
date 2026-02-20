'use client'

import { useEffect, useRef } from 'react'
import { generateFingerprint, generateFingerprintSync } from './fingerprint'
import { reportError } from './bcc-client'

interface UseFetchInterceptorOptions {
  product: string
  /** URL patterns to ignore (substring match on the path). Default: ['/api/bcc/'] */
  excludeUrls?: string[]
  /** HTTP status codes to ignore. Default: [401] */
  excludeStatuses?: number[]
  /** Don't report same URL+status more than once per this ms. Default: 300000 (5 min) */
  debounceMs?: number
}

/**
 * React hook that patches window.fetch to report failed API calls (status >= 400).
 *
 * - Only runs in the browser.
 * - Restores original fetch on unmount.
 * - Never captures request/response bodies.
 * - Transparent: returns the original response unchanged.
 *
 * Usage (in a client component near root):
 *   useFetchInterceptor({ product: 'bedrock-chat' })
 */
export function useFetchInterceptor({
  product,
  excludeUrls = ['/api/bcc/'],
  excludeStatuses = [401],
  debounceMs = 300_000,
}: UseFetchInterceptorOptions) {
  // Map of `${method}:${urlPath}:${status}` → last report timestamp
  const debounceMap = useRef(new Map<string, number>())
  const originalFetch = useRef<typeof fetch | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const nativeFetch = window.fetch
    originalFetch.current = nativeFetch

    window.fetch = async function interceptedFetch(
      input: RequestInfo | URL,
      init?: RequestInit
    ): Promise<Response> {
      const response = await nativeFetch(input, init)

      if (!response.ok && response.status >= 400) {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
        const urlPath = new URL(url, window.location.origin).pathname
        const method = init?.method?.toUpperCase() ?? 'GET'
        const status = response.status

        // Check exclusions
        const excluded =
          excludeUrls.some((pattern) => urlPath.includes(pattern)) ||
          excludeStatuses.includes(status)

        if (!excluded) {
          const key = `${method}:${urlPath}:${status}`
          const lastReport = debounceMap.current.get(key)
          if (!lastReport || Date.now() - lastReport > debounceMs) {
            debounceMap.current.set(key, Date.now())
            reportApiError(product, method, urlPath, status)
          }
        }
      }

      return response
    }

    return () => {
      window.fetch = nativeFetch
    }
  }, [product, excludeUrls, excludeStatuses, debounceMs])
}

function reportApiError(product: string, method: string, urlPath: string, status: number) {
  const errorMessage = `API ${method} ${urlPath} → ${status}`
  ;(async () => {
    let fingerprint: string
    try {
      fingerprint = await generateFingerprint(`${status}::${urlPath}`)
    } catch {
      fingerprint = generateFingerprintSync(`${status}::${urlPath}`)
    }

    reportError('', {
      product,
      error_message: errorMessage,
      error_type: 'api_error' as const,
      source: 'client' as const,
      request_url: urlPath,
      request_method: method,
      response_status: status,
      current_route: typeof window !== 'undefined' ? window.location.pathname : undefined,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      fingerprint,
    })
  })().catch(() => {
    /* never throw */
  })
}
