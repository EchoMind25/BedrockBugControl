'use client'

/**
 * BugReportWidget.tsx — Drop this into any Bedrock AI product's root layout.
 *
 * Required env vars in the HOST PRODUCT (not BCC):
 *   NEXT_PUBLIC_BCC_API_URL=https://bedrock-bcc.vercel.app
 *   BCC_INGEST_KEY=bcc_sk_...   (server-side only — kept in product's proxy routes)
 *
 * Mount once in root layout:
 *   <BugReportWidget
 *     product="bedrock-chat"
 *     productName="Bedrock Chat"
 *     userId={session?.user?.id}
 *     username={session?.user?.email}
 *     isAuthenticated={!!session}
 *     theme={{ primaryColor: '#3b82f6' }}
 *   />
 *
 * Per-product accent colors:
 *   Bedrock Chat  → '#3b82f6'  (blue)
 *   EchoSafe      → '#8b5cf6'  (purple)
 *   QuoteFlow     → '#10b981'  (emerald)
 *
 * The widget does NOT import BCC's Supabase client — fully isolated.
 * All structural styling uses the slate palette; product accent uses inline styles.
 */

import { useState, useRef, useEffect, useCallback } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────

type Severity = 'blocker' | 'major' | 'minor'
type Step = 'consent' | 'form' | 'success'

interface WidgetTheme {
  /** Hex accent color for buttons + selected severity card. Default: '#3b82f6' */
  primaryColor?: string
}

interface BugReportWidgetProps {
  /** Product ID matching bcc_products.id, e.g. "bedrock-chat" */
  product: string
  /** Human-readable product name shown in success message */
  productName?: string
  /** From the host product's auth context — do NOT import BCC's Supabase */
  userId?: string | null
  username?: string | null
  /** App version string, e.g. "1.2.0" */
  appVersion?: string
  /** When false, widget renders nothing. Default: true */
  isAuthenticated?: boolean
  /** Per-product visual theming */
  theme?: WidgetTheme
}

const SEVERITY_OPTIONS: { value: Severity; label: string; desc: string; dot: string }[] = [
  { value: 'blocker', label: 'Blocker', desc: "Can't use the app",         dot: 'bg-red-500'    },
  { value: 'major',   label: 'Major',   desc: 'Feature broken, app works', dot: 'bg-yellow-500' },
  { value: 'minor',   label: 'Minor',   desc: 'Cosmetic or small issue',   dot: 'bg-blue-500'   },
]

// ── Component ──────────────────────────────────────────────────────────────

export function BugReportWidget({
  product,
  productName = 'the product',
  userId = null,
  username = null,
  appVersion,
  isAuthenticated = true,
  theme,
}: BugReportWidgetProps) {
  const primaryColor = theme?.primaryColor ?? '#3b82f6'

  // ── UI state ──────────────────────────────────────────────────────────────
  const [open, setOpen]               = useState(false)
  const [step, setStep]               = useState<Step>('consent')
  const [showTooltip, setShowTooltip] = useState(false)

  // ── Screenshot state ──────────────────────────────────────────────────────
  const [screenshotBlob,    setScreenshotBlob]    = useState<Blob | null>(null)
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null)
  const [isCapturing,       setIsCapturing]       = useState(false)

  // ── Form state ────────────────────────────────────────────────────────────
  const [description,      setDescription]      = useState('')
  const [stepsToReproduce, setStepsToReproduce] = useState('')
  const [consoleErrors,    setConsoleErrors]    = useState('')
  const [severity,         setSeverity]         = useState<Severity | null>(null)
  const [isAnonymous,      setIsAnonymous]      = useState(false)
  const [isSubmitting,     setIsSubmitting]     = useState(false)

  // ── Validation ────────────────────────────────────────────────────────────
  const [errors, setErrors] = useState<Record<string, string>>({})

  // ── Focused field (for themed border color) ────────────────────────────────
  const [focusedField, setFocusedField] = useState<string | null>(null)

  const dialogRef = useRef<HTMLDivElement>(null)

  // ── Reset ─────────────────────────────────────────────────────────────────
  const resetForm = useCallback(() => {
    setStep('consent')
    if (screenshotPreview) URL.revokeObjectURL(screenshotPreview)
    setScreenshotBlob(null)
    setScreenshotPreview(null)
    setDescription('')
    setStepsToReproduce('')
    setConsoleErrors('')
    setSeverity(null)
    setIsAnonymous(false)
    setErrors({})
    setIsSubmitting(false)
    setIsCapturing(false)
  }, [screenshotPreview])

  const handleOpen = useCallback(() => {
    setOpen(true)
  }, [])

  const handleClose = useCallback(() => {
    setOpen(false)
    setTimeout(resetForm, 300)
  }, [resetForm])

  // ── Keyboard / backdrop close ──────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, handleClose])

  function handleBackdropClick(e: React.MouseEvent) {
    if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
      handleClose()
    }
  }

  // ── Screenshot capture ────────────────────────────────────────────────────
  const captureScreenshot = useCallback(async (): Promise<Blob | null> => {
    const triggerEl = document.getElementById('bcc-widget-trigger')
    const modalEl   = document.getElementById('bcc-widget-modal')

    if (triggerEl) triggerEl.style.visibility = 'hidden'
    if (modalEl)   modalEl.style.visibility   = 'hidden'

    await new Promise((r) => setTimeout(r, 80))

    try {
      const html2canvas = (await import('html2canvas')).default
      const canvas = await html2canvas(document.body, {
        useCORS: true,
        allowTaint: true,
        scale: Math.min(window.devicePixelRatio, 2),
        logging: false,
      })
      return await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/png')
      )
    } catch (err) {
      console.warn('[BCC Widget] Screenshot capture failed:', err)
      return null
    } finally {
      if (triggerEl) triggerEl.style.visibility = ''
      if (modalEl)   modalEl.style.visibility   = ''
    }
  }, [])

  const handleAllowScreenshot = useCallback(async () => {
    setIsCapturing(true)
    try {
      const blob = await captureScreenshot()
      if (blob) {
        setScreenshotBlob(blob)
        setScreenshotPreview(URL.createObjectURL(blob))
      }
    } finally {
      setIsCapturing(false)
      setStep('form')
    }
  }, [captureScreenshot])

  const handleSkipScreenshot = useCallback(() => {
    setStep('form')
  }, [])

  const handleRemoveScreenshot = useCallback(() => {
    if (screenshotPreview) URL.revokeObjectURL(screenshotPreview)
    setScreenshotBlob(null)
    setScreenshotPreview(null)
  }, [screenshotPreview])

  const handleRetakeScreenshot = useCallback(async () => {
    handleRemoveScreenshot()
    setIsCapturing(true)
    setOpen(false)
    await new Promise((r) => setTimeout(r, 150))
    setOpen(true)
    try {
      const blob = await captureScreenshot()
      if (blob) {
        setScreenshotBlob(blob)
        setScreenshotPreview(URL.createObjectURL(blob))
      }
    } finally {
      setIsCapturing(false)
    }
  }, [handleRemoveScreenshot, captureScreenshot])

  // ── Validation ────────────────────────────────────────────────────────────
  const validate = useCallback(() => {
    const next: Record<string, string> = {}
    if (!description.trim())       next.description = 'Please describe the bug'
    if (!stepsToReproduce.trim())  next.steps        = 'Please describe what you were doing'
    if (!severity)                 next.severity     = 'Please select a severity level'
    setErrors(next)
    return Object.keys(next).length === 0
  }, [description, stepsToReproduce, severity])

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (!validate()) return
    setIsSubmitting(true)

    try {
      let screenshotUrl: string | undefined

      // Step 1: Upload screenshot if captured
      if (screenshotBlob) {
        const fd = new FormData()
        fd.append('file', new File([screenshotBlob], 'screenshot.png', { type: 'image/png' }))
        fd.append('product', product)

        const uploadRes = await fetch('/api/report-bug/screenshot', {
          method: 'POST',
          body: fd,
        })
        if (uploadRes.ok) {
          const uploadData = await uploadRes.json() as { screenshot_url?: string }
          screenshotUrl = uploadData.screenshot_url
        }
        // Screenshot failure is non-fatal — continue without it
      }

      // Append console errors to steps_to_reproduce when provided
      const stepsWithConsole = consoleErrors.trim()
        ? `${stepsToReproduce.trim()}\n\nConsole errors:\n${consoleErrors.trim()}`
        : stepsToReproduce.trim()

      // Step 2: Submit bug report through product's proxy route
      const reportRes = await fetch('/api/report-bug', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product,
          description:        description.trim(),
          steps_to_reproduce: stepsWithConsole,
          severity,
          screenshot_url:     screenshotUrl,
          current_route:      window.location.pathname,
          app_version:        appVersion,
          user_agent:         navigator.userAgent,
          viewport:           `${window.innerWidth}x${window.innerHeight}`,
          user_id:            isAnonymous ? undefined : (userId   ?? undefined),
          username:           isAnonymous ? undefined : (username ?? undefined),
        }),
      })

      if (!reportRes.ok) {
        const data = await reportRes.json().catch(() => ({})) as { error?: string }
        throw new Error(data.error ?? `Server error: ${reportRes.status}`)
      }

      setStep('success')
    } catch (err) {
      console.error('[BCC Widget] Submit failed:', err)
      setErrors({ submit: 'Submission failed. Please try again.' })
    } finally {
      setIsSubmitting(false)
    }
  }, [
    validate, description, stepsToReproduce, consoleErrors,
    severity, screenshotBlob, product, appVersion,
    isAnonymous, userId, username,
  ])

  // ── Guard ─────────────────────────────────────────────────────────────────
  if (!isAuthenticated) return null

  // ── Theming helpers ───────────────────────────────────────────────────────
  const primaryBg = { backgroundColor: primaryColor } as React.CSSProperties

  function inputStyle(field: string): React.CSSProperties {
    return focusedField === field ? { borderColor: primaryColor } : {}
  }

  function severityCardStyle(val: Severity): React.CSSProperties {
    return severity === val
      ? { borderColor: primaryColor, backgroundColor: primaryColor + '18' }
      : {}
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Floating trigger button ── */}
      <div id="bcc-widget-trigger" className="fixed bottom-6 right-6 z-40">
        <div className="relative">
          {/* Tooltip */}
          {showTooltip && !open && (
            <div className="absolute bottom-full right-0 mb-2 px-3 py-1.5 text-xs font-medium text-white bg-slate-800 border border-slate-700 rounded-lg whitespace-nowrap pointer-events-none">
              Report a Bug
              <div className="absolute top-full right-4 -mt-px w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-slate-800" />
            </div>
          )}

          <button
            type="button"
            onClick={handleOpen}
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
            aria-label="Report a Bug"
            className="w-12 h-12 rounded-full flex items-center justify-center bg-slate-800/90 text-slate-300 border border-slate-700/50 hover:bg-slate-700/90 hover:text-white hover:border-slate-600/50 shadow-lg transition-all duration-200 hover:scale-105 active:scale-95"
          >
            {/* Bug/beetle icon */}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 2l1.88 1.88" />
              <path d="M14.12 3.88 16 2" />
              <path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1" />
              <path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6" />
              <path d="M12 20v-9" />
              <path d="M6.53 9C4.6 8.8 3 7.1 3 5" />
              <path d="M6 13H2" />
              <path d="M3 21c0-2.1 1.7-3.9 3.8-4" />
              <path d="M20.97 5c0 2.1-1.6 3.8-3.5 4" />
              <path d="M22 13h-4" />
              <path d="M17.2 17c2.1.1 3.8 1.9 3.8 4" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Modal ── */}
      {open && (
        <div
          id="bcc-widget-modal"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          onClick={handleBackdropClick}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60" />

          {/* Dialog panel */}
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Report a Bug"
            className="relative w-full sm:max-w-md bg-slate-900 border border-slate-700/50 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/50">
              <h2 className="text-sm font-semibold text-slate-100">Report a Bug</h2>
              <button
                onClick={handleClose}
                className="text-slate-500 hover:text-slate-200 p-1 rounded-md hover:bg-slate-800 transition-colors"
                aria-label="Close"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* ── Step: Consent ── */}
            {step === 'consent' && (
              <div className="p-5 space-y-4">
                <div className="rounded-lg bg-slate-800/50 border border-slate-700/30 p-4">
                  <p className="text-sm text-slate-300 leading-relaxed">
                    To help us understand the bug, we can capture a screenshot of your
                    current screen. This may include visible messages or content.
                    You can skip this step if you prefer.
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={handleAllowScreenshot}
                    disabled={isCapturing}
                    style={primaryBg}
                    className="flex-1 text-white text-sm font-medium rounded-lg py-2.5 hover:opacity-90 disabled:opacity-60 transition-opacity"
                  >
                    {isCapturing ? 'Capturing…' : 'Allow Screenshot'}
                  </button>
                  <button
                    type="button"
                    onClick={handleSkipScreenshot}
                    disabled={isCapturing}
                    className="flex-1 bg-slate-800 hover:bg-slate-700/80 border border-slate-700/50 text-slate-300 text-sm font-medium rounded-lg py-2.5 disabled:opacity-60 transition-colors"
                  >
                    Skip Screenshot
                  </button>
                </div>
              </div>
            )}

            {/* ── Step: Form ── */}
            {step === 'form' && (
              <div className="p-5 space-y-4 overflow-y-auto max-h-[80vh]">
                {/* Screenshot preview */}
                {screenshotPreview && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-300">Screenshot</span>
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={handleRetakeScreenshot}
                          disabled={isCapturing}
                          className="text-xs text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-40"
                        >
                          {isCapturing ? 'Capturing…' : 'Retake'}
                        </button>
                        <button
                          type="button"
                          onClick={handleRemoveScreenshot}
                          className="text-xs text-red-400 hover:text-red-300 transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={screenshotPreview}
                      alt="Bug screenshot preview"
                      className="w-full rounded-lg border border-slate-700/50 max-h-36 object-cover object-top"
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
                    onChange={(e) => {
                      setDescription(e.target.value)
                      if (errors.description) setErrors((p) => ({ ...p, description: '' }))
                    }}
                    onFocus={() => setFocusedField('description')}
                    onBlur={() => setFocusedField(null)}
                    rows={3}
                    placeholder="Describe what you experienced…"
                    style={inputStyle('description')}
                    className="w-full bg-slate-800 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none resize-none transition-colors"
                  />
                  {errors.description && (
                    <p className="mt-1 text-xs text-red-400">{errors.description}</p>
                  )}
                </div>

                {/* Steps to reproduce */}
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    What were you doing before this happened? <span className="text-red-400">*</span>
                  </label>
                  <textarea
                    value={stepsToReproduce}
                    onChange={(e) => {
                      setStepsToReproduce(e.target.value)
                      if (errors.steps) setErrors((p) => ({ ...p, steps: '' }))
                    }}
                    onFocus={() => setFocusedField('steps')}
                    onBlur={() => setFocusedField(null)}
                    rows={3}
                    placeholder="E.g., I clicked the send button, then tried to navigate…"
                    style={inputStyle('steps')}
                    className="w-full bg-slate-800 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none resize-none transition-colors"
                  />
                  {errors.steps && (
                    <p className="mt-1 text-xs text-red-400">{errors.steps}</p>
                  )}
                </div>

                {/* Console errors */}
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Console errors{' '}
                    <span className="text-slate-500 font-normal">(optional)</span>
                  </label>
                  <textarea
                    value={consoleErrors}
                    onChange={(e) => setConsoleErrors(e.target.value)}
                    onFocus={() => setFocusedField('console')}
                    onBlur={() => setFocusedField(null)}
                    rows={2}
                    placeholder="Paste any error messages from the browser console…"
                    style={inputStyle('console')}
                    className="w-full bg-slate-800 border border-slate-700/50 rounded-lg px-3 py-2 text-xs text-slate-300 placeholder-slate-500 focus:outline-none resize-none font-mono transition-colors"
                  />
                </div>

                {/* Severity cards */}
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    How much does this affect your experience? <span className="text-red-400">*</span>
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {SEVERITY_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          setSeverity(opt.value)
                          if (errors.severity) setErrors((p) => ({ ...p, severity: '' }))
                        }}
                        style={severityCardStyle(opt.value)}
                        className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border border-slate-700/50 bg-slate-800/30 hover:border-slate-600/50 transition-all duration-150 focus:outline-none ${severity === opt.value ? 'text-white' : 'text-slate-400'}`}
                      >
                        <span className={`w-2.5 h-2.5 rounded-full ${opt.dot}`} />
                        <span className="text-xs font-medium">{opt.label}</span>
                        <span className="text-[10px] opacity-70 text-center leading-tight">{opt.desc}</span>
                      </button>
                    ))}
                  </div>
                  {errors.severity && (
                    <p className="mt-1 text-xs text-red-400">{errors.severity}</p>
                  )}
                </div>

                {/* Anonymous toggle */}
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <div className="relative flex-shrink-0 w-9 h-5">
                    <input
                      type="checkbox"
                      checked={isAnonymous}
                      onChange={(e) => setIsAnonymous(e.target.checked)}
                      className="sr-only"
                    />
                    <div
                      className="absolute inset-0 rounded-full transition-colors duration-200"
                      style={{ backgroundColor: isAnonymous ? primaryColor : undefined }}
                    >
                      {!isAnonymous && (
                        <div className="w-full h-full rounded-full bg-slate-700" />
                      )}
                    </div>
                    <div
                      className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${isAnonymous ? 'translate-x-[1.25rem]' : 'translate-x-0.5'}`}
                    />
                  </div>
                  <div>
                    <span className="text-sm text-slate-200">Submit anonymously</span>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Your identity won&apos;t be attached to this report
                    </p>
                  </div>
                </label>

                {/* Submit-level error */}
                {errors.submit && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-sm text-red-400">
                    {errors.submit}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-3 pt-1">
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    style={isSubmitting ? undefined : primaryBg}
                    className="flex-1 text-white text-sm font-medium rounded-lg py-2.5 hover:opacity-90 disabled:opacity-60 disabled:bg-slate-600 transition-opacity"
                  >
                    {isSubmitting ? 'Submitting…' : 'Submit Bug Report'}
                  </button>
                  <button
                    type="button"
                    onClick={handleClose}
                    disabled={isSubmitting}
                    className="bg-slate-800 hover:bg-slate-700 border border-slate-700/50 text-slate-300 text-sm font-medium rounded-lg px-4 py-2.5 disabled:opacity-50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* ── Step: Success ── */}
            {step === 'success' && (
              <div className="p-8 text-center space-y-3">
                <div className="text-3xl">✅</div>
                <p className="text-sm font-medium text-slate-100">Bug report submitted!</p>
                <p className="text-sm text-slate-400">
                  Thank you for helping improve {productName}.
                </p>
                <button
                  type="button"
                  onClick={handleClose}
                  className="mt-2 px-5 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700/50 text-slate-200 text-sm rounded-lg transition-colors"
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
