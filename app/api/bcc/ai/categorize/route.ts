import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/server'
import type { AiCategorization } from '@/types'

/**
 * POST /api/bcc/ai/categorize
 *
 * Uses Claude Haiku to auto-categorize a bug report.
 * Checks monthly budget cap before calling the API.
 * Records usage in bcc_api_usage for cost tracking.
 *
 * Body: { bugId: string }
 * Returns: AiCategorization
 */

// Cost per token for claude-haiku-4-5-20251001 (approximate, as of early 2026)
const MODEL = 'claude-haiku-4-5-20251001'
const INPUT_COST_PER_TOKEN = 0.00000025   // $0.25 per 1M input tokens
const OUTPUT_COST_PER_TOKEN = 0.00000125  // $1.25 per 1M output tokens
const DEFAULT_MONTHLY_BUDGET = 5.00

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  // Verify authentication
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Check ANTHROPIC_API_KEY
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not configured' }, { status: 503 })
  }

  let body: { bugId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { bugId } = body
  if (!bugId || typeof bugId !== 'string') {
    return NextResponse.json({ error: 'bugId is required' }, { status: 400 })
  }

  // Fetch the bug report
  const { data: bug, error: bugError } = await supabase
    .from('bug_reports')
    .select('id, product, description, steps_to_reproduce, current_route, severity')
    .eq('id', bugId)
    .single()

  if (bugError || !bug) {
    return NextResponse.json({ error: 'Bug report not found' }, { status: 404 })
  }

  // ── Budget check ──────────────────────────────────────────
  const serviceClient = createServiceClient()

  // Load monthly budget cap from settings
  let budgetCap = DEFAULT_MONTHLY_BUDGET
  try {
    const { data: setting } = await serviceClient
      .from('bcc_settings')
      .select('value')
      .eq('key', 'api_monthly_budget_usd')
      .single()
    if (setting?.value) budgetCap = parseFloat(setting.value) || DEFAULT_MONTHLY_BUDGET
  } catch {
    // Use default if settings table not available
  }

  // Get current month spend
  const { data: spendData } = await serviceClient.rpc('get_monthly_api_spend')
  const currentSpend = (spendData as number) ?? 0

  if (currentSpend >= budgetCap) {
    return NextResponse.json(
      { error: `Monthly AI budget of $${budgetCap.toFixed(2)} has been reached. Check settings to increase it.` },
      { status: 429 }
    )
  }

  // ── Build prompt ──────────────────────────────────────────
  const prompt = `You are a bug triage assistant for Bedrock AI, a company building privacy-first software products.

Analyze this bug report and provide categorization:

Product: ${bug.product}
Description: ${bug.description}
Steps to Reproduce: ${bug.steps_to_reproduce}
Route: ${bug.current_route ?? 'Unknown'}

Respond in JSON only:
{
  "suggested_severity": "blocker|major|minor",
  "severity_reasoning": "one sentence",
  "likely_area": "frontend|backend|database|auth|infrastructure|unknown",
  "area_reasoning": "one sentence",
  "suggested_tags": ["tag1", "tag2"],
  "quick_diagnosis": "2-3 sentence assessment of what's likely wrong",
  "suggested_fix_approach": "1-2 sentence suggestion for how to approach the fix"
}`

  // ── Call Claude Haiku ─────────────────────────────────────
  const client = new Anthropic({ apiKey })

  let categorization: AiCategorization
  let inputTokens = 0
  let outputTokens = 0

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    })

    inputTokens = response.usage.input_tokens
    outputTokens = response.usage.output_tokens

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    // Strip markdown code fences if present
    const jsonStr = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
    categorization = JSON.parse(jsonStr) as AiCategorization
  } catch (err) {
    console.error('[BCC] Claude categorize error:', err)
    return NextResponse.json({ error: 'AI categorization failed — check logs' }, { status: 500 })
  }

  // ── Track usage + cost ────────────────────────────────────
  const estimatedCost = inputTokens * INPUT_COST_PER_TOKEN + outputTokens * OUTPUT_COST_PER_TOKEN

  await Promise.allSettled([
    // Store categorization on bug report
    supabase
      .from('bug_reports')
      .update({
        ai_categorization: categorization,
        ai_categorized_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', bugId),

    // Record API usage
    supabase.from('bcc_api_usage').insert({
      feature: 'categorize',
      model: MODEL,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      estimated_cost_usd: estimatedCost,
      bug_report_id: bugId,
    }),
  ])

  return NextResponse.json({
    ok: true,
    categorization,
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      estimated_cost_usd: estimatedCost,
    },
  })
}
