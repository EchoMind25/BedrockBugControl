import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { DeployCorrelationBucket } from '@/types'

/**
 * GET /api/bcc/deploy-correlation/[deployId]
 *
 * Returns error counts in 15-minute buckets for ±2 hours around a deployment,
 * plus any new error fingerprints introduced by the deploy.
 *
 * Called by DeployCard client component when the user expands a deploy card.
 * Requires BCC team authentication.
 */

interface RouteParams {
  params: Promise<{ deployId: string }>
}

interface NewError {
  fingerprint: string
  error_message: string
}

interface CorrelationResponse {
  buckets: DeployCorrelationBucket[]
  newErrors: NewError[]
  deployedAt: string
  product: string
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const supabase = await createClient()

  // Verify authentication
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { deployId } = await params

  // Fetch the deployment
  const { data: deployment, error: deployError } = await supabase
    .from('deployments')
    .select('id, product, deployed_at')
    .eq('id', deployId)
    .single()

  if (deployError || !deployment) {
    return NextResponse.json({ error: 'Deployment not found' }, { status: 404 })
  }

  const deployMs = new Date(deployment.deployed_at).getTime()
  const windowStart = new Date(deployMs - 2 * 60 * 60 * 1000).toISOString()  // -2h
  const windowEnd = new Date(deployMs + 2 * 60 * 60 * 1000).toISOString()    // +2h
  const deployTimestamp = deployment.deployed_at

  // Fetch raw errors in the ±2h window (just need created_at for bucketing)
  const { data: rawErrors } = await supabase
    .from('auto_errors')
    .select('created_at, fingerprint, error_message')
    .eq('product', deployment.product)
    .gte('created_at', windowStart)
    .lte('created_at', windowEnd)
    .order('created_at', { ascending: true })

  const errors = rawErrors ?? []

  // Build 15-minute buckets
  // Each bucket's key = floor(timestamp to 15-min boundary)
  const bucketMap = new Map<number, number>()
  const BUCKET_MS = 15 * 60 * 1000

  for (const err of errors) {
    const ms = new Date(err.created_at).getTime()
    const bucketKey = Math.floor(ms / BUCKET_MS) * BUCKET_MS
    bucketMap.set(bucketKey, (bucketMap.get(bucketKey) ?? 0) + 1)
  }

  // Fill in all buckets in the window (even empty ones) for a clean chart
  const startBucketKey = Math.floor(new Date(windowStart).getTime() / BUCKET_MS) * BUCKET_MS
  const endBucketKey = Math.floor(new Date(windowEnd).getTime() / BUCKET_MS) * BUCKET_MS

  const buckets: DeployCorrelationBucket[] = []
  for (let key = startBucketKey; key <= endBucketKey; key += BUCKET_MS) {
    buckets.push({
      bucket: new Date(key).toISOString(),
      count: bucketMap.get(key) ?? 0,
    })
  }

  // Find new errors: fingerprints that appear AFTER the deploy but never before it
  const postDeployErrors = errors.filter(
    (e) => new Date(e.created_at).getTime() >= deployMs
  )
  const preDeployFingerprints = new Set(
    errors
      .filter((e) => new Date(e.created_at).getTime() < deployMs)
      .map((e) => e.fingerprint)
  )

  const newFingerprintMap = new Map<string, string>()
  for (const err of postDeployErrors) {
    if (!preDeployFingerprints.has(err.fingerprint) && !newFingerprintMap.has(err.fingerprint)) {
      newFingerprintMap.set(err.fingerprint, err.error_message)
      if (newFingerprintMap.size >= 3) break
    }
  }

  const newErrors: NewError[] = Array.from(newFingerprintMap.entries()).map(
    ([fingerprint, error_message]) => ({ fingerprint, error_message })
  )

  const response: CorrelationResponse = {
    buckets,
    newErrors,
    deployedAt: deployTimestamp,
    product: deployment.product,
  }

  return NextResponse.json(response)
}
