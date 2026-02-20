import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

const ALLOWED_ORIGINS = [
  'https://bedrockchat.com',
  'https://echosafe.app',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
]

function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) {
    return {
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    }
  }
  return {
    'Access-Control-Allow-Origin': origin,
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

  // Auth: BCC_INGEST_KEY
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token || token !== process.env.BCC_INGEST_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(origin) })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: corsHeaders(origin) })
  }

  const { product, session_id, user_id } = body

  if (!product || typeof product !== 'string') {
    return NextResponse.json({ error: 'product is required' }, { status: 400, headers: corsHeaders(origin) })
  }
  if (!session_id || typeof session_id !== 'string') {
    return NextResponse.json({ error: 'session_id is required' }, { status: 400, headers: corsHeaders(origin) })
  }

  const supabase = createServiceClient()

  // UPSERT into active_sessions — update last_heartbeat on conflict
  const { error: upsertError } = await supabase.from('active_sessions').upsert(
    {
      product: (product as string).trim(),
      session_id: (session_id as string).trim().slice(0, 200),
      user_id: typeof user_id === 'string' ? user_id.trim().slice(0, 100) : null,
      last_heartbeat: new Date().toISOString(),
    },
    {
      onConflict: 'product,session_id',
      ignoreDuplicates: false,
    }
  )

  if (upsertError) {
    console.error('[BCC] heartbeat upsert error:', upsertError)
    // Return 200 anyway — heartbeat failures should be silent
  }

  return NextResponse.json({ status: 'ok' }, { status: 200, headers: corsHeaders(origin) })
}
