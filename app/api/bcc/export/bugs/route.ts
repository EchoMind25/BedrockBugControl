import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/bcc/export/bugs
 *
 * Exports bug reports as CSV or JSON.
 * Requires BCC team authentication.
 *
 * Query params:
 *   format  - 'csv' | 'json' (default: 'csv')
 *   product - filter by product id (optional)
 *   status  - comma-separated statuses (optional)
 *   severity - comma-separated severities (optional)
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
  const severityParam = searchParams.get('severity')

  let query = supabase
    .from('bug_reports')
    .select('id, product, severity, status, description, steps_to_reproduce, username, assigned_to, tags, resolution_notes, created_at, resolved_at')
    .order('created_at', { ascending: false })
    .limit(5000)

  if (productFilter && productFilter !== 'all') {
    query = query.eq('product', productFilter)
  }
  if (statusParam) {
    query = query.in('status', statusParam.split(',').filter(Boolean))
  }
  if (severityParam) {
    query = query.in('severity', severityParam.split(',').filter(Boolean))
  }

  const { data: bugs, error } = await query

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch bugs' }, { status: 500 })
  }

  const dateStr = new Date().toISOString().slice(0, 10)

  if (format === 'json') {
    return new NextResponse(JSON.stringify(bugs, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="bcc-bugs-${dateStr}.json"`,
      },
    })
  }

  // CSV
  const CSV_COLUMNS = [
    'id', 'product', 'severity', 'status', 'description', 'steps_to_reproduce',
    'username', 'assigned_to', 'tags', 'resolution_notes', 'created_at', 'resolved_at',
  ]

  const header = CSV_COLUMNS.join(',')
  const rows = (bugs ?? []).map((b) => {
    const record = b as Record<string, unknown>
    return CSV_COLUMNS.map((col) => {
      const val = record[col]
      if (Array.isArray(val)) return escapeCSV(val.join(';'))
      return escapeCSV(val as string)
    }).join(',')
  })

  const csv = [header, ...rows].join('\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="bcc-bugs-${dateStr}.csv"`,
    },
  })
}
