'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { generatePrompt } from '@/lib/prompts/templates'
import type { BugReport, BccProduct, PromptTemplate } from '@/types'

const TABS: { value: PromptTemplate; label: string; description: string }[] = [
  { value: 'quick-fix', label: 'Quick Fix', description: 'Straightforward fix — issue is clear' },
  { value: 'root-cause', label: 'Root Cause', description: 'Deep investigation before fixing' },
  { value: 'security', label: 'Security Review', description: 'Bug with potential security implications' },
]

interface FixPromptGeneratorProps {
  bug: BugReport
  product: BccProduct
  onClose: () => void
}

export function FixPromptGenerator({ bug, product, onClose }: FixPromptGeneratorProps) {
  const [tab, setTab] = useState<PromptTemplate>('quick-fix')
  const [copied, setCopied] = useState(false)
  const supabase = createClient()

  const prompt = generatePrompt(bug, product, tab)

  // Mark as generated when the panel opens
  useEffect(() => {
    if (!bug.fix_prompt_generated) {
      supabase
        .from('bug_reports')
        .update({ fix_prompt_generated: true })
        .eq('id', bug.id)
        .then(() => {})
    }
  }, [bug.id, bug.fix_prompt_generated, supabase])

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(prompt)
      setCopied(true)

      // Track copy timestamp
      await supabase
        .from('bug_reports')
        .update({
          fix_prompt_generated: true,
          fix_prompt_copied_at: new Date().toISOString(),
        })
        .eq('id', bug.id)

      setTimeout(() => setCopied(false), 2500)
    } catch {
      // Fallback for non-HTTPS or clipboard permission denied
      const el = document.createElement('textarea')
      el.value = prompt
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    }
  }

  function handleOpenClaude() {
    window.open('https://claude.ai/new', '_blank', 'noopener,noreferrer')
  }

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative w-full sm:max-w-2xl bg-slate-800 border border-slate-700 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700 flex-shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">Generate Fix Prompt</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Paste into Claude Code or{' '}
              <button
                onClick={handleOpenClaude}
                className="text-blue-400 hover:underline"
              >
                claude.ai
              </button>
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-700 px-5 flex-shrink-0">
          {TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              title={t.description}
              className={`px-3 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                tab === t.value
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Prompt content */}
        <div className="flex-1 overflow-auto p-5">
          <textarea
            readOnly
            value={prompt}
            className="w-full h-64 sm:h-72 bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs text-slate-300 font-mono resize-none focus:outline-none focus:border-blue-500/50"
          />
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-5 py-4 border-t border-slate-700 flex-shrink-0">
          <p className="text-xs text-slate-500 flex-1 hidden sm:block">
            Claude Code has your codebase context — paste there for best results.
          </p>
          <button
            onClick={handleOpenClaude}
            className="px-3 py-2 rounded-lg border border-slate-600 text-xs text-slate-300 hover:bg-slate-700 transition-colors whitespace-nowrap"
          >
            Open Claude.ai ↗
          </button>
          <button
            onClick={handleCopy}
            className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
              copied
                ? 'bg-green-600 text-white'
                : 'bg-blue-600 hover:bg-blue-500 text-white'
            }`}
          >
            {copied ? '✓ Copied!' : 'Copy to Clipboard'}
          </button>
        </div>
      </div>
    </div>
  )
}
