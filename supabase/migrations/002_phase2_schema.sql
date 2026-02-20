-- ============================================================
-- BCC Phase 2: Observability & Command Center
-- Run against the existing BCC Supabase project
-- ============================================================

-- ============================================================
-- 3.1 auto_errors — Automated Error Captures
-- ============================================================
CREATE TABLE IF NOT EXISTS auto_errors (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product TEXT NOT NULL REFERENCES bcc_products(id),
  error_message TEXT NOT NULL,
  stack_trace TEXT,
  error_type TEXT NOT NULL CHECK (error_type IN (
    'unhandled_exception',
    'api_error',
    'client_crash',
    'edge_function_error'
  )),
  source TEXT NOT NULL CHECK (source IN ('client', 'server', 'edge_function')),
  request_url TEXT,
  request_method TEXT,
  response_status INTEGER,
  current_route TEXT,
  app_version TEXT,
  user_agent TEXT,
  user_id UUID,
  environment TEXT NOT NULL DEFAULT 'production' CHECK (environment IN ('production', 'staging', 'development')),
  fingerprint TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auto_errors_product ON auto_errors(product);
CREATE INDEX IF NOT EXISTS idx_auto_errors_fingerprint ON auto_errors(fingerprint);
CREATE INDEX IF NOT EXISTS idx_auto_errors_created ON auto_errors(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auto_errors_product_created ON auto_errors(product, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auto_errors_product_fingerprint ON auto_errors(product, fingerprint);
CREATE INDEX IF NOT EXISTS idx_auto_errors_environment ON auto_errors(environment);

-- ============================================================
-- 3.2 error_groups — Materialized View for Grouped Errors
-- ============================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS error_groups AS
SELECT
  fingerprint,
  product,
  MIN(error_message) AS error_message,
  MIN(stack_trace) AS sample_stack_trace,
  MIN(error_type) AS error_type,
  MIN(source) AS source,
  COUNT(*) AS occurrence_count,
  MIN(created_at) AS first_seen,
  MAX(created_at) AS last_seen,
  COUNT(DISTINCT user_id) AS affected_users,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') AS occurrences_24h,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') AS occurrences_7d
FROM auto_errors
WHERE created_at > NOW() - INTERVAL '90 days'
GROUP BY fingerprint, product
ORDER BY last_seen DESC;

CREATE UNIQUE INDEX IF NOT EXISTS idx_error_groups_pk ON error_groups(fingerprint, product);
CREATE INDEX IF NOT EXISTS idx_error_groups_last_seen ON error_groups(last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_error_groups_occurrences ON error_groups(occurrence_count DESC);

-- Refresh function (callable from Edge Function or dashboard)
CREATE OR REPLACE FUNCTION refresh_error_groups()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY error_groups;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 3.3 error_group_status — Manual Status Tracking
-- ============================================================
CREATE TABLE IF NOT EXISTS error_group_status (
  fingerprint TEXT NOT NULL,
  product TEXT NOT NULL REFERENCES bcc_products(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'acknowledged', 'resolved', 'ignored')),
  notes TEXT,
  resolved_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (fingerprint, product)
);

-- Reuse the existing update_updated_at function from Phase 1
-- (IF NOT EXISTS is not valid for triggers — drop then create for idempotency)
DROP TRIGGER IF EXISTS error_group_status_updated_at ON error_group_status;
CREATE TRIGGER error_group_status_updated_at
  BEFORE UPDATE ON error_group_status
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 3.4 uptime_checks — Health Endpoint Pings
-- ============================================================
CREATE TABLE IF NOT EXISTS uptime_checks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product TEXT NOT NULL REFERENCES bcc_products(id),
  status_code INTEGER,
  response_time_ms INTEGER,
  is_healthy BOOLEAN NOT NULL,
  error_message TEXT,
  checked_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_uptime_product_checked ON uptime_checks(product, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_uptime_healthy ON uptime_checks(product, is_healthy, checked_at DESC);

-- ============================================================
-- 3.5 deployments — Deploy History
-- ============================================================
CREATE TABLE IF NOT EXISTS deployments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product TEXT NOT NULL REFERENCES bcc_products(id),
  commit_hash TEXT,
  commit_message TEXT,
  branch TEXT DEFAULT 'main',
  deployed_by TEXT,
  environment TEXT NOT NULL DEFAULT 'production' CHECK (environment IN ('production', 'staging', 'preview')),
  deploy_url TEXT,
  notes TEXT,
  deployed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deployments_product ON deployments(product, deployed_at DESC);
CREATE INDEX IF NOT EXISTS idx_deployments_deployed_at ON deployments(deployed_at DESC);

-- ============================================================
-- 3.6 active_sessions — Product Activity Heartbeats
-- ============================================================
CREATE TABLE IF NOT EXISTS active_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product TEXT NOT NULL REFERENCES bcc_products(id),
  session_id TEXT NOT NULL,
  user_id UUID,
  last_heartbeat TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(product, session_id)
);

CREATE INDEX IF NOT EXISTS idx_active_sessions_product ON active_sessions(product, last_heartbeat DESC);

-- View for quick active counts (sessions active in last 5 minutes)
CREATE OR REPLACE VIEW active_user_counts AS
SELECT
  product,
  COUNT(*) AS active_count,
  COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) AS authenticated_count
FROM active_sessions
WHERE last_heartbeat > NOW() - INTERVAL '5 minutes'
GROUP BY product;

-- ============================================================
-- 3.7 bcc_products — Populate health_endpoint (run separately
--     after confirming the product IDs match)
-- ============================================================
-- UPDATE bcc_products SET health_endpoint = 'https://bedrockchat.com/api/health' WHERE id = 'bedrock-chat';
-- UPDATE bcc_products SET health_endpoint = 'https://echosafe.app/api/health' WHERE id = 'echosafe';

-- ============================================================
-- 3.8 RLS Policies for New Tables
-- ============================================================
ALTER TABLE auto_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE error_group_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE uptime_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE deployments ENABLE ROW LEVEL SECURITY;
ALTER TABLE active_sessions ENABLE ROW LEVEL SECURITY;

-- auto_errors: written by service_role, team reads
CREATE POLICY "Team can view auto errors"
  ON auto_errors FOR SELECT TO authenticated
  USING (is_bcc_team());

-- error_group_status: team full access
CREATE POLICY "Team can view error group status"
  ON error_group_status FOR SELECT TO authenticated
  USING (is_bcc_team());

CREATE POLICY "Team can upsert error group status"
  ON error_group_status FOR INSERT TO authenticated
  WITH CHECK (is_bcc_team());

CREATE POLICY "Team can update error group status"
  ON error_group_status FOR UPDATE TO authenticated
  USING (is_bcc_team());

-- uptime_checks: written by cron/service_role, team reads
CREATE POLICY "Team can view uptime checks"
  ON uptime_checks FOR SELECT TO authenticated
  USING (is_bcc_team());

-- deployments: team reads and manually inserts
CREATE POLICY "Team can view deployments"
  ON deployments FOR SELECT TO authenticated
  USING (is_bcc_team());

CREATE POLICY "Team can log deployments"
  ON deployments FOR INSERT TO authenticated
  WITH CHECK (is_bcc_team());

-- active_sessions: written by service_role, team reads
CREATE POLICY "Team can view sessions"
  ON active_sessions FOR SELECT TO authenticated
  USING (is_bcc_team());

-- ============================================================
-- 3.9 Cleanup Functions
-- ============================================================

-- Delete stale sessions (no heartbeat in 10 minutes)
CREATE OR REPLACE FUNCTION cleanup_stale_sessions()
RETURNS void AS $$
BEGIN
  DELETE FROM active_sessions WHERE last_heartbeat < NOW() - INTERVAL '10 minutes';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Delete old uptime checks (older than 90 days)
CREATE OR REPLACE FUNCTION cleanup_old_uptime_checks()
RETURNS void AS $$
BEGIN
  DELETE FROM uptime_checks WHERE checked_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Delete old auto_errors (older than 90 days)
CREATE OR REPLACE FUNCTION cleanup_old_auto_errors()
RETURNS void AS $$
BEGIN
  DELETE FROM auto_errors WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- Error trend RPC — used by the overview page chart
-- Returns daily error counts per product for the last 14 days.
-- Using an RPC avoids the full-table scan that a raw client query would do.
-- ============================================================
CREATE OR REPLACE FUNCTION get_error_trend_14d()
RETURNS TABLE(day DATE, product TEXT, count BIGINT)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    date_trunc('day', ae.created_at)::DATE AS day,
    ae.product,
    COUNT(*)::BIGINT AS count
  FROM auto_errors ae
  WHERE ae.created_at > NOW() - INTERVAL '14 days'
  GROUP BY 1, 2
  ORDER BY 1 ASC;
END;
$$;

-- ============================================================
-- Uptime stats RPC — returns aggregated healthy/total counts
-- per product for multiple time windows in one query.
-- Avoids fetching 90 days of raw rows to compute uptime %.
-- ============================================================
CREATE OR REPLACE FUNCTION get_uptime_stats(p_product TEXT)
RETURNS TABLE(
  window_label TEXT,
  total_checks BIGINT,
  healthy_checks BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    label AS window_label,
    COUNT(*)::BIGINT AS total_checks,
    COUNT(*) FILTER (WHERE is_healthy)::BIGINT AS healthy_checks
  FROM uptime_checks uc
  CROSS JOIN (VALUES ('24h'), ('7d'), ('30d')) AS t(label)
  WHERE uc.product = p_product
    AND uc.checked_at > CASE t.label
      WHEN '24h' THEN NOW() - INTERVAL '24 hours'
      WHEN '7d'  THEN NOW() - INTERVAL '7 days'
      WHEN '30d' THEN NOW() - INTERVAL '30 days'
    END
  GROUP BY t.label;
END;
$$;
