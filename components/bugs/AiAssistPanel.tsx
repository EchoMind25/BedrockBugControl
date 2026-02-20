'use client'

import { useState } from 'react'
import type { AiCategorization } from '@/types'

interface FixSuggestion {
  root_cause_hypothesis: string
  files_to_check: string[]
  fix_approach: string
  testing_approach: string
  claude_code_prompt: string
}

interface UsageInfo {
  input_tokens: number
  output_tokens: number
  estimated_cost_usd: number
}

interface AiAssistPanelProps {
  bugId: string
  initialCategorization: AiCategorization | null
}

const AREA_BADGE: Record<string, string> = {
  frontend: 'bg-blue-900/30 text-blue-400 border-blue-700/40',
  backend: 'bg-purple-900/30 text-purple-400 border-purple-700/40',
  database: 'bg-green-900/30 text-green-400 border-green-700/40',
  auth: 'bg-orange-900/30 text-orange-400 border-orange-700/40',
  infrastructure: 'bg-slate-700 text-slate-300 border-slate-600',
  unknown: 'bg-slate-800 text-slate-400 border-slate-700/40',
}

const SEVERITY_COLOR: Record<string, string> = {
  blocker: 'text-red-400',
  major: 'text-yellow-400',
  minor: 'text-blue-400',
}

function CopiedButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // silent
    }
  }

  return (
    <button
      onClick={copy}
      className="text-xs text-slate-400 border border-slate-700/50 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg transition-colors"
    >
      {copied ? '✓ Copied' : label}
    </button>
  )
}

export function AiAssistPanel({ bugId, initialCategorization }: AiAssistPanelProps) {
  const [categorization, setCategorization] = useState<AiCategorization | null>(initialCategorization)
  const [suggestion, setSuggestion] = useState<FixSuggestion | null>(null)
  const [catLoading, setCatLoading] = useState(false)
  const [fixLoading, setFixLoading] = useState(false)
  const [catError, setCatError] = useState<string | null>(null)
  const [fixError, setFixError] = useState<string | null>(null)
  const [catUsage, setCatUsage] = useState<UsageInfo | null>(null)
  const [fixUsage, setFixUsage] = useState<UsageInfo | null>(null)

  async function fetchCategorization() {
    setCatLoading(true)
    setCatError(null)
    try {
      const res = await fetch('/api/bcc/ai/categorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bugId }),
      })
      const data = await res.json() as {
        ok?: boolean
        categorization?: AiCategorization
        usage?: UsageInfo
        error?: string
      }
      if (res.ok && data.categorization) {
        setCategorization(data.categorization)
        setCatUsage(data.usage ?? null)
      } else {
        setCatError(data.error ?? 'Categorization failed')
      }
    } catch {
      setCatError('Network error')
    } finally {
      setCatLoading(false)
    }
  }

  async function fetchFixSuggestion() {
    setFixLoading(true)
    setFixError(null)
    try {
      const res = await fetch('/api/bcc/ai/fix-suggestion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bugId }),
      })
      const data = await res.json() as {
        ok?: boolean
        suggestion?: FixSuggestion
        usage?: UsageInfo
        error?: string
      }
      if (res.ok && data.suggestion) {
        setSuggestion(data.suggestion)
        setFixUsage(data.usage ?? null)
      } else {
        setFixError(data.error ?? 'Fix suggestion failed')
      }
    } catch {
      setFixError('Network error')
    } finally {
      setFixLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Auto-categorization section */}
      <section className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
            AI Categorization
          </h2>
          <div className="flex items-center gap-2">
            {catUsage && (
              <span className="text-[10px] text-slate-600">
                ~${(catUsage.estimated_cost_usd * 100).toFixed(3)}¢
              </span>
            )}
            <button
              onClick={fetchCategorization}
              disabled={catLoading}
              className="text-xs px-2.5 py-1 bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-300 rounded-lg transition-colors disabled:opacity-50"
            >
              {catLoading ? 'Analyzing…' : categorization ? 'Re-analyze' : 'Categorize with AI'}
            </button>
          </div>
        </div>

        {catError && (
          <p className="text-xs text-red-400 mb-3">{catError}</p>
        )}

        {!categorization && !catLoading && !catError && (
          <p className="text-xs text-slate-600">
            Click &ldquo;Categorize with AI&rdquo; to get severity suggestion, area classification, and quick diagnosis using Claude Haiku.
          </p>
        )}

        {categorization && (
          <div className="space-y-3">
            {/* Severity + area badges */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs font-medium ${SEVERITY_COLOR[categorization.suggested_severity] ?? 'text-slate-400'}`}>
                Suggested: {categorization.suggested_severity}
              </span>
              <span className="text-slate-700">·</span>
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${AREA_BADGE[categorization.likely_area] ?? AREA_BADGE.unknown}`}>
                {categorization.likely_area}
              </span>
            </div>

            {/* Tags */}
            {categorization.suggested_tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {categorization.suggested_tags.map((tag) => (
                  <span key={tag} className="text-[10px] text-slate-400 bg-slate-800 border border-slate-700/50 px-1.5 py-0.5 rounded">
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Quick diagnosis */}
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Diagnosis</p>
              <p className="text-xs text-slate-300 leading-relaxed">{categorization.quick_diagnosis}</p>
            </div>

            {/* Fix approach */}
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Fix approach</p>
              <p className="text-xs text-slate-400 leading-relaxed">{categorization.suggested_fix_approach}</p>
            </div>
          </div>
        )}
      </section>

      {/* Fix suggestion section */}
      <section className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
            AI Fix Suggestion
          </h2>
          <div className="flex items-center gap-2">
            {fixUsage && (
              <span className="text-[10px] text-slate-600">
                ~${(fixUsage.estimated_cost_usd * 100).toFixed(3)}¢
              </span>
            )}
            <button
              onClick={fetchFixSuggestion}
              disabled={fixLoading}
              className="text-xs px-2.5 py-1 bg-indigo-900/50 hover:bg-indigo-900/70 border border-indigo-700/50 text-indigo-300 rounded-lg transition-colors disabled:opacity-50"
            >
              {fixLoading ? 'Thinking…' : suggestion ? 'Re-suggest' : 'Suggest Fix with AI'}
            </button>
          </div>
        </div>

        {fixError && (
          <p className="text-xs text-red-400 mb-3">{fixError}</p>
        )}

        {!suggestion && !fixLoading && !fixError && (
          <p className="text-xs text-slate-600">
            Uses Claude Sonnet for deeper analysis. Produces a Claude Code prompt you can paste directly into your coding session.
          </p>
        )}

        {suggestion && (
          <div className="space-y-3">
            {/* Root cause */}
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Root cause hypothesis</p>
              <p className="text-xs text-slate-300 leading-relaxed">{suggestion.root_cause_hypothesis}</p>
            </div>

            {/* Files to check */}
            {suggestion.files_to_check.length > 0 && (
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Files to check</p>
                <ul className="space-y-0.5">
                  {suggestion.files_to_check.map((f) => (
                    <li key={f} className="text-xs font-mono text-slate-400">{f}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Fix approach */}
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Fix approach</p>
              <p className="text-xs text-slate-300 leading-relaxed">{suggestion.fix_approach}</p>
            </div>

            {/* Testing */}
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Testing</p>
              <p className="text-xs text-slate-400 leading-relaxed">{suggestion.testing_approach}</p>
            </div>

            {/* Claude Code prompt */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider">Claude Code prompt</p>
                <CopiedButton text={suggestion.claude_code_prompt} label="Copy prompt" />
              </div>
              <pre className="text-[10px] text-slate-400 font-mono bg-slate-900 border border-slate-700/50 rounded-lg p-3 whitespace-pre-wrap overflow-x-auto">
                {suggestion.claude_code_prompt}
              </pre>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
