import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/bcc/export/errors
 *
 * Exports error groups as CSV or JSON.
 * Requires BCC team authentication.
 *
 * Query params:
 *   format  - 'csv' | 'json' (default: 'csv')
 *   product - filter by product id (optional)
 *   status  - comma-separated statuses (optional)
 */

function escapeCSV(val: string | null | undefined): string {
  if (val === null || val === undefined) return ''
  const str = String(val)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()

  // Verify authentication
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const format = searchParams.get('format') ?? 'csv'
  const productFilter = searchParams.get('product')
  const statusParam = searchParams.get('status')

  // Fetch error groups
  let groupsQuery = supabase
    .from('error_groups')
    .select('fingerprint, product, error_message, error_type, source, occurrence_count, affected_users, first_seen, last_seen, occurrences_24h, occurrences_7d')
    .order('last_seen', { ascending: false })
    .limit(5000)

  if (productFilter && productFilter !== 'all') {
    groupsQuery = groupsQuery.eq('product', productFilter)
  }

  const { data: groups, error: groupsError } = await groupsQuery

  if (groupsError) {
    return NextResponse.json({ error: 'Failed to fetch errors' }, { status: 500 })
  }

  // Fetch status overrides to join with groups
  const fingerprints = (groups ?? []).map((g) => g.fingerprint)
  let statusMap: Record<string, string> = {}

  if (fingerprints.length > 0) {
    const { data: statusRows } = await supabase
      .from('error_group_status')
      .select('fingerprint, status')
      .in('fingerprint', fingerprints)

    for (const row of statusRows ?? []) {
      statusMap[row.fingerprint] = row.status
    }
  }

  // Merge status into groups
  const enriched = (groups ?? []).map((g) => ({
    ...g,
    status: statusMap[g.fingerprint] ?? 'active',
  }))

  // Filter by status
  let filtered = enriched
  if (statusParam) {
    const statuses = statusParam.split(',').filter(Boolean)
    filtered = enriched.filter((g) => statuses.includes(g.status))
  }

  const dateStr = new Date().toISOString().slice(0, 10)

  if (format === 'json') {
    return new NextResponse(JSON.stringify(filtered, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="bcc-errors-${dateStr}.json"`,
      },
    })
  }

  // CSV
  const CSV_COLUMNS = [
    'fingerprint', 'product', 'error_message', 'error_type', 'source',
    'occurrence_count', 'affected_users', 'occurrences_24h', 'occurrences_7d',
    'first_seen', 'last_seen', 'status',
  ]

  const header = CSV_COLUMNS.join(',')
  const rows = filtered.map((g) => {
    const record = g as Record<string, unknown>
    return CSV_COLUMNS.map((col) => escapeCSV(record[col] as string)).join(',')
  })

  const csv = [header, ...rows].join('\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="bcc-errors-${dateStr}.csv"`,
    },
  })
}
