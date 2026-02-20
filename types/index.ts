// ============================================================
// Phase 1 Types
// ============================================================

export type Severity = 'blocker' | 'major' | 'minor'

export type BugStatus = 'new' | 'in-progress' | 'resolved' | 'wont-fix' | 'duplicate'

export type ProductId = 'bedrock-chat' | 'echosafe' | 'quoteflow'

export interface BccProduct {
  id: string
  display_name: string
  production_url: string | null
  repo_url: string | null
  health_endpoint: string | null
  is_active: boolean
  created_at: string
}

export interface BugReport {
  id: string
  product: string
  description: string
  steps_to_reproduce: string
  severity: Severity
  screenshot_url: string | null
  current_route: string | null
  app_version: string | null
  user_agent: string | null
  viewport: string | null
  user_id: string | null
  username: string | null

  // Triage
  status: BugStatus
  assigned_to: string | null
  resolution_notes: string | null
  resolved_at: string | null

  // Claude prompt tracking
  fix_prompt_generated: boolean
  fix_prompt_copied_at: string | null

  created_at: string
  updated_at: string

  // Joined
  bcc_products?: BccProduct
}

export interface BugReportInsert {
  product: string
  description: string
  steps_to_reproduce: string
  severity: Severity
  screenshot_url?: string
  current_route?: string
  app_version?: string
  user_agent?: string
  viewport?: string
  user_id?: string
  username?: string
}

export type PromptTemplate = 'quick-fix' | 'root-cause' | 'security'

// ============================================================
// Phase 2 Types
// ============================================================

export type ErrorType =
  | 'unhandled_exception'
  | 'api_error'
  | 'client_crash'
  | 'edge_function_error'

export type ErrorSource = 'client' | 'server' | 'edge_function'

export type ErrorEnvironment = 'production' | 'staging' | 'development'

export type ErrorGroupStatus = 'active' | 'acknowledged' | 'resolved' | 'ignored'

export type DeployEnvironment = 'production' | 'staging' | 'preview'

export interface AutoError {
  id: string
  product: string
  error_message: string
  stack_trace: string | null
  error_type: ErrorType
  source: ErrorSource
  request_url: string | null
  request_method: string | null
  response_status: number | null
  current_route: string | null
  app_version: string | null
  user_agent: string | null
  user_id: string | null
  environment: ErrorEnvironment
  fingerprint: string
  metadata: Record<string, unknown>
  created_at: string
}

export interface ErrorGroup {
  fingerprint: string
  product: string
  error_message: string
  sample_stack_trace: string | null
  error_type: ErrorType
  source: ErrorSource
  occurrence_count: number
  first_seen: string
  last_seen: string
  affected_users: number
  occurrences_24h: number
  occurrences_7d: number
}

export interface ErrorGroupStatusRow {
  fingerprint: string
  product: string
  status: ErrorGroupStatus
  notes: string | null
  resolved_at: string | null
  updated_at: string
}

export interface UptimeCheck {
  id: string
  product: string
  status_code: number | null
  response_time_ms: number | null
  is_healthy: boolean
  error_message: string | null
  checked_at: string
}

export interface Deployment {
  id: string
  product: string
  commit_hash: string | null
  commit_message: string | null
  branch: string | null
  deployed_by: string | null
  environment: DeployEnvironment
  deploy_url: string | null
  notes: string | null
  deployed_at: string
}

export interface ActiveSession {
  id: string
  product: string
  session_id: string
  user_id: string | null
  last_heartbeat: string
  started_at: string
}

export interface ActiveUserCount {
  product: string
  active_count: number
  authenticated_count: number
}

// Error ingest payload (from SDK → BCC API)
export interface AutoErrorInsert {
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
  environment?: ErrorEnvironment
  fingerprint: string
  metadata?: Record<string, unknown>
}

// Chart data shapes
export interface ErrorTrendPoint {
  day: string // ISO date string
  [product: string]: number | string // product name → count
}

export interface DailyCount {
  day: string
  count: number
}

// ============================================================
// Phase 3 Types
// ============================================================

export interface SpikeAlert {
  id: string
  product: string
  current_count: number
  baseline_avg: number
  spike_multiplier: number
  top_fingerprints: string[] | null
  alerted_at: string
  acknowledged: boolean
  acknowledged_at: string | null
}

export interface BccSetting {
  key: string
  value: string
  updated_at: string
}

export interface AiCategorization {
  suggested_severity: 'blocker' | 'major' | 'minor'
  severity_reasoning: string
  likely_area: 'frontend' | 'backend' | 'database' | 'auth' | 'infrastructure' | 'unknown'
  area_reasoning: string
  suggested_tags: string[]
  quick_diagnosis: string
  suggested_fix_approach: string
}

export interface ApiUsageRecord {
  id: string
  feature: string
  model: string
  input_tokens: number
  output_tokens: number
  estimated_cost_usd: number
  bug_report_id: string | null
  error_fingerprint: string | null
  created_at: string
}

// Deploy correlation
export interface DeployCorrelationBucket {
  bucket: string   // ISO timestamp (15-min boundary)
  count: number
}

export type CorrelationBadge = 'red' | 'green' | 'gray' | 'none'

export interface DeployCorrelation {
  pre_count: number
  post_count: number
  badge: CorrelationBadge
  pct_change: number
}

// Extended BugReport — Phase 3 fields added via ALTER TABLE
// These are optional so existing code doesn't break
export interface BugReportPhase3 extends BugReport {
  ai_categorization: AiCategorization | null
  ai_categorized_at: string | null
  tags: string[]
  potential_duplicate_of: string | null
  duplicate_confidence: number | null
  duplicate_reasoning: string | null
}
