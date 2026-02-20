import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * Vercel Deployment Webhook — POST /api/webhook/vercel-deploy
 *
 * Vercel sends this on deployment events. We:
 * 1. Verify HMAC-SHA1 signature via x-vercel-signature header
 * 2. Process only deployment.succeeded events
 * 3. Map Vercel project name → BCC product ID
 * 4. Insert into deployments table
 *
 * Always respond 200 (Vercel retries on non-2xx).
 */

async function verifyVercelSignature(body: string, signature: string, secret: string): Promise<boolean> {
  const encoder = new TextEncoder()
  const keyData = encoder.encode(secret)
  const msgData = encoder.encode(body)

  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  )
  const sigBuffer = await crypto.subtle.sign('HMAC', key, msgData)
  const computedHex = Array.from(new Uint8Array(sigBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  // Constant-time comparison
  if (computedHex.length !== signature.length) return false
  let diff = 0
  for (let i = 0; i < computedHex.length; i++) {
    diff |= computedHex.charCodeAt(i) ^ signature.charCodeAt(i)
  }
  return diff === 0
}

/** Parse VERCEL_PROJECT_MAP env var: "vercel-name:bcc-id,vercel-name2:bcc-id2" */
function buildProjectMap(): Map<string, string> {
  const map = new Map<string, string>()
  const raw = process.env.VERCEL_PROJECT_MAP ?? ''
  for (const pair of raw.split(',')) {
    const [vercelName, bccId] = pair.trim().split(':')
    if (vercelName && bccId) map.set(vercelName.trim(), bccId.trim())
  }
  return map
}

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.VERCEL_WEBHOOK_SECRET

  // Read raw body for signature verification
  const rawBody = await request.text()
  const signature = request.headers.get('x-vercel-signature') ?? ''

  // Verify signature — fail-closed: if secret is not configured, reject all requests
  if (!webhookSecret) {
    console.error('[BCC] VERCEL_WEBHOOK_SECRET is not set — rejecting webhook')
    return NextResponse.json({ ok: true }) // 200 to avoid Vercel retries, but log + discard
  }
  const isValid = await verifyVercelSignature(rawBody, signature, webhookSecret)
  if (!isValid) {
    console.warn('[BCC] Vercel webhook signature mismatch')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 200 }) // still 200 to prevent retries
  }

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(rawBody)
  } catch {
    console.warn('[BCC] Vercel webhook: invalid JSON body')
    return NextResponse.json({ ok: true })
  }

  // Only process deployment.succeeded events
  if (payload.type !== 'deployment.succeeded') {
    return NextResponse.json({ ok: true, skipped: true })
  }

  const deploymentData = payload.payload as Record<string, unknown> | undefined
  const deployment = deploymentData?.deployment as Record<string, unknown> | undefined
  const project = deploymentData?.project as Record<string, unknown> | undefined

  if (!deployment || !project) {
    console.warn('[BCC] Vercel webhook: missing deployment/project in payload')
    return NextResponse.json({ ok: true })
  }

  const projectName = (project.name as string) ?? ''
  const projectMap = buildProjectMap()
  const productId = projectMap.get(projectName)

  if (!productId) {
    console.warn(`[BCC] Vercel webhook: project "${projectName}" not in VERCEL_PROJECT_MAP`)
    return NextResponse.json({ ok: true, skipped: true })
  }

  const meta = (deployment.meta as Record<string, unknown>) ?? {}

  // Use Vercel's actual deploy timestamp: readyAt (when succeeded) or createdAt, both Unix ms
  const readyAtMs = typeof deployment.readyAt === 'number' ? deployment.readyAt : null
  const createdAtMs = typeof deployment.createdAt === 'number' ? deployment.createdAt : null
  const deployedAt = readyAtMs
    ? new Date(readyAtMs).toISOString()
    : createdAtMs
      ? new Date(createdAtMs).toISOString()
      : new Date().toISOString()

  const supabase = createServiceClient()
  const { error: insertError } = await supabase.from('deployments').insert({
    product: productId,
    commit_hash: (meta.githubCommitSha as string)?.slice(0, 40) ?? null,
    commit_message: (meta.githubCommitMessage as string)?.slice(0, 500) ?? null,
    branch: (meta.githubCommitRef as string)?.slice(0, 100) ?? 'main',
    deployed_by: (meta.githubCommitAuthorLogin as string)?.slice(0, 100) ?? 'vercel-auto',
    environment: 'production',
    deploy_url: (deployment.url as string)?.slice(0, 500) ?? null,
    deployed_at: deployedAt,
  })

  if (insertError) {
    console.error('[BCC] deployments insert error:', insertError)
  }

  return NextResponse.json({ ok: true })
}
