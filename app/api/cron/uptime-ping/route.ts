import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendUptimeDownAlert, sendUptimeRecoveryAlert, sendSpikeAlert } from '@/lib/email/resend'
import type { BccProduct } from '@/types'

/**
 * GET /api/cron/uptime-ping
 *
 * Vercel Cron job — runs every 5 minutes.
 * 1. Pings health endpoints for all active products, records results,
 *    and sends email alerts on status changes.
 * 2. Runs error spike detection for all active products (Phase 3).
 */

const PING_TIMEOUT_MS = 10_000

// Default spike thresholds (overridden by bcc_settings if available)
const DEFAULT_SPIKE_MULTIPLIER = 3
const DEFAULT_SPIKE_COOLDOWN_HOURS = 2

async function pingEndpoint(url: string): Promise<{
  status_code: number | null
  response_time_ms: number
  is_healthy: boolean
  error_message: string | null
}> {
  const start = Date.now()
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS)
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: { 'User-Agent': 'BCC-UptimeMonitor/1.0' },
    })
    clearTimeout(timer)
    const response_time_ms = Date.now() - start
    const is_healthy = response.ok
    return {
      status_code: response.status,
      response_time_ms,
      is_healthy,
      error_message: is_healthy ? null : `HTTP ${response.status}`,
    }
  } catch (err) {
    return {
      status_code: null,
      response_time_ms: Date.now() - start,
      is_healthy: false,
      error_message: err instanceof Error ? err.message.slice(0, 500) : 'Unknown error',
    }
  }
}

async function detectSpikes(
  supabase: ReturnType<typeof createServiceClient>,
  products: BccProduct[],
  spikeMultiplier: number,
  cooldownHours: number
): Promise<void> {
  const now = Date.now()
  const oneHourAgo = new Date(now - 60 * 60 * 1000).toISOString()
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString()
  const cooldownAgo = new Date(now - cooldownHours * 60 * 60 * 1000).toISOString()

  await Promise.allSettled(
    products.map(async (product) => {
      try {
        // Count errors in last 1 hour
        const { count: currentCount } = await supabase
          .from('auto_errors')
          .select('*', { count: 'exact', head: true })
          .eq('product', product.id)
          .gte('created_at', oneHourAgo)

        const current = currentCount ?? 0

        // Count errors in last 7 days (excluding the last hour for baseline)
        const { count: sevenDayCount } = await supabase
          .from('auto_errors')
          .select('*', { count: 'exact', head: true })
          .eq('product', product.id)
          .gte('created_at', sevenDaysAgo)
          .lt('created_at', oneHourAgo)

        // Average per hour over the 7-day window (167 hours = 7*24 - 1)
        const baselineAvg = ((sevenDayCount ?? 0) / 167)

        const isNewErrors = baselineAvg === 0 && current > 5
        const isSpike = baselineAvg > 0 && current > baselineAvg * spikeMultiplier

        if (!isNewErrors && !isSpike) return

        const multiplier = baselineAvg > 0 ? current / baselineAvg : current

        // Cooldown check: skip if we already alerted for this product recently
        const { data: recentAlerts } = await supabase
          .from('error_spike_alerts')
          .select('id')
          .eq('product', product.id)
          .gte('alerted_at', cooldownAgo)
          .limit(1)

        if (recentAlerts && recentAlerts.length > 0) return

        // Get top error fingerprints + messages in the spike window
        const { data: topErrors } = await supabase
          .from('auto_errors')
          .select('fingerprint, error_message')
          .eq('product', product.id)
          .gte('created_at', oneHourAgo)
          .order('created_at', { ascending: false })
          .limit(100)

        const fpMap = new Map<string, string>()
        for (const e of topErrors ?? []) {
          if (!fpMap.has(e.fingerprint)) fpMap.set(e.fingerprint, e.error_message)
          if (fpMap.size >= 3) break
        }
        const topFingerprints = Array.from(fpMap.keys())
        const topMessages = Array.from(fpMap.values())

        // Insert spike alert record
        await supabase.from('error_spike_alerts').insert({
          product: product.id,
          current_count: current,
          baseline_avg: parseFloat(baselineAvg.toFixed(2)),
          spike_multiplier: parseFloat(multiplier.toFixed(1)),
          top_fingerprints: topFingerprints,
        })

        // Send email alert
        await sendSpikeAlert({
          productName: product.display_name,
          productId: product.id,
          currentCount: current,
          baselineAvg,
          multiplier,
          topMessages,
        })

        console.log(`[BCC] Spike detected for ${product.id}: ${current} errors (${multiplier.toFixed(1)}x baseline)`)
      } catch (err) {
        console.error(`[BCC] Spike detection failed for ${product.id}:`, err)
      }
    })
  )
}

export async function GET(request: NextRequest) {
  // Verify cron secret (Vercel sets Authorization: Bearer {CRON_SECRET})
  // Fail-closed: if CRON_SECRET is not configured, reject all requests
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error('[BCC] CRON_SECRET is not set — rejecting cron request')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (token !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()

  // Fetch ALL active products (used for both uptime pinging and spike detection)
  const { data: allProducts, error: productsError } = await supabase
    .from('bcc_products')
    .select('*')
    .eq('is_active', true)

  if (productsError || !allProducts) {
    console.error('[BCC] uptime-ping: failed to fetch products:', productsError)
    return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 })
  }

  const typedProducts = allProducts as BccProduct[]

  // Load spike settings from bcc_settings (fall back to defaults on error)
  let spikeMultiplier = DEFAULT_SPIKE_MULTIPLIER
  let cooldownHours = DEFAULT_SPIKE_COOLDOWN_HOURS
  try {
    const { data: settings } = await supabase
      .from('bcc_settings')
      .select('key, value')
      .in('key', ['spike_threshold_multiplier', 'spike_cooldown_hours'])

    for (const row of settings ?? []) {
      if (row.key === 'spike_threshold_multiplier') spikeMultiplier = parseFloat(row.value) || DEFAULT_SPIKE_MULTIPLIER
      if (row.key === 'spike_cooldown_hours') cooldownHours = parseFloat(row.value) || DEFAULT_SPIKE_COOLDOWN_HOURS
    }
  } catch {
    // Settings table may not exist yet — use defaults silently
  }

  // ── Uptime pings ─────────────────────────────────────────
  const productsWithHealth = typedProducts.filter((p) => p.health_endpoint)

  if (productsWithHealth.length > 0) {
    // Fetch previous checks for each product (to detect status changes)
    const prevChecksResult = await Promise.all(
      productsWithHealth.map((p) =>
        supabase
          .from('uptime_checks')
          .select('is_healthy, error_message, checked_at')
          .eq('product', p.id)
          .order('checked_at', { ascending: false })
          .limit(1)
          .single()
      )
    )

    const prevHealthMap = new Map<string, boolean | null>()
    const lastHealthyAtMap = new Map<string, string | null>()
    productsWithHealth.forEach((p, i) => {
      prevHealthMap.set(p.id, prevChecksResult[i].data?.is_healthy ?? null)
      lastHealthyAtMap.set(p.id, null)
    })

    // For products currently DOWN, find when the outage started
    const downingProducts = productsWithHealth.filter((p) => prevHealthMap.get(p.id) === false)
    if (downingProducts.length > 0) {
      const lastHealthyResults = await Promise.all(
        downingProducts.map((p) =>
          supabase
            .from('uptime_checks')
            .select('checked_at')
            .eq('product', p.id)
            .eq('is_healthy', true)
            .order('checked_at', { ascending: false })
            .limit(1)
            .single()
        )
      )
      downingProducts.forEach((p, i) => {
        lastHealthyAtMap.set(p.id, lastHealthyResults[i].data?.checked_at ?? null)
      })
    }

    // Ping all products in parallel
    const pingResults = await Promise.allSettled(
      productsWithHealth.map(async (p) => {
        const result = await pingEndpoint(p.health_endpoint!)
        return { product: p, result }
      })
    )

    const allOps: Promise<unknown>[] = []

    for (const settled of pingResults) {
      if (settled.status === 'rejected') continue

      const { product: p, result } = settled.value

      allOps.push(
        Promise.resolve(
          supabase.from('uptime_checks').insert({
            product: p.id,
            status_code: result.status_code,
            response_time_ms: result.response_time_ms,
            is_healthy: result.is_healthy,
            error_message: result.error_message,
            checked_at: new Date().toISOString(),
          })
        )
      )

      const prevHealthy = prevHealthMap.get(p.id)

      if (!result.is_healthy && prevHealthy === true) {
        allOps.push(sendUptimeDownAlert(p, result.error_message ?? 'Unknown error', result.status_code))
      } else if (result.is_healthy && prevHealthy === false) {
        const lastHealthyAt = lastHealthyAtMap.get(p.id) ?? null
        const downtimeMs = lastHealthyAt ? Date.now() - new Date(lastHealthyAt).getTime() : null
        allOps.push(sendUptimeRecoveryAlert(p, result.response_time_ms, downtimeMs))
      }
    }

    await Promise.allSettled(allOps)
  }

  // ── Spike detection (all products, runs every ping cycle) ──
  if (typedProducts.length > 0) {
    await detectSpikes(supabase, typedProducts, spikeMultiplier, cooldownHours)
  }

  return NextResponse.json({
    ok: true,
    checked: productsWithHealth.length,
    spike_checked: typedProducts.length,
    timestamp: new Date().toISOString(),
  })
}
