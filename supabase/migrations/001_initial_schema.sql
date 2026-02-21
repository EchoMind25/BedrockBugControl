-- ============================================================
-- BCC — Bug Control Center — Initial Schema
-- Run this in your BCC Supabase project's SQL Editor.
-- This is a SEPARATE Supabase project from Bedrock Chat,
-- EchoSafe, and QuoteFlow. Do NOT run this in those projects.
-- ============================================================

-- ── 1. Product Registry ──────────────────────────────────────

CREATE TABLE bcc_products (
  id TEXT PRIMARY KEY,                          -- 'bedrock-chat', 'echosafe', 'quoteflow'
  display_name TEXT NOT NULL,                   -- 'Bedrock Chat'
  production_url TEXT,                          -- 'https://bedrockchat.com'
  repo_url TEXT,                                -- 'https://github.com/bedrockai/bedrock-chat'
  health_endpoint TEXT,                         -- Phase 2: uptime monitoring
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed with current products
INSERT INTO bcc_products (id, display_name, production_url) VALUES
  ('bedrock-chat', 'Bedrock Chat', NULL),
  ('echosafe', 'EchoSafe', 'https://echosafe.app'),
  ('quoteflow', 'QuoteFlow', NULL);


-- ── 2. Bug Reports ───────────────────────────────────────────

CREATE TABLE bug_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product TEXT NOT NULL REFERENCES bcc_products(id),
  description TEXT NOT NULL,
  steps_to_reproduce TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('blocker', 'major', 'minor')),
  screenshot_url TEXT,
  current_route TEXT,
  app_version TEXT,
  user_agent TEXT,
  viewport TEXT,
  user_id UUID,
  username TEXT,

  -- Triage fields
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in-progress', 'resolved', 'wont-fix', 'duplicate')),
  assigned_to TEXT,
  resolution_notes TEXT,
  resolved_at TIMESTAMPTZ,

  -- Claude prompt tracking
  fix_prompt_generated BOOLEAN DEFAULT false,
  fix_prompt_copied_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX idx_bug_reports_product ON bug_reports(product);
CREATE INDEX idx_bug_reports_status ON bug_reports(status);
CREATE INDEX idx_bug_reports_severity ON bug_reports(severity);
CREATE INDEX idx_bug_reports_created ON bug_reports(created_at DESC);
CREATE INDEX idx_bug_reports_product_status ON bug_reports(product, status);


-- ── 3. Auto-update trigger for updated_at ────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER bug_reports_updated_at
  BEFORE UPDATE ON bug_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ── 4. RLS (Row Level Security) ──────────────────────────────

ALTER TABLE bug_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE bcc_products ENABLE ROW LEVEL SECURITY;

-- Helper: check if the requesting user is Bedrock AI team
-- Add team member emails here as your team grows
CREATE OR REPLACE FUNCTION is_bcc_team()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (
    auth.jwt() ->> 'email' IN (
      'braxton@bedrockai.systems'
      -- Add more team emails here:
      -- 'teammate@bedrockai.systems'
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- bug_reports: products write via service_role (API routes, bypasses RLS)
-- Team reads and updates from the dashboard via anon key + RLS
CREATE POLICY "Team can view bug reports"
  ON bug_reports FOR SELECT TO authenticated
  USING (is_bcc_team());

CREATE POLICY "Team can update bug reports"
  ON bug_reports FOR UPDATE TO authenticated
  USING (is_bcc_team());

-- bcc_products: team can read and manage
CREATE POLICY "Team can view products"
  ON bcc_products FOR SELECT TO authenticated
  USING (is_bcc_team());

CREATE POLICY "Team can manage products"
  ON bcc_products FOR INSERT TO authenticated
  WITH CHECK (is_bcc_team());

CREATE POLICY "Team can update products"
  ON bcc_products FOR UPDATE TO authenticated
  USING (is_bcc_team());


-- ── 5. Storage Bucket ────────────────────────────────────────

-- Run this to create the private screenshot storage bucket:
INSERT INTO storage.buckets (id, name, public)
VALUES ('bug-screenshots', 'bug-screenshots', false);

-- Products upload screenshots via service_role key through BCC's API route
-- Dashboard views screenshots via signed URLs (1-hour expiry)
CREATE POLICY "Team can view bug screenshots"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'bug-screenshots' AND is_bcc_team());


-- ── Setup Notes ──────────────────────────────────────────────
-- After running this SQL:
--
-- 1. Go to Authentication > Users in your Supabase dashboard
--    and manually create a user for braxton@bedrockai.systems
--    (set a strong password — there's no self-registration)
--
-- 2. Fill in .env.local:
--    NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
--    NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
--    SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
--    BCC_INGEST_KEY=bcc_sk_... (generate: node -e "console.log('bcc_sk_' + require('crypto').randomBytes(24).toString('hex'))")
--    RESEND_API_KEY=re_...
--
-- 3. Add BCC_INGEST_KEY to each product's env:
--    NEXT_PUBLIC_BCC_API_URL=https://bedrock-bug-control.vercel.app
--    BCC_INGEST_KEY=bcc_sk_... (same key as above)
