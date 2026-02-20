import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ErrorOccurrenceChart } from '@/components/charts/ErrorOccurrenceChart'
import { ErrorGroupStatusEditor } from '@/components/errors/ErrorGroupStatusEditor'
import { CopyPromptButton } from '@/components/errors/CopyPromptButton'
import type {
  ErrorGroup,
  ErrorGroupStatusRow,
  AutoError,
  DailyCount,
  ErrorGroupStatus,
} from '@/types'
import Link from 'next/link'
import { relativeTime } from '@/lib/utils/relativeTime'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ fingerprint: string }>
}

const SOURCE_BADGE: Record<string, string> = {
  client: 'bg-blue-900/40 text-blue-400 border-blue-700/40',
  server: 'bg-purple-900/40 text-purple-400 border-purple-700/40',
  edge_function: 'bg-orange-900/40 text-orange-400 border-orange-700/40',
}

const ERROR_TYPE_BADGE: Record<string, string> = {
  unhandled_exception: 'bg-red-900/40 text-red-400 border-red-700/40',
  api_error: 'bg-yellow-900/40 text-yellow-400 border-yellow-700/40',
  client_crash: 'bg-orange-900/40 text-orange-400 border-orange-700/40',
  edge_function_error: 'bg-purple-900/40 text-purple-400 border-purple-700/40',
}

export default async function ErrorDetailPage({ params }: PageProps) {
  const { fingerprint } = await params
  const supabase = await createClient()

  // Fetch error group
  const { data: group } = await supabase
    .from('error_groups')
    .select('*')
    .eq('fingerprint', fingerprint)
    .single()

  if (!group) notFound()
  const errorGroup = group as ErrorGroup

  // Parallel fetches
  const [statusResult, occurrencesResult, recentResult, productResult, nearbyDeployResult] = await Promise.all([
    supabase
      .from('error_group_status')
      .select('*')
      .eq('fingerprint', fingerprint)
      .eq('product', errorGroup.product)
      .single(),

    // 30-day daily occurrence counts
    supabase
      .from('auto_errors')
      .select('created_at')
      .eq('fingerprint', fingerprint)
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),

    // Recent 20 individual occurrences
    supabase
      .from('auto_errors')
      .select('*')
      .eq('fingerprint', fingerprint)
      .order('created_at', { ascending: false })
      .limit(20),

    supabase.from('bcc_products').select('*').eq('id', errorGroup.product).single(),

    // Find nearby deployment: any deploy for same product within 1h of first_seen
    supabase
      .from('deployments')
      .select('id, commit_message, commit_hash, deployed_at')
      .eq('product', errorGroup.product)
      .gte('deployed_at', new Date(new Date(errorGroup.first_seen).getTime() - 60 * 60 * 1000).toISOString())
      .lte('deployed_at', new Date(new Date(errorGroup.first_seen).getTime() + 60 * 60 * 1000).toISOString())
      .order('deployed_at', { ascending: false })
      .limit(1)
      .single(),
  ])

  const statusRow = statusResult.data as ErrorGroupStatusRow | null
  const currentStatus: ErrorGroupStatus = statusRow?.status ?? 'active'
  const currentNotes = statusRow?.notes ?? null

  // Deploy correlation (Phase 3)
  const nearbyDeploy = nearbyDeployResult.data as {
    id: string
    commit_message: string | null
    commit_hash: string | null
    deployed_at: string
  } | null

  // Build 30-day occurrence chart data
  const dayMap: Record<string, number> = {}
  for (const row of occurrencesResult.data ?? []) {
    const day = (row.created_at as string).slice(0, 10)
    dayMap[day] = (dayMap[day] ?? 0) + 1
  }
  const occurrenceData: DailyCount[] = Object.entries(dayMap)
    .map(([day, count]) => ({ day, count }))
    .sort((a, b) => a.day.localeCompare(b.day))

  const recentOccurrences = (recentResult.data ?? []) as AutoError[]
  const productName = productResult.data?.display_name ?? errorGroup.product
  const repoUrl = productResult.data?.repo_url ?? null

  // Generate Claude fix prompt
  const fixPrompt = [
    `## Error Analysis Request`,
    ``,
    `**Product:** ${productName}`,
    `**Error Type:** ${errorGroup.error_type}`,
    `**Source:** ${errorGroup.source}`,
    `**Error Message:**`,
    `\`\`\``,
    errorGroup.error_message,
    `\`\`\``,
    ``,
    `**Stack Trace:**`,
    `\`\`\``,
    errorGroup.sample_stack_trace ?? 'No stack trace available',
    `\`\`\``,
    ``,
    `**Stats:** ${errorGroup.occurrence_count} total occurrences, ${errorGroup.affected_users} affected users`,
    `**First seen:** ${errorGroup.first_seen}`,
    `**Last seen:** ${errorGroup.last_seen}`,
    ``,
    `Please perform a root cause analysis of this error. Explain:`,
    `1. What is causing this error`,
    `2. Where in the code the fix should be applied`,
    `3. The specific code change needed`,
    `4. Any defensive checks to prevent recurrence`,
  ].join('\n')

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link href="/errors" className="text-xs text-slate-500 hover:text-slate-300 transition-colors mb-3 inline-block">
          ← Back to Errors
        </Link>
        <div className="flex flex-wrap items-start gap-2 mb-3">
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${SOURCE_BADGE[errorGroup.source] ?? 'text-slate-400 bg-slate-800 border-slate-700'}`}>
            {errorGroup.source}
          </span>
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${ERROR_TYPE_BADGE[errorGroup.error_type] ?? 'text-slate-400 bg-slate-800 border-slate-700'}`}>
            {errorGroup.error_type.replace(/_/g, ' ')}
          </span>
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border text-slate-400 bg-slate-800 border-slate-700">
            {productName}
          </span>
        </div>
        <pre className="text-slate-100 text-sm font-mono whitespace-pre-wrap break-words bg-slate-800/60 border border-slate-700/50 rounded-xl p-4">
          {errorGroup.error_message}
        </pre>
      </div>

      {/* Deploy correlation note (Phase 3) */}
      {nearbyDeploy && (
        <div className="mb-5 flex items-center gap-3 bg-amber-900/15 border border-amber-700/40 rounded-xl px-4 py-3">
          <span className="text-amber-400 flex-shrink-0">🚀</span>
          <p className="text-sm text-amber-200 flex-1 min-w-0">
            This error first appeared shortly after a deploy:{' '}
            <span className="font-medium">
              {nearbyDeploy.commit_message?.slice(0, 60) ?? nearbyDeploy.commit_hash?.slice(0, 7) ?? 'Unknown commit'}
            </span>{' '}
            at {new Date(nearbyDeploy.deployed_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}.
          </p>
          <Link
            href={`/deploys?range=30d`}
            className="text-xs text-amber-300 border border-amber-700/50 hover:bg-amber-900/30 px-2.5 py-1 rounded-lg flex-shrink-0 transition-colors"
          >
            View deploy →
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-5">
          {/* Occurrence Timeline */}
          <section className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">
              Occurrences — Last 30 Days
            </h2>
            <ErrorOccurrenceChart data={occurrenceData} />
          </section>

          {/* Stack Trace */}
          {errorGroup.sample_stack_trace && (
            <section className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
              <details>
                <summary className="text-xs font-semibold text-slate-500 uppercase tracking-widest cursor-pointer hover:text-slate-300">
                  Sample Stack Trace
                </summary>
                <pre className="mt-3 text-xs text-slate-400 font-mono whitespace-pre-wrap break-words bg-slate-900 border border-slate-700/50 rounded-lg p-3 overflow-x-auto">
                  {errorGroup.sample_stack_trace}
                </pre>
              </details>
            </section>
          )}

          {/* Claude Fix Prompt */}
          <section className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">
              Root Cause Analysis Prompt
            </h2>
            <textarea
              readOnly
              value={fixPrompt}
              rows={8}
              className="w-full bg-slate-900 border border-slate-700/50 text-xs text-slate-400 font-mono rounded-lg p-3 resize-y focus:outline-none"
            />
            <div className="flex gap-2 mt-2">
              <CopyPromptButton text={fixPrompt} />
              <a
                href="https://claude.ai/new"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-slate-400 border border-slate-700/50 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg transition-colors"
              >
                Open Claude →
              </a>
            </div>
          </section>

          {/* Recent Occurrences */}
          <section className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700/50">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
                Recent Occurrences
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-700/50">
                    {['Time', 'User', 'Route', 'Request', 'Details'].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-left font-medium text-slate-500 uppercase tracking-wide">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recentOccurrences.map((occ) => (
                    <tr key={occ.id} className="border-b border-slate-700/30 hover:bg-slate-700/20">
                      <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{relativeTime(occ.created_at)}</td>
                      <td className="px-4 py-2.5 text-slate-400 font-mono whitespace-nowrap">
                        {occ.user_id?.slice(0, 8) ?? '—'}
                      </td>
                      <td className="px-4 py-2.5 text-slate-400 font-mono max-w-[160px] truncate">
                        {occ.current_route ?? '—'}
                      </td>
                      <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">
                        {occ.request_method && occ.request_url
                          ? `${occ.request_method} ${occ.request_url.slice(0, 40)}`
                          : '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        <details className="cursor-pointer">
                          <summary className="text-slate-600 hover:text-slate-400">more</summary>
                          <pre className="mt-1 text-[10px] text-slate-500 whitespace-pre-wrap bg-slate-900 rounded p-2 max-w-xs">
                            {JSON.stringify(
                              {
                                user_agent: occ.user_agent,
                                response_status: occ.response_status,
                                environment: occ.environment,
                                app_version: occ.app_version,
                                metadata: occ.metadata,
                              },
                              null,
                              2
                            )}
                          </pre>
                        </details>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {recentOccurrences.length === 0 && (
                <div className="flex items-center justify-center py-8">
                  <p className="text-slate-600 text-sm">No individual occurrences found.</p>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Status management */}
          <section className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">
              Status
            </h2>
            <ErrorGroupStatusEditor
              fingerprint={fingerprint}
              product={errorGroup.product}
              initialStatus={currentStatus}
              initialNotes={currentNotes}
            />
          </section>

          {/* Stats */}
          <section className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">
              Stats
            </h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">Total occurrences</dt>
                <dd className="text-slate-300 font-medium">{errorGroup.occurrence_count}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Last 24h</dt>
                <dd className="text-slate-300 font-medium">{errorGroup.occurrences_24h}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Last 7 days</dt>
                <dd className="text-slate-300 font-medium">{errorGroup.occurrences_7d}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Affected users</dt>
                <dd className="text-slate-300 font-medium">{errorGroup.affected_users}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">First seen</dt>
                <dd className="text-slate-400 text-xs">{new Date(errorGroup.first_seen).toLocaleDateString()}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Last seen</dt>
                <dd className="text-slate-400 text-xs">{relativeTime(errorGroup.last_seen)}</dd>
              </div>
            </dl>
          </section>

          {/* Fingerprint */}
          <section className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">
              Fingerprint
            </h2>
            <code className="text-xs text-slate-400 font-mono">{fingerprint}</code>
          </section>
        </div>
      </div>
    </div>
  )
}
