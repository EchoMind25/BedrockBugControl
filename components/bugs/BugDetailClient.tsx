'use client'

import { useState } from 'react'
import { TriagePanel } from '@/components/bugs/TriagePanel'
import { FixPromptGenerator } from '@/components/bugs/FixPromptGenerator'
import type { BugReport, BccProduct } from '@/types'

interface BugDetailClientProps {
  bug: BugReport
  product: BccProduct
}

export function BugDetailClient({ bug, product }: BugDetailClientProps) {
  const [promptOpen, setPromptOpen] = useState(false)

  return (
    <>
      <TriagePanel bug={bug} onOpenPrompt={() => setPromptOpen(true)} />
      {promptOpen && (
        <FixPromptGenerator
          bug={bug}
          product={product}
          onClose={() => setPromptOpen(false)}
        />
      )}
    </>
  )
}
