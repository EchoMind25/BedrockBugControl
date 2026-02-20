import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/bcc/bulk-errors
 *
 * Applies a bulk status change to multiple error groups.
 * Uses upsert on error_group_status (same as single-item update).
 * Requires BCC team authentication (enforced via RLS).
 *
 * Body:
 * {
 *   items: Array<{ fingerprint: string; product: string }>
 *   status: 'acknowledged' | 'resolved' | 'ignored'
 * }
 */

const VALID_STATUSES = ['acknowledged', 'resolved', 'ignored', 'active']

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  // Verify authentication
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { items?: unknown; status?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { items, status } = body

  if (!Array.isArray(items) || items.length === 0 || items.length > 200) {
    return NextResponse.json({ error: 'items must be a non-empty array (max 200)' }, { status: 400 })
  }
  if (
    typeof status !== 'string' ||
    !VALID_STATUSES.includes(status)
  ) {
    return NextResponse.json({ error: `Invalid status: ${status}` }, { status: 400 })
  }

  const typedItems = items as Array<{ fingerprint: string; product: string }>

  // Validate item shape
  if (!typedItems.every((i) => typeof i.fingerprint === 'string' && typeof i.product === 'string')) {
    return NextResponse.json({ error: 'Each item must have fingerprint and product strings' }, { status: 400 })
  }

  const now = new Date().toISOString()

  const upsertRows = typedItems.map((item) => ({
    fingerprint: item.fingerprint,
    product: item.product,
    status,
    resolved_at: status === 'resolved' ? now : null,
    updated_at: now,
  }))

  const { error } = await supabase
    .from('error_group_status')
    .upsert(upsertRows, { onConflict: 'fingerprint,product' })

  if (error) {
    console.error('[BCC] bulk-errors error:', error)
    return NextResponse.json({ error: 'Bulk update failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, updated: items.length })
}
