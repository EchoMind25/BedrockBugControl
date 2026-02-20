'use client'

import { useState } from 'react'

interface CopyPromptButtonProps {
  text: string
}

export function CopyPromptButton({ text }: CopyPromptButtonProps) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={handleCopy}
      className="text-xs text-slate-400 border border-slate-700/50 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg transition-colors"
    >
      {copied ? 'Copied!' : 'Copy prompt'}
    </button>
  )
}
