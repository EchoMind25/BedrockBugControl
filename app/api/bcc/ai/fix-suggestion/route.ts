import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * POST /api/bcc/ai/fix-suggestion
 *
 * Uses Claude Sonnet to generate a detailed fix suggestion for a bug report.
 * More expensive than categorization — explicit user action required.
 *
 * Body: { bugId: string }
 * Returns: { suggestion: FixSuggestion }
 */

const MODEL = 'claude-sonnet-4-6'
const INPUT_COST_PER_TOKEN = 0.000003    // $3 per 1M input tokens
const OUTPUT_COST_PER_TOKEN = 0.000015   // $15 per 1M output tokens
const DEFAULT_MONTHLY_BUDGET = 5.00

interface FixSuggestion {
  root_cause_hypothesis: string
  files_to_check: string[]
  fix_approach: string
  testing_approach: string
  claude_code_prompt: string
}

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
    .select('id, product, description, steps_to_reproduce, current_route, severity, user_agent, app_version')
    .eq('id', bugId)
    .single()

  if (bugError || !bug) {
    return NextResponse.json({ error: 'Bug report not found' }, { status: 404 })
  }

  // ── Budget check ──────────────────────────────────────────
  const serviceClient = createServiceClient()

  let budgetCap = DEFAULT_MONTHLY_BUDGET
  try {
    const { data: setting } = await serviceClient
      .from('bcc_settings')
      .select('value')
      .eq('key', 'api_monthly_budget_usd')
      .single()
    if (setting?.value) budgetCap = parseFloat(setting.value) || DEFAULT_MONTHLY_BUDGET
  } catch {
    // Use default
  }

  const { data: spendData } = await serviceClient.rpc('get_monthly_api_spend')
  const currentSpend = (spendData as number) ?? 0

  if (currentSpend >= budgetCap) {
    return NextResponse.json(
      { error: `Monthly AI budget of $${budgetCap.toFixed(2)} has been reached.` },
      { status: 429 }
    )
  }

  // ── Build prompt ──────────────────────────────────────────
  const prompt = `You are a senior software engineer analyzing a bug report for Bedrock AI, a company building privacy-first software products including Bedrock Chat (a collaborative chat app with voice channels), EchoSafe, and QuoteFlow.

Bug Report:
Product: ${bug.product}
Severity: ${bug.severity}
Description: ${bug.description}
Steps to Reproduce: ${bug.steps_to_reproduce}
Current Route: ${bug.current_route ?? 'Unknown'}
App Version: ${bug.app_version ?? 'Unknown'}

Note: You don't have access to the codebase. Provide hypotheses and general guidance that a developer with codebase access can act on.

Provide your analysis in JSON only:
{
  "root_cause_hypothesis": "2-3 sentences on what's most likely causing this bug",
  "files_to_check": ["path/to/relevant/file.ts", "another/file.tsx"],
  "fix_approach": "3-5 sentences describing the specific code changes needed",
  "testing_approach": "2-3 sentences on how to verify the fix worked",
  "claude_code_prompt": "A self-contained prompt a developer can paste into Claude Code (which has codebase context) to investigate and fix this bug. Include the key hypothesis and what to look for."
}`

  // ── Call Claude Sonnet ────────────────────────────────────
  const client = new Anthropic({ apiKey })

  let suggestion: FixSuggestion
  let inputTokens = 0
  let outputTokens = 0

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })

    inputTokens = response.usage.input_tokens
    outputTokens = response.usage.output_tokens

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const jsonStr = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
    suggestion = JSON.parse(jsonStr) as FixSuggestion
  } catch (err) {
    console.error('[BCC] Claude fix-suggestion error:', err)
    return NextResponse.json({ error: 'AI fix suggestion failed — check logs' }, { status: 500 })
  }

  // ── Track usage ───────────────────────────────────────────
  const estimatedCost = inputTokens * INPUT_COST_PER_TOKEN + outputTokens * OUTPUT_COST_PER_TOKEN

  await supabase.from('bcc_api_usage').insert({
    feature: 'fix_suggestion',
    model: MODEL,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    estimated_cost_usd: estimatedCost,
    bug_report_id: bugId,
  })

  return NextResponse.json({
    ok: true,
    suggestion,
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      estimated_cost_usd: estimatedCost,
    },
  })
}
