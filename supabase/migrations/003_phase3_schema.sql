-- ============================================================
-- BCC Phase 3: Intelligence, Polish & Scale
-- Run against the existing BCC Supabase project after Phase 2
-- ============================================================

-- ============================================================
-- Error Spike Alerts
-- Stores detected error spikes per product with cooldown tracking
-- ============================================================
CREATE TABLE IF NOT EXISTS error_spike_alerts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product TEXT NOT NULL REFERENCES bcc_products(id),
  current_count INTEGER NOT NULL,
  baseline_avg NUMERIC NOT NULL,
  spike_multiplier NUMERIC NOT NULL,
  top_fingerprints TEXT[],
  alerted_at TIMESTAMPTZ DEFAULT NOW(),
  acknowledged BOOLEAN DEFAULT false,
  acknowledged_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_spike_alerts_product ON error_spike_alerts(product, alerted_at DESC);

ALTER TABLE error_spike_alerts ENABLE ROW LEVEL SECURITY;

-- Team can read alerts in the dashboard
CREATE POLICY "Team can view spike alerts"
  ON error_spike_alerts FOR SELECT TO authenticated
  USING (is_bcc_team());

-- Team can acknowledge alerts (UPDATE)
CREATE POLICY "Team can update spike alerts"
  ON error_spike_alerts FOR UPDATE TO authenticated
  USING (is_bcc_team());

-- Service role inserts from cron (bypasses RLS automatically)
-- No INSERT policy needed for service_role

-- ============================================================
-- Global Settings
-- Key-value config for thresholds, retention, budgets
-- ============================================================
CREATE TABLE IF NOT EXISTS bcc_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO bcc_settings (key, value) VALUES
  ('retention_auto_errors_days', '90'),
  ('retention_uptime_days', '90'),
  ('retention_performance_days', '30'),
  ('retention_sessions_minutes', '10'),
  ('retention_audit_days', '365'),
  ('api_monthly_budget_usd', '5.00'),
  ('spike_threshold_multiplier', '3'),
  ('spike_cooldown_hours', '2')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE bcc_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team can view settings"
  ON bcc_settings FOR SELECT TO authenticated
  USING (is_bcc_team());

CREATE POLICY "Team can update settings"
  ON bcc_settings FOR UPDATE TO authenticated
  USING (is_bcc_team());

-- ============================================================
-- AI Feature Columns on bug_reports
-- Stores Claude categorization results and duplicate detection
-- ============================================================
ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS ai_categorization JSONB;
ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS ai_categorized_at TIMESTAMPTZ;
ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS potential_duplicate_of UUID REFERENCES bug_reports(id);
ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS duplicate_confidence NUMERIC;
ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS duplicate_reasoning TEXT;

-- ============================================================
-- Claude API Usage Tracking
-- Tracks every AI API call for cost control (monthly budget cap)
-- ============================================================
CREATE TABLE IF NOT EXISTS bcc_api_usage (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  feature TEXT NOT NULL,                        -- 'categorize', 'fix_suggestion', 'duplicate_check'
  model TEXT NOT NULL,                          -- 'claude-haiku-4-5-20251001', 'claude-sonnet-4-6'
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  estimated_cost_usd NUMERIC(10, 6) NOT NULL,
  bug_report_id UUID REFERENCES bug_reports(id),
  error_fingerprint TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_usage_created ON bcc_api_usage(created_at DESC);

ALTER TABLE bcc_api_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team can view api usage"
  ON bcc_api_usage FOR SELECT TO authenticated
  USING (is_bcc_team());

CREATE POLICY "Team can insert api usage"
  ON bcc_api_usage FOR INSERT TO authenticated
  WITH CHECK (is_bcc_team());

-- ============================================================
-- Helper: get_monthly_api_spend()
-- Used by the settings page to display current month's AI cost
-- ============================================================
CREATE OR REPLACE FUNCTION get_monthly_api_spend()
RETURNS NUMERIC
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN COALESCE(
    (SELECT SUM(estimated_cost_usd)
     FROM bcc_api_usage
     WHERE created_at >= date_trunc('month', NOW())),
    0
  );
END;
$$;
