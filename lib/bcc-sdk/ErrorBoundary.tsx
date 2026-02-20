'use client'

import React from 'react'
import { generateFingerprint, generateFingerprintSync } from './fingerprint'
import { reportError } from './bcc-client'

interface Props {
  product: string
  children: React.ReactNode
  fallback?: React.ComponentType<{ error: Error; reset: () => void }>
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void
}

interface State {
  hasError: boolean
  error: Error | null
}

/**
 * React Error Boundary that automatically captures unhandled render errors
 * and reports them to BCC. Renders a friendly fallback UI.
 *
 * Usage in root layout.tsx:
 *   <BCCErrorBoundary product="bedrock-chat">
 *     {children}
 *   </BCCErrorBoundary>
 */
export class BCCErrorBoundary extends React.Component<Props, State> {
  // In-memory debounce: fingerprint → last sent timestamp
  private sentFingerprints = new Map<string, number>()
  private debounceResetTimer: ReturnType<typeof setTimeout> | null = null
  private readonly DEBOUNCE_MS = 60_000
  private readonly RESET_MS = 5 * 60_000

  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.props.onError?.(error, errorInfo)
    this.reportToBcc(error, errorInfo)
  }

  private async reportToBcc(error: Error, errorInfo: React.ErrorInfo) {
    const stack = error.stack ?? errorInfo.componentStack ?? undefined
    let fingerprint: string
    try {
      fingerprint = await generateFingerprint(error.message, stack ?? undefined)
    } catch {
      fingerprint = generateFingerprintSync(error.message, stack ?? undefined)
    }

    // Debounce: skip if this fingerprint was sent in the last 60 seconds
    const lastSent = this.sentFingerprints.get(fingerprint)
    if (lastSent && Date.now() - lastSent < this.DEBOUNCE_MS) return

    this.sentFingerprints.set(fingerprint, Date.now())
    this.scheduleDebounceReset()

    const payload = {
      product: this.props.product,
      error_message: error.message.slice(0, 2000),
      stack_trace: stack?.slice(0, 10000),
      error_type: 'unhandled_exception' as const,
      source: 'client' as const,
      current_route: typeof window !== 'undefined' ? window.location.pathname : undefined,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      fingerprint,
    }

    reportError('', payload)
  }

  private scheduleDebounceReset() {
    if (this.debounceResetTimer) return
    this.debounceResetTimer = setTimeout(() => {
      this.sentFingerprints.clear()
      this.debounceResetTimer = null
    }, this.RESET_MS)
  }

  override componentWillUnmount() {
    if (this.debounceResetTimer) clearTimeout(this.debounceResetTimer)
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  override render() {
    if (!this.state.hasError || !this.state.error) {
      return this.props.children
    }

    if (this.props.fallback) {
      const Fallback = this.props.fallback
      return <Fallback error={this.state.error} reset={this.handleReset} />
    }

    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: '2rem',
          background: '#0f172a',
          color: '#e2e8f0',
          fontFamily: 'sans-serif',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>
          Something went wrong
        </h1>
        <p style={{ color: '#94a3b8', marginBottom: '2rem', maxWidth: 400 }}>
          An unexpected error occurred. It has been automatically reported.
        </p>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          <button
            onClick={this.handleReset}
            style={{
              background: '#3b82f6',
              color: '#fff',
              border: 'none',
              borderRadius: '0.5rem',
              padding: '0.625rem 1.25rem',
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: '#1e293b',
              color: '#94a3b8',
              border: '1px solid #334155',
              borderRadius: '0.5rem',
              padding: '0.625rem 1.25rem',
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            Reload page
          </button>
        </div>
        <details
          style={{
            marginTop: '2rem',
            maxWidth: 600,
            textAlign: 'left',
            color: '#64748b',
            fontSize: '0.75rem',
          }}
        >
          <summary style={{ cursor: 'pointer', marginBottom: '0.5rem' }}>Error details</summary>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {this.state.error.message}
          </pre>
        </details>
      </div>
    )
  }
}
