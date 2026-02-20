import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendBlockerAlert } from '@/lib/email/resend'
import type { BugReportInsert } from '@/types'

// Allowed product origins for CORS
const ALLOWED_ORIGINS = [
  'https://bedrockchat.com',
  'https://echosafe.app',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
]

function corsHeaders(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[2]
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin')
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) })
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')

  // --- Auth: BCC_INGEST_KEY ---
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '')

  if (!token || token !== process.env.BCC_INGEST_KEY) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: corsHeaders(origin) }
    )
  }

  // --- Parse body ---
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400, headers: corsHeaders(origin) }
    )
  }

  // --- Validate required fields ---
  const { product, description, steps_to_reproduce, severity } = body

  if (!product || typeof product !== 'string') {
    return NextResponse.json({ error: 'product is required' }, { status: 400, headers: corsHeaders(origin) })
  }
  if (!description || typeof description !== 'string' || description.trim().length === 0) {
    return NextResponse.json({ error: 'description is required' }, { status: 400, headers: corsHeaders(origin) })
  }
  if (!steps_to_reproduce || typeof steps_to_reproduce !== 'string' || steps_to_reproduce.trim().length === 0) {
    return NextResponse.json({ error: 'steps_to_reproduce is required' }, { status: 400, headers: corsHeaders(origin) })
  }
  if (!['blocker', 'major', 'minor'].includes(severity as string)) {
    return NextResponse.json({ error: 'severity must be blocker, major, or minor' }, { status: 400, headers: corsHeaders(origin) })
  }

  const supabase = createServiceClient()

  // --- Validate product exists ---
  const { data: productRow, error: productError } = await supabase
    .from('bcc_products')
    .select('id, display_name')
    .eq('id', product.trim())
    .eq('is_active', true)
    .single()

  if (productError || !productRow) {
    return NextResponse.json(
      { error: `Unknown product: ${product}` },
      { status: 400, headers: corsHeaders(origin) }
    )
  }

  // --- Build insert payload (sanitize + limit lengths) ---
  const str = (v: unknown, max: number) =>
    typeof v === 'string' ? v.trim().slice(0, max) : null

  const insert: BugReportInsert = {
    product: product.trim(),
    description: description.trim().slice(0, 5000),
    steps_to_reproduce: steps_to_reproduce.trim().slice(0, 5000),
    severity: severity as BugReportInsert['severity'],
    screenshot_url: str(body.screenshot_url, 2000) ?? undefined,
    current_route: str(body.current_route, 500) ?? undefined,
    app_version: str(body.app_version, 50) ?? undefined,
    user_agent: str(body.user_agent, 500) ?? undefined,
    viewport: str(body.viewport, 20) ?? undefined,
    user_id: str(body.user_id, 100) ?? undefined,
    username: str(body.username, 100) ?? undefined,
  }

  // --- Insert bug report ---
  const { data: bug, error: insertError } = await supabase
    .from('bug_reports')
    .insert(insert)
    .select()
    .single()

  if (insertError || !bug) {
    console.error('[BCC] Insert error:', insertError)
    return NextResponse.json(
      { error: 'Failed to save bug report' },
      { status: 500, headers: corsHeaders(origin) }
    )
  }

  // --- Send email alert for blocker bugs ---
  if (severity === 'blocker') {
    // Fire and forget — don't block the response
    sendBlockerAlert(bug, productRow.display_name).catch((err) =>
      console.error('[BCC] Blocker alert failed:', err)
    )
  }

  return NextResponse.json(
    { id: bug.id, status: 'received' },
    { status: 201, headers: corsHeaders(origin) }
  )
}
