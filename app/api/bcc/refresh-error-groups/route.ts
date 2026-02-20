import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/bcc/refresh-error-groups
 * Refreshes the error_groups materialized view. Called from the errors dashboard.
 * Protected by session auth (dashboard team only).
 */
export async function POST() {
  const supabase = await createClient()

  // Verify authenticated and is BCC team member
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: isTeam } = await supabase.rpc('is_bcc_team')
  if (!isTeam) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error } = await supabase.rpc('refresh_error_groups')
  if (error) {
    console.error('[BCC] refresh_error_groups error:', error)
    return NextResponse.json({ error: 'Failed to refresh' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
