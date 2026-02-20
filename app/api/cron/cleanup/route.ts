import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * GET /api/cron/cleanup
 *
 * Vercel Cron job — runs daily at 3:00 AM UTC.
 * Performs data retention cleanup and refreshes the error_groups materialized view.
 */

export async function GET(request: NextRequest) {
  // Verify cron secret — fail-closed: if not set, reject all requests
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error('[BCC] CRON_SECRET is not set — rejecting cron request')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (token !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const results: Record<string, unknown> = {}

  // 1. Delete stale active_sessions (last_heartbeat > 10 min ago)
  const { error: sessionsError, count: sessionsDeleted } = await supabase
    .from('active_sessions')
    .delete({ count: 'exact' })
    .lt('last_heartbeat', new Date(Date.now() - 10 * 60 * 1000).toISOString())

  results.sessions_deleted = sessionsError ? `error: ${sessionsError.message}` : sessionsDeleted

  // 2. Delete old uptime checks (> 90 days)
  const { error: uptimeError, count: uptimeDeleted } = await supabase
    .from('uptime_checks')
    .delete({ count: 'exact' })
    .lt('checked_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())

  results.uptime_checks_deleted = uptimeError ? `error: ${uptimeError.message}` : uptimeDeleted

  // 3. Delete old auto_errors (> 90 days)
  const { error: errorsError, count: errorsDeleted } = await supabase
    .from('auto_errors')
    .delete({ count: 'exact' })
    .lt('created_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())

  results.auto_errors_deleted = errorsError ? `error: ${errorsError.message}` : errorsDeleted

  // 4. Refresh error_groups materialized view
  const { error: refreshError } = await supabase.rpc('refresh_error_groups')
  results.error_groups_refreshed = refreshError ? `error: ${refreshError.message}` : true

  console.log('[BCC] cleanup results:', results)

  return NextResponse.json({
    ok: true,
    timestamp: new Date().toISOString(),
    ...results,
  })
}
