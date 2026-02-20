import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/bcc/bulk-bugs
 *
 * Applies a bulk action to multiple bug reports.
 * Requires BCC team authentication (enforced via RLS).
 *
 * Body:
 * {
 *   ids: string[]           // bug report UUIDs
 *   action: 'status' | 'severity' | 'assign' | 'duplicate'
 *   value: string           // new value for the action
 * }
 */

type BulkAction = 'status' | 'severity' | 'assign' | 'duplicate'

const VALID_STATUSES = ['new', 'in-progress', 'resolved', 'wont-fix', 'duplicate']
const VALID_SEVERITIES = ['blocker', 'major', 'minor']

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  // Verify authentication
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { ids?: unknown; action?: unknown; value?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { ids, action, value } = body

  // Validate inputs
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 200) {
    return NextResponse.json({ error: 'ids must be a non-empty array (max 200)' }, { status: 400 })
  }
  if (!ids.every((id) => typeof id === 'string')) {
    return NextResponse.json({ error: 'All ids must be strings' }, { status: 400 })
  }
  if (typeof action !== 'string') {
    return NextResponse.json({ error: 'action is required' }, { status: 400 })
  }
  if (typeof value !== 'string') {
    return NextResponse.json({ error: 'value is required' }, { status: 400 })
  }

  const typedAction = action as BulkAction

  let updatePayload: Record<string, string | null> = {}
  const now = new Date().toISOString()

  switch (typedAction) {
    case 'status':
      if (!VALID_STATUSES.includes(value)) {
        return NextResponse.json({ error: `Invalid status: ${value}` }, { status: 400 })
      }
      updatePayload = {
        status: value,
        ...(value === 'resolved' ? { resolved_at: now } : {}),
      }
      break

    case 'severity':
      if (!VALID_SEVERITIES.includes(value)) {
        return NextResponse.json({ error: `Invalid severity: ${value}` }, { status: 400 })
      }
      updatePayload = { severity: value }
      break

    case 'assign':
      updatePayload = { assigned_to: value || null }
      break

    case 'duplicate':
      // value = UUID of the original bug
      updatePayload = { status: 'duplicate' }
      break

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  }

  const { error } = await supabase
    .from('bug_reports')
    .update({ ...updatePayload, updated_at: now })
    .in('id', ids as string[])

  if (error) {
    console.error('[BCC] bulk-bugs error:', error)
    return NextResponse.json({ error: 'Bulk update failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, updated: (ids as string[]).length })
}
