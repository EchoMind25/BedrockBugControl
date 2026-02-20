// Shared types for the BCC SDK modules

export type ErrorType =
  | 'unhandled_exception'
  | 'api_error'
  | 'client_crash'
  | 'edge_function_error'

export type ErrorSource = 'client' | 'server' | 'edge_function'

export interface BccErrorPayload {
  product: string
  error_message: string
  stack_trace?: string
  error_type: ErrorType
  source: ErrorSource
  request_url?: string
  request_method?: string
  response_status?: number
  current_route?: string
  app_version?: string
  user_agent?: string
  user_id?: string
  environment?: string
  fingerprint: string
  metadata?: Record<string, unknown>
}

export interface BccHeartbeatPayload {
  product: string
  session_id: string
  user_id?: string
}

export interface HealthCheck {
  name: string
  check: () => Promise<void>
}

export interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy'
  version: string
  timestamp: string
  checks: Record<string, { status: 'healthy' | 'unhealthy'; latency_ms?: number; error?: string }>
}
