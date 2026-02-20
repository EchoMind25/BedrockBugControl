import { NextResponse } from 'next/server'
import type { HealthCheck, HealthResponse } from './types'

/**
 * Standard health check route handler.
 *
 * Simple usage (no custom checks):
 *   export { healthHandler as GET } from 'bcc-sdk/health-route'
 *
 * With custom checks:
 *   export const GET = createHealthHandler({
 *     product: 'bedrock-chat',
 *     checks: [
 *       { name: 'database', check: async () => { await supabase.from('_health').select('1') } },
 *     ],
 *   })
 *
 * Response: 200 if all healthy, 503 if any check fails.
 */

interface CreateHealthHandlerOptions {
  product?: string
  checks?: HealthCheck[]
}

export function createHealthHandler({ checks = [] }: CreateHealthHandlerOptions = {}) {
  return async function healthHandler(): Promise<Response> {
    const version =
      process.env.npm_package_version ??
      process.env.NEXT_PUBLIC_APP_VERSION ??
      '0.0.0'

    const results: HealthResponse['checks'] = {}
    let allHealthy = true

    await Promise.allSettled(
      checks.map(async ({ name, check }) => {
        const start = Date.now()
        try {
          await check()
          results[name] = { status: 'healthy', latency_ms: Date.now() - start }
        } catch (err) {
          allHealthy = false
          results[name] = {
            status: 'unhealthy',
            latency_ms: Date.now() - start,
            error: err instanceof Error ? err.message : String(err),
          }
        }
      })
    )

    const status: HealthResponse['status'] = allHealthy ? 'healthy' : 'unhealthy'

    const body: HealthResponse = {
      status,
      version,
      timestamp: new Date().toISOString(),
      checks: results,
    }

    return NextResponse.json(body, { status: allHealthy ? 200 : 503 })
  }
}

/** Simple no-checks health handler for products that don't need custom checks. */
export const healthHandler = createHealthHandler()
