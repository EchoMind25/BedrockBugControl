// BCC SDK — barrel export
// Usage: import { useHeartbeat, ErrorBoundary, ... } from '@/lib/bcc-sdk'

export { generateFingerprint, generateFingerprintSync } from './fingerprint'
export { reportError, sendHeartbeat } from './bcc-client'
export { BCCErrorBoundary } from './ErrorBoundary'
export { withErrorCapture } from './withErrorCapture'
export { useFetchInterceptor } from './useFetchInterceptor'
export { useHeartbeat } from './useHeartbeat'
export { healthHandler, createHealthHandler } from './health-route'
export type { BccErrorPayload, BccHeartbeatPayload, HealthCheck, HealthResponse } from './types'
