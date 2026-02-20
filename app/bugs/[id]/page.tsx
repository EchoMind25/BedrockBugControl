import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { BugDetailClient } from '@/components/bugs/BugDetailClient'
import { AiAssistPanel } from '@/components/bugs/AiAssistPanel'
import type { BugReport, BccProduct, AiCategorization } from '@/types'

interface PageProps {
  params: Promise<{ id: string }>
}

const SEVERITY_BADGE: Record<string, string> = {
  blocker: 'bg-red-500/15 text-red-400 border border-red-500/30',
  major: 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30',
  minor: 'bg-blue-500/15 text-blue-400 border border-blue-500/30',
}

const PRODUCT_LABEL: Record<string, string> = {
  'bedrock-chat': 'Bedrock Chat',
  echosafe: 'EchoSafe',
  quoteflow: 'QuoteFlow',
}

function parseUserAgent(ua: string | null): string {
  if (!ua) return 'Unknown'
  const browser = ua.match(/(Chrome|Firefox|Safari|Edge|Opera)\/[\d.]+/)?.[0] ?? ''
  const os = ua.match(/\(([^)]+)\)/)?.[1]?.split(';')[0] ?? ''
  return [browser, os].filter(Boolean).join(' / ') || ua.slice(0, 80)
}

function formatTs(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default async function BugDetailPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()

  const { data: bug, error } = await supabase
    .from('bug_reports')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !bug) {
    notFound()
  }

  const { data: productRow } = await supabase
    .from('bcc_products')
    .select('*')
    .eq('id', bug.product)
    .single()

  const typedBug = bug as BugReport
  const typedProduct = (productRow ?? {
    id: bug.product,
    display_name: PRODUCT_LABEL[bug.product] ?? bug.product,
    production_url: null,
    repo_url: null,
    health_endpoint: null,
    is_active: true,
    created_at: bug.created_at,
  }) as BccProduct

  // Generate signed URL for screenshot if one exists
  let screenshotSignedUrl: string | null = null
  if (typedBug.screenshot_url) {
    const { data: signedData } = await supabase.storage
      .from('bug-screenshots')
      .createSignedUrl(typedBug.screenshot_url, 3600) // 1hr expiry
    screenshotSignedUrl = signedData?.signedUrl ?? null
  }

  const shortId = id.slice(0, 8).toUpperCase()

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      {/* Back link */}
      <Link
        href="/bugs"
        className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 mb-5 transition-colors"
      >
        ← Back to Bugs
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${SEVERITY_BADGE[typedBug.severity]}`}>
          {typedBug.severity}
        </span>
        <span className="text-xs text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
          {typedProduct.display_name}
        </span>
        <span className="text-sm text-slate-500 font-mono">Bug #{shortId}</span>
        <span className="text-xs text-slate-500 ml-auto">
          {formatTs(typedBug.created_at)}
        </span>
      </div>

      {/* Two-column layout */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left: Main content */}
        <div className="flex-1 min-w-0 space-y-5">
          {/* Description */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
            <h2 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">Description</h2>
            <p className="text-slate-200 whitespace-pre-wrap text-sm leading-relaxed">
              {typedBug.description}
            </p>
          </div>

          {/* Steps to Reproduce */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
            <h2 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">Steps to Reproduce</h2>
            <p className="text-slate-200 whitespace-pre-wrap text-sm leading-relaxed">
              {typedBug.steps_to_reproduce}
            </p>
          </div>

          {/* Screenshot */}
          {screenshotSignedUrl && (
            <ScreenshotViewer url={screenshotSignedUrl} />
          )}

          {/* Metadata (collapsible) */}
          <MetadataSection bug={typedBug} uaParsed={parseUserAgent(typedBug.user_agent)} />

          {/* AI Assist Panel (Phase 3) */}
          <AiAssistPanel
            bugId={typedBug.id}
            initialCategorization={(typedBug as unknown as { ai_categorization?: AiCategorization | null }).ai_categorization ?? null}
          />
        </div>

        {/* Right: Triage panel (sticky on desktop) */}
        <div className="lg:w-72 xl:w-80 flex-shrink-0">
          <div className="lg:sticky lg:top-6 bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
            <h2 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-4">Triage</h2>
            <BugDetailClient bug={typedBug} product={typedProduct} />
          </div>
        </div>
      </div>
    </div>
  )
}

// Screenshot viewer with lightbox
function ScreenshotViewer({ url }: { url: string }) {
  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
      <h2 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">Screenshot</h2>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="block group"
        title="Open full size"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt="Bug screenshot"
          className="rounded-lg border border-slate-700 max-h-64 object-contain group-hover:opacity-80 transition-opacity cursor-zoom-in"
        />
        <p className="text-xs text-slate-500 mt-2">Click to open full size ↗</p>
      </a>
    </div>
  )
}

// Collapsible metadata section
function MetadataSection({ bug, uaParsed }: { bug: BugReport; uaParsed: string }) {
  return (
    <details className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
      <summary className="px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-800 transition-colors select-none">
        Metadata
      </summary>
      <div className="px-5 pb-4 pt-2 space-y-2.5">
        {[
          { label: 'Route', value: bug.current_route, mono: true },
          { label: 'Browser / OS', value: uaParsed },
          { label: 'Viewport', value: bug.viewport },
          { label: 'App Version', value: bug.app_version },
          { label: 'Username', value: bug.username },
          { label: 'Bug ID', value: bug.id, mono: true },
        ].map(({ label, value, mono }) =>
          value ? (
            <div key={label} className="flex items-start gap-3">
              <span className="text-xs text-slate-500 w-28 flex-shrink-0 pt-0.5">{label}</span>
              <span className={`text-xs text-slate-300 break-all ${mono ? 'font-mono' : ''}`}>
                {value}
              </span>
            </div>
          ) : null
        )}
      </div>
    </details>
  )
}
