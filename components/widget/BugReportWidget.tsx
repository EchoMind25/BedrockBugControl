'use client'

/**
 * BugReportWidget.tsx — Drop this into any Bedrock AI product's root layout.
 *
 * Required env vars in the HOST PRODUCT (not BCC):
 *   NEXT_PUBLIC_BCC_API_URL=https://bedrock-bcc.vercel.app
 *
 * Required server-side env var (proxy through product's own API route):
 *   BCC_INGEST_KEY=bcc_sk_...
 *
 * Mount once in root layout:
 *   import { BugReportWidget } from '@/components/widget/BugReportWidget'
 *   // In layout.tsx body:
 *   <BugReportWidget product="bedrock-chat" productName="Bedrock Chat" />
 *
 * For user context, pass userId and username from your auth session.
 * The widget does NOT import BCC's Supabase client — it's fully isolated.
 */

import { useState, useRef, useEffect, useCallback } from 'react'

type Severity = 'blocker' | 'major' | 'minor'
type Step = 'consent' | 'form' | 'submitting' | 'success' | 'error'

interface BugReportWidgetProps {
  /** Product ID matching bcc_products.id, e.g. "bedrock-chat" */
  product: string
  /** Human-readable product name for success message */
  productName?: string
  /** From the host product's auth context — do NOT import BCC's Supabase */
  userId?: string | null
  username?: string | null
  /** App version string, e.g. "1.2.0" */
  appVersion?: string
}

export function BugReportWidget({
  product,
  productName = 'the product',
  userId = null,
  username = null,
  appVersion,
}: BugReportWidgetProps) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>('consent')
  const [screenshotDataUrl, setScreenshotDataUrl] = useState<string | null>(null)
  const [description, setDescription] = useState('')
  const [stepsToReproduce, setStepsToReproduce] = useState('')
  const [severity, setSeverity] = useState<Severity>('major')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  function reset() {
    setStep('consent')
    setScreenshotDataUrl(null)
    setDescription('')
    setStepsToReproduce('')
    setSeverity('major')
    setErrorMsg(null)
  }

  function openWidget() {
    reset()
    setOpen(true)
  }

  function closeWidget() {
    setOpen(false)
    reset()
  }

  // Close on Escape
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeWidget()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // Close on backdrop click
  function handleBackdropClick(e: React.MouseEvent) {
    if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
      closeWidget()
    }
  }

  async function captureScreenshot() {
    try {
      // Lazy-load html2canvas only when needed — keeps bundle impact minimal
      const { default: html2canvas } = await import('html2canvas')

      // Temporarily hide the widget itself so it's not in the screenshot
      const btn = document.getElementById('bcc-widget-trigger')
      const modal = document.getElementById('bcc-widget-modal')
      if (btn) btn.style.display = 'none'
      if (modal) modal.style.display = 'none'

      const canvas = await html2canvas(document.body, {
        useCORS: true,
        allowTaint: false,
        scale: Math.min(window.devicePixelRatio, 2),
        logging: false,
      })

      if (btn) btn.style.display = ''
      if (modal) modal.style.display = ''

      return canvas.toDataURL('image/png')
    } catch (err) {
      console.warn('[BCC Widget] Screenshot capture failed:', err)
      return null
    }
  }

  async function handleAllowScreenshot() {
    const dataUrl = await captureScreenshot()
    setScreenshotDataUrl(dataUrl)
    setStep('form')
  }

  function handleSkipScreenshot() {
    setScreenshotDataUrl(null)
    setStep('form')
  }

  function removeScreenshot() {
    setScreenshotDataUrl(null)
  }

  async function retakeScreenshot() {
    const dataUrl = await captureScreenshot()
    setScreenshotDataUrl(dataUrl)
  }

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()

    if (!description.trim() || !stepsToReproduce.trim()) {
      setErrorMsg('Please fill in all required fields.')
      return
    }

    setStep('submitting')
    setErrorMsg(null)

    try {
      let screenshotUrl: string | undefined

      // Upload screenshot if we have one
      if (screenshotDataUrl) {
        // Convert data URL to Blob
        const res = await fetch(screenshotDataUrl)
        const blob = await res.blob()
        const file = new File([blob], 'screenshot.png', { type: 'image/png' })

        const fd = new FormData()
        fd.append('file', file)
        fd.append('product', product)

        // Route through the product's own API to keep BCC_INGEST_KEY server-side
        const uploadRes = await fetch('/api/report-bug/screenshot', {
          method: 'POST',
          body: fd,
        })

        if (uploadRes.ok) {
          const uploadData = await uploadRes.json()
          screenshotUrl = uploadData.screenshot_url
        }
        // If screenshot upload fails, continue without it
      }

      // Submit bug report through product's API proxy
      const reportRes = await fetch('/api/report-bug', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product,
          description: description.trim(),
          steps_to_reproduce: stepsToReproduce.trim(),
          severity,
          screenshot_url: screenshotUrl,
          current_route: window.location.pathname,
          app_version: appVersion,
          user_agent: navigator.userAgent,
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          user_id: userId,
          username,
        }),
      })

      if (!reportRes.ok) {
        throw new Error(`Server error: ${reportRes.status}`)
      }

      setStep('success')
    } catch (err) {
      console.error('[BCC Widget] Submission failed:', err)
      setErrorMsg('Submission failed. Please try again.')
      setStep('form')
    }
  }, [description, stepsToReproduce, severity, screenshotDataUrl, product, appVersion, userId, username])

  return (
    <>
      {/* Floating trigger button */}
      <button
        id="bcc-widget-trigger"
        onClick={openWidget}
        title="Report a Bug"
        aria-label="Report a Bug"
        className="fixed bottom-5 right-5 z-40 flex items-center justify-center w-11 h-11 rounded-full bg-slate-800 border border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white hover:border-slate-500 shadow-lg transition-all hover:scale-105 group"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
        <span className="absolute right-full mr-2 bg-slate-900 text-slate-200 text-xs px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none border border-slate-700">
          Report a Bug
        </span>
      </button>

      {/* Modal */}
      {open && (
        <div
          id="bcc-widget-modal"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          onClick={handleBackdropClick}
        >
          <div className="absolute inset-0 bg-black/60" />

          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Bug Report"
            className="relative w-full sm:max-w-md bg-slate-800 border border-slate-700 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
              <h2 className="text-sm font-semibold text-slate-100">Report a Bug</h2>
              <button
                onClick={closeWidget}
                className="text-slate-400 hover:text-slate-200 p-1"
                aria-label="Close"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Step: Screenshot consent */}
            {step === 'consent' && (
              <div className="p-5 space-y-4">
                <div className="text-sm text-slate-300 leading-relaxed">
                  To help us understand the bug, we'd like to capture a screenshot of your current screen.
                  <span className="text-slate-400"> This may include visible messages or content.</span>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handleAllowScreenshot}
                    className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg py-2.5 transition-colors"
                  >
                    Allow Screenshot
                  </button>
                  <button
                    onClick={handleSkipScreenshot}
                    className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium rounded-lg py-2.5 transition-colors"
                  >
                    Skip
                  </button>
                </div>
              </div>
            )}

            {/* Step: Form */}
            {step === 'form' && (
              <form onSubmit={handleSubmit} className="p-5 space-y-4">
                {/* Screenshot preview */}
                {screenshotDataUrl && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-400">Screenshot</span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={retakeScreenshot}
                          className="text-xs text-blue-400 hover:text-blue-300"
                        >
                          Retake
                        </button>
                        <button
                          type="button"
                          onClick={removeScreenshot}
                          className="text-xs text-red-400 hover:text-red-300"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={screenshotDataUrl}
                      alt="Screenshot preview"
                      className="w-full rounded-lg border border-slate-600 max-h-32 object-cover"
                    />
                  </div>
                )}

                {/* Description */}
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    What went wrong? <span className="text-red-400">*</span>
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    required
                    rows={3}
                    placeholder="Describe the bug…"
                    className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none"
                  />
                </div>

                {/* Steps to reproduce */}
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    What were you doing? <span className="text-red-400">*</span>
                  </label>
                  <textarea
                    value={stepsToReproduce}
                    onChange={(e) => setStepsToReproduce(e.target.value)}
                    required
                    rows={3}
                    placeholder="Steps to reproduce the issue…"
                    className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none"
                  />
                </div>

                {/* Severity */}
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Severity <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={severity}
                    onChange={(e) => setSeverity(e.target.value as Severity)}
                    className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500 appearance-none"
                  >
                    <option value="blocker">🔴 Blocker — Can't use the app</option>
                    <option value="major">🟡 Major — Important feature broken</option>
                    <option value="minor">🔵 Minor — Small issue or visual glitch</option>
                  </select>
                </div>

                {errorMsg && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-sm text-red-400">
                    {errorMsg}
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg py-2.5 text-sm transition-colors"
                >
                  Submit Bug Report
                </button>
              </form>
            )}

            {/* Step: Submitting */}
            {step === 'submitting' && (
              <div className="p-10 text-center">
                <div className="text-2xl mb-3 animate-pulse">🐛</div>
                <p className="text-sm text-slate-400">Submitting your report…</p>
              </div>
            )}

            {/* Step: Success */}
            {step === 'success' && (
              <div className="p-8 text-center space-y-3">
                <div className="text-3xl">✅</div>
                <p className="text-sm font-medium text-slate-100">Bug report submitted!</p>
                <p className="text-sm text-slate-400">
                  Thank you for helping improve {productName}.
                </p>
                <button
                  onClick={closeWidget}
                  className="mt-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm rounded-lg transition-colors"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
