import { Resend } from 'resend'
import type { BugReport, BccProduct } from '@/types'

const resend = new Resend(process.env.RESEND_API_KEY)

const FROM = 'BCC <bugs@bedrockai.systems>'
const NOTIFY_EMAIL = 'braxton@bedrockai.systems'

function isResendConfigured() {
  return process.env.RESEND_API_KEY && !process.env.RESEND_API_KEY.startsWith('re_REPLACE')
}

// ============================================================
// Phase 1: Blocker Bug Alerts
// ============================================================

export async function sendBlockerAlert(bug: BugReport, productName: string) {
  if (!isResendConfigured()) {
    console.warn('[BCC] RESEND_API_KEY not configured — skipping blocker email')
    return
  }

  const dashboardUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const shortDesc = bug.description.slice(0, 50)
  const subject = `[BCC] 🔴 BLOCKER: ${shortDesc}${shortDesc.length === 50 ? '…' : ''} — ${productName}`

  const bodyText = [
    `New blocker bug reported in ${productName}`,
    '',
    `Description: ${bug.description.slice(0, 300)}${bug.description.length > 300 ? '…' : ''}`,
    `Steps: ${bug.steps_to_reproduce.slice(0, 300)}${bug.steps_to_reproduce.length > 300 ? '…' : ''}`,
    `Reporter: ${bug.username ?? 'Anonymous'}`,
    `Route: ${bug.current_route ?? 'Unknown'}`,
    '',
    `View in BCC: ${dashboardUrl}/bugs/${bug.id}`,
  ].join('\n')

  const bodyHtml = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
      <h2 style="color:#ef4444;">🔴 New BLOCKER Bug — ${productName}</h2>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:8px 0;color:#6b7280;width:100px;">Description</td>
            <td style="padding:8px 0;">${escapeHtml(bug.description.slice(0, 300))}${bug.description.length > 300 ? '…' : ''}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Steps</td>
            <td style="padding:8px 0;white-space:pre-wrap;">${escapeHtml(bug.steps_to_reproduce.slice(0, 300))}${bug.steps_to_reproduce.length > 300 ? '…' : ''}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Reporter</td>
            <td style="padding:8px 0;">${escapeHtml(bug.username ?? 'Anonymous')}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Route</td>
            <td style="padding:8px 0;font-family:monospace;">${escapeHtml(bug.current_route ?? 'Unknown')}</td></tr>
      </table>
      <br/>
      <a href="${dashboardUrl}/bugs/${bug.id}"
         style="display:inline-block;background:#3b82f6;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;">
        View in BCC Dashboard →
      </a>
    </div>
  `

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: [NOTIFY_EMAIL],
      subject,
      text: bodyText,
      html: bodyHtml,
    })
    if (error) console.error('[BCC] Resend error:', error)
  } catch (err) {
    console.error('[BCC] Failed to send blocker alert email:', err)
  }
}

// ============================================================
// Phase 2: Uptime Down / Recovery Alerts
// ============================================================

export async function sendUptimeDownAlert(
  product: BccProduct,
  errorMessage: string,
  statusCode: number | null
) {
  if (!isResendConfigured()) {
    console.warn('[BCC] RESEND_API_KEY not configured — skipping downtime email')
    return
  }

  const dashboardUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const subject = `[BCC] ⚠️ ${product.display_name} is DOWN`

  const bodyText = [
    `${product.display_name} is not responding.`,
    '',
    `Status: ${statusCode ?? 'unreachable'}`,
    `Error: ${errorMessage}`,
    `Endpoint: ${product.health_endpoint ?? 'unknown'}`,
    `Detected: ${new Date().toISOString()}`,
    '',
    `View in BCC: ${dashboardUrl}/uptime`,
  ].join('\n')

  const bodyHtml = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
      <h2 style="color:#ef4444;">⚠️ ${escapeHtml(product.display_name)} is DOWN</h2>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:8px 0;color:#6b7280;width:100px;">Status</td>
            <td style="padding:8px 0;">${statusCode ?? 'unreachable'}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Error</td>
            <td style="padding:8px 0;">${escapeHtml(errorMessage)}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Endpoint</td>
            <td style="padding:8px 0;font-family:monospace;">${escapeHtml(product.health_endpoint ?? 'unknown')}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Detected</td>
            <td style="padding:8px 0;">${new Date().toISOString()}</td></tr>
      </table>
      <br/>
      <a href="${dashboardUrl}/uptime"
         style="display:inline-block;background:#ef4444;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;">
        View Uptime in BCC →
      </a>
    </div>
  `

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: [NOTIFY_EMAIL],
      subject,
      text: bodyText,
      html: bodyHtml,
    })
    if (error) console.error('[BCC] Resend downtime error:', error)
  } catch (err) {
    console.error('[BCC] Failed to send downtime email:', err)
  }
}

export async function sendUptimeRecoveryAlert(
  product: BccProduct,
  responseTimeMs: number,
  downtimeMs: number | null = null
) {
  if (!isResendConfigured()) {
    console.warn('[BCC] RESEND_API_KEY not configured — skipping recovery email')
    return
  }

  const dashboardUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const durationStr = downtimeMs !== null ? formatDuration(downtimeMs) : null
  const subject = durationStr
    ? `[BCC] ✅ ${product.display_name} recovered (${durationStr} downtime)`
    : `[BCC] ✅ ${product.display_name} recovered`

  const bodyText = [
    `${product.display_name} is back online.`,
    '',
    `Current response time: ${responseTimeMs}ms`,
    durationStr ? `Downtime duration: ~${durationStr}` : null,
    `Recovered at: ${new Date().toISOString()}`,
    '',
    `View in BCC: ${dashboardUrl}/uptime`,
  ].filter(Boolean).join('\n')

  const bodyHtml = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
      <h2 style="color:#10b981;">✅ ${escapeHtml(product.display_name)} Recovered</h2>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:8px 0;color:#6b7280;width:140px;">Response time</td>
            <td style="padding:8px 0;">${responseTimeMs}ms</td></tr>
        ${durationStr ? `<tr><td style="padding:8px 0;color:#6b7280;">Downtime</td>
            <td style="padding:8px 0;">~${escapeHtml(durationStr)}</td></tr>` : ''}
        <tr><td style="padding:8px 0;color:#6b7280;">Recovered at</td>
            <td style="padding:8px 0;">${new Date().toISOString()}</td></tr>
      </table>
      <br/>
      <a href="${dashboardUrl}/uptime"
         style="display:inline-block;background:#10b981;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;">
        View Uptime in BCC →
      </a>
    </div>
  `

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: [NOTIFY_EMAIL],
      subject,
      text: bodyText,
      html: bodyHtml,
    })
    if (error) console.error('[BCC] Resend recovery error:', error)
  } catch (err) {
    console.error('[BCC] Failed to send recovery email:', err)
  }
}

// ============================================================
// Phase 3: Error Spike Alerts
// ============================================================

interface SpikeAlertParams {
  productName: string
  productId: string
  currentCount: number
  baselineAvg: number
  multiplier: number
  topMessages: string[]
}

export async function sendSpikeAlert({
  productName,
  productId,
  currentCount,
  baselineAvg,
  multiplier,
  topMessages,
}: SpikeAlertParams) {
  if (!isResendConfigured()) {
    console.warn('[BCC] RESEND_API_KEY not configured — skipping spike alert email')
    return
  }

  const dashboardUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const multiplierStr = multiplier.toFixed(1)
  const baselineStr = baselineAvg > 0 ? baselineAvg.toFixed(1) : '0'
  const subject = `[BCC] ⚠️ Error spike in ${productName}: ${multiplierStr}x normal rate`

  const topList = topMessages.slice(0, 3).map((m, i) => `${i + 1}. ${m.slice(0, 120)}`).join('\n')

  const bodyText = [
    `Error spike detected in ${productName}.`,
    '',
    `Errors in last hour: ${currentCount}`,
    `Baseline (7-day avg/hr): ${baselineStr}`,
    `Spike multiplier: ${multiplierStr}x`,
    '',
    topMessages.length > 0 ? `Top errors:\n${topList}` : null,
    '',
    `View errors: ${dashboardUrl}/errors?product=${productId}`,
    `Acknowledge: ${dashboardUrl}/overview`,
  ].filter(Boolean).join('\n')

  const topHtml = topMessages.slice(0, 3)
    .map((m) => `<li style="font-family:monospace;font-size:12px;color:#94a3b8;margin:4px 0;">${escapeHtml(m.slice(0, 120))}</li>`)
    .join('')

  const bodyHtml = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
      <h2 style="color:#f59e0b;">⚠️ Error Spike — ${escapeHtml(productName)}</h2>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:8px 0;color:#6b7280;width:160px;">Errors in last hour</td>
            <td style="padding:8px 0;font-weight:bold;color:#ef4444;">${currentCount}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Baseline (7d avg/hr)</td>
            <td style="padding:8px 0;">${baselineStr}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Spike multiplier</td>
            <td style="padding:8px 0;font-weight:bold;">${multiplierStr}x</td></tr>
      </table>
      ${topMessages.length > 0 ? `
      <p style="color:#6b7280;margin-top:16px;margin-bottom:4px;">Top errors:</p>
      <ul style="margin:0;padding-left:20px;">${topHtml}</ul>
      ` : ''}
      <br/>
      <a href="${dashboardUrl}/errors?product=${productId}"
         style="display:inline-block;background:#f59e0b;color:#000;padding:10px 20px;border-radius:6px;text-decoration:none;margin-right:8px;">
        View Errors →
      </a>
      <a href="${dashboardUrl}/overview"
         style="display:inline-block;background:#475569;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;">
        Acknowledge in BCC
      </a>
    </div>
  `

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: [NOTIFY_EMAIL],
      subject,
      text: bodyText,
      html: bodyHtml,
    })
    if (error) console.error('[BCC] Resend spike alert error:', error)
  } catch (err) {
    console.error('[BCC] Failed to send spike alert email:', err)
  }
}

// ============================================================
// Shared utilities
// ============================================================

function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60_000)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remainMinutes = minutes % 60
  return remainMinutes > 0 ? `${hours}h ${remainMinutes}m` : `${hours}h`
}

function escapeHtml(str: string) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
