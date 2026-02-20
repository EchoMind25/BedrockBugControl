import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/bcc/acknowledge-spike
 *
 * Marks an error spike alert as acknowledged.
 * Requires BCC team authentication.
 *
 * Body: { id: string }
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()

  // Verify authentication
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { id?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { id } = body
  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const { error } = await supabase
    .from('error_spike_alerts')
    .update({
      acknowledged: true,
      acknowledged_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) {
    console.error('[BCC] acknowledge-spike error:', error)
    return NextResponse.json({ error: 'Failed to acknowledge' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
