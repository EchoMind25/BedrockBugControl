import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

const MAX_SIZE_BYTES = 5 * 1024 * 1024 // 5 MB

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
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(origin) })
  }

  // --- Parse multipart form ---
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400, headers: corsHeaders(origin) })
  }

  const file = formData.get('file') as File | null
  const product = formData.get('product') as string | null

  if (!file) {
    return NextResponse.json({ error: 'file is required' }, { status: 400, headers: corsHeaders(origin) })
  }
  if (!product || typeof product !== 'string') {
    return NextResponse.json({ error: 'product is required' }, { status: 400, headers: corsHeaders(origin) })
  }

  // --- Validate file type and size ---
  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'File must be an image' }, { status: 400, headers: corsHeaders(origin) })
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: 'File exceeds 5 MB limit' }, { status: 413, headers: corsHeaders(origin) })
  }

  // --- Generate filename ---
  const timestamp = Date.now()
  const randomId = Math.random().toString(36).slice(2, 8)
  const ext = file.type === 'image/png' ? 'png' : 'jpg'
  const filename = `${product.trim()}/${timestamp}_${randomId}.${ext}`

  // --- Upload to Supabase Storage ---
  const supabase = createServiceClient()
  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const { data, error } = await supabase.storage
    .from('bug-screenshots')
    .upload(filename, buffer, {
      contentType: file.type,
      upsert: false,
    })

  if (error || !data) {
    console.error('[BCC] Storage upload error:', error)
    return NextResponse.json(
      { error: 'Failed to upload screenshot' },
      { status: 500, headers: corsHeaders(origin) }
    )
  }

  // Return the storage path — dashboard generates signed URLs on demand
  return NextResponse.json(
    { screenshot_url: data.path },
    { status: 201, headers: corsHeaders(origin) }
  )
}
