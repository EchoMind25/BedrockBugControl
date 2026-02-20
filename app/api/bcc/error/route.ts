import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import type { AutoErrorInsert } from '@/types'

const ALLOWED_ORIGINS = [
  'https://bedrockchat.com',
  'https://echosafe.app',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
]

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isValidUuid(val: unknown): val is string {
  return typeof val === 'string' && UUID_REGEX.test(val)
}

function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) {
    // Don't leak CORS headers to unrecognized origins — BCC_INGEST_KEY is the real guard
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

// In-memory rate limiting: product → { count, resetAt }
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT = 100 // per product per minute

function checkRateLimit(product: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(product)

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(product, { count: 1, resetAt: now + 60_000 })
    return true // allowed
  }

  if (entry.count >= RATE_LIMIT) return false // rate limited

  entry.count++
  return true // allowed
}

const VALID_ERROR_TYPES = ['unhandled_exception', 'api_error', 'client_crash', 'edge_function_error']
const VALID_SOURCES = ['client', 'server', 'edge_function']
const VALID_ENVIRONMENTS = ['production', 'staging', 'development']

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

  // Validate required fields
  const { product, error_message, error_type, source, fingerprint } = body

  if (!product || typeof product !== 'string') {
    return NextResponse.json({ error: 'product is required' }, { status: 400, headers: corsHeaders(origin) })
  }
  if (!error_message || typeof error_message !== 'string') {
    return NextResponse.json({ error: 'error_message is required' }, { status: 400, headers: corsHeaders(origin) })
  }
  if (!error_type || !VALID_ERROR_TYPES.includes(error_type as string)) {
    return NextResponse.json({ error: 'error_type must be one of: ' + VALID_ERROR_TYPES.join(', ') }, { status: 400, headers: corsHeaders(origin) })
  }
  if (!source || !VALID_SOURCES.includes(source as string)) {
    return NextResponse.json({ error: 'source must be one of: ' + VALID_SOURCES.join(', ') }, { status: 400, headers: corsHeaders(origin) })
  }
  if (!fingerprint || typeof fingerprint !== 'string') {
    return NextResponse.json({ error: 'fingerprint is required' }, { status: 400, headers: corsHeaders(origin) })
  }

  // Rate limit
  if (!checkRateLimit(product as string)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429, headers: corsHeaders(origin) })
  }

  const str = (v: unknown, max: number) =>
    typeof v === 'string' ? v.trim().slice(0, max) : null

  const env = typeof body.environment === 'string' && VALID_ENVIRONMENTS.includes(body.environment)
    ? body.environment
    : 'production'

  const metadata = typeof body.metadata === 'object' && body.metadata !== null
    ? body.metadata
    : {}

  const metaStr = JSON.stringify(metadata)

  const insert: AutoErrorInsert = {
    product: (product as string).trim(),
    error_message: error_message.trim().slice(0, 2000),
    stack_trace: str(body.stack_trace, 10000) ?? undefined,
    error_type: error_type as AutoErrorInsert['error_type'],
    source: source as AutoErrorInsert['source'],
    request_url: str(body.request_url, 2000) ?? undefined,
    request_method: str(body.request_method, 20) ?? undefined,
    response_status: typeof body.response_status === 'number' ? body.response_status : undefined,
    current_route: str(body.current_route, 500) ?? undefined,
    app_version: str(body.app_version, 50) ?? undefined,
    user_agent: str(body.user_agent, 500) ?? undefined,
    user_id: isValidUuid(body.user_id) ? (body.user_id as string) : undefined,
    environment: env as AutoErrorInsert['environment'],
    fingerprint: (fingerprint as string).trim().slice(0, 64),
    metadata: metaStr.length <= 5000 ? metadata as Record<string, unknown> : {},
  }

  const supabase = createServiceClient()
  const { data: error_row, error: insertError } = await supabase
    .from('auto_errors')
    .insert(insert)
    .select('id')
    .single()

  if (insertError || !error_row) {
    console.error('[BCC] auto_errors insert error:', insertError)
    return NextResponse.json({ error: 'Failed to record error' }, { status: 500, headers: corsHeaders(origin) })
  }

  return NextResponse.json({ id: error_row.id, status: 'received' }, { status: 201, headers: corsHeaders(origin) })
}
