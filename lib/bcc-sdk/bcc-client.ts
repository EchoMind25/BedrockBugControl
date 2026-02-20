/**
 * BCC internal HTTP client.
 *
 * All SDK modules POST to the product's own API routes which proxy to BCC.
 * This client handles: timeout (5s), 1 retry after 2s, silent failure.
 *
 * BCC reporting should NEVER break the product.
 */

const TIMEOUT_MS = 5000
const RETRY_DELAY_MS = 2000

async function fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function postToBcc(url: string, body: unknown, attempt = 0): Promise<void> {
  try {
    await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (err) {
    if (attempt === 0) {
      // One retry after 2 seconds
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
      return postToBcc(url, body, 1)
    }
    // Give up silently
    console.warn('[BCC] Error report failed silently:', err instanceof Error ? err.message : err)
  }
}

/**
 * POST an error payload to the product's /api/bcc/error route.
 * Fire-and-forget: never throws.
 */
export function reportError(baseUrl: string, payload: unknown): void {
  const url = baseUrl ? `${baseUrl}/api/bcc/error` : '/api/bcc/error'
  postToBcc(url, payload).catch(() => {
    /* already handled inside */
  })
}

/**
 * POST a heartbeat to the product's /api/bcc/heartbeat route.
 * Fire-and-forget: never throws.
 */
export function sendHeartbeat(baseUrl: string, payload: unknown): void {
  const url = baseUrl ? `${baseUrl}/api/bcc/heartbeat` : '/api/bcc/heartbeat'
  postToBcc(url, payload).catch(() => {
    /* already handled inside */
  })
}
