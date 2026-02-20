import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { generateFingerprint, generateFingerprintSync } from './fingerprint'
import { reportError } from './bcc-client'

type RouteHandler = (request: NextRequest, context?: unknown) => Promise<Response>

/**
 * Higher-order function that wraps Next.js App Router route handlers to
 * capture unhandled server-side errors and report them to BCC.
 *
 * Does NOT interfere with handlers that already catch their own errors.
 * Only catches truly unhandled exceptions.
 *
 * Usage:
 *   export const POST = withErrorCapture('bedrock-chat', async (request) => {
 *     return NextResponse.json({ ok: true })
 *   })
 */
export function withErrorCapture(product: string, handler: RouteHandler): RouteHandler {
  return async function wrappedHandler(request: NextRequest, context?: unknown): Promise<Response> {
    try {
      return await handler(request, context)
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))

      // Report to BCC asynchronously — don't block the response
      ;(async () => {
        let fingerprint: string
        try {
          fingerprint = await generateFingerprint(error.message, error.stack)
        } catch {
          fingerprint = generateFingerprintSync(error.message, error.stack)
        }

        const payload = {
          product,
          error_message: error.message.slice(0, 2000),
          stack_trace: error.stack?.slice(0, 10000),
          error_type: 'unhandled_exception' as const,
          source: 'server' as const,
          request_url: request.url,
          request_method: request.method,
          app_version: process.env.npm_package_version ?? process.env.NEXT_PUBLIC_APP_VERSION,
          fingerprint,
        }

        reportError('', payload)
      })().catch(() => {
        /* never throw */
      })

      // Return a generic 500 to the client
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
  }
}
