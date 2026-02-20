# Bedrock AI — Bug Control Center (BCC)

## Product Requirements Document — Phase 3: Intelligence, Polish & Scale

**Author:** Braxton / Claude Opus 4.6
**Date:** February 20, 2026
**Target Implementation:** Claude Code / Opus 4.6
**Prerequisite:** Phase 1 and Phase 2 must be fully deployed and functional
**Status:** Ready for implementation after Phase 2 ships and is stable

---

## 1. What Phase 3 Adds

Phases 1 and 2 built the foundation (bug triage) and the observatory (errors, uptime, deploys, active users). Phase 3 makes BCC smarter and more efficient. This phase is about reducing the time between "something broke" and "it's fixed" through intelligent automation, better correlations, and workflow polish.

Phase 3 is intentionally modular. Each feature is independent. Braxton can pick and choose which ones to build based on what feels most useful after living with Phase 2 for a while. There is no required order.

### New Capabilities

**Intelligence:**
- Error spike detection with automatic alerts
- Deploy ↔ error correlation (did this deploy break something?)
- Claude API integration for auto-categorization and fix suggestions
- Smart duplicate detection for bug reports

**Performance Observability:**
- API response time tracking per product
- Client-side performance metrics (page load, LCP, FID)
- Slow endpoint identification

**Workflow Polish:**
- Bulk triage actions on bugs and errors
- CSV/JSON export for bug reports and errors
- Keyboard shortcuts for fast triage
- Bug report templates per product
- Notification preferences (granular control)

**Scaling:**
- BCC SDK as a copy-paste package with setup docs for new products
- Dynamic team management (add/remove team members from settings UI)
- Data retention policies configurable from settings
- Audit log for triage actions

---

## 2. Prerequisites Check

Before starting any Phase 3 feature, verify:

- [ ] Phase 2 overview page is loading all sections correctly
- [ ] Auto errors are flowing from Bedrock Chat to BCC
- [ ] Uptime pinger is running on schedule
- [ ] Deployment webhook is capturing Vercel deploys
- [ ] Heartbeat is working and active user counts are accurate
- [ ] Error trend charts are rendering correctly
- [ ] Braxton has used BCC daily for at least 1-2 weeks and has opinions on what's most useful vs. missing

---

## 3. Feature: Error Spike Detection

### 3.1 Problem

A deploy ships, and suddenly errors 10x. Right now, Braxton only sees this if he's looking at the dashboard. Spike detection automatically catches anomalies and alerts.

### 3.2 Implementation

**Detection logic (runs as part of the uptime cron, or its own cron every 15 minutes):**

```
For each product:
  1. Count errors in the last 1 hour → current_count
  2. Count average errors per hour over the last 7 days → baseline_avg
  3. If baseline_avg == 0 and current_count > 5 → SPIKE (new errors appearing)
  4. If baseline_avg > 0 and current_count > (baseline_avg * 3) → SPIKE (3x normal rate)
  5. If SPIKE detected:
     a. Check if we already alerted for this product in the last 2 hours (cooldown)
     b. If no recent alert → send email notification + create a dashboard alert
```

**Database:**

```sql
CREATE TABLE error_spike_alerts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product TEXT NOT NULL REFERENCES bcc_products(id),
  current_count INTEGER NOT NULL,
  baseline_avg NUMERIC NOT NULL,
  spike_multiplier NUMERIC NOT NULL,            -- how many x above baseline
  top_fingerprints TEXT[],                       -- array of top 3 fingerprints in the spike
  alerted_at TIMESTAMPTZ DEFAULT NOW(),
  acknowledged BOOLEAN DEFAULT false,
  acknowledged_at TIMESTAMPTZ
);

CREATE INDEX idx_spike_alerts_product ON error_spike_alerts(product, alerted_at DESC);
```

**Dashboard integration:**
- Show a red banner at the top of the overview page when there's an unacknowledged spike alert
- Banner text: "⚠️ Error spike detected in {product}: {current_count} errors in last hour ({spike_multiplier}x normal)"
- "View errors" button → `/errors` filtered to that product, last 1 hour
- "Acknowledge" button → marks the alert as acknowledged, dismisses banner

**Email:**
- Subject: `[BCC] ⚠️ Error spike in {product}: {spike_multiplier}x normal rate`
- Body: current count, baseline, top 3 error messages, link to BCC errors page

### 3.3 Configuration

Add to settings page:
- Spike threshold multiplier (default: 3x)
- Spike cooldown period (default: 2 hours)
- Toggle spike alerts on/off per product

---

## 4. Feature: Deploy ↔ Error Correlation

### 4.1 Problem

After a deploy, Braxton wants to know: did this deploy make things better or worse?

### 4.2 Implementation

**On the deployments page (`/deploys`), for each deployment card, add a correlation badge:**

```
Calculation:
  1. Get the deployment timestamp
  2. Count errors for this product in the 1 hour BEFORE the deploy → pre_count
  3. Count errors for this product in the 1 hour AFTER the deploy → post_count
  4. If post_count > pre_count * 2 → RED badge: "Errors ↑ {percentage}%"
  5. If post_count < pre_count * 0.5 → GREEN badge: "Errors ↓ {percentage}%"
  6. Otherwise → GRAY badge: "No significant change"
  7. If no errors in either window → no badge
```

**On the deployment detail (click to expand a deploy card):**
- Show a mini chart: error count per 15-minute bucket, 2 hours before deploy to 2 hours after deploy
- Vertical line at the deploy timestamp
- List the top 3 NEW error fingerprints that appeared after this deploy (fingerprints with first_seen after deploy timestamp)
- Each new error links to `/errors/[fingerprint]`

**On the error detail page (`/errors/[fingerprint]`):**
- If the error's `first_seen` is within 1 hour of a deployment for the same product:
  - Show: "This error first appeared shortly after a deploy: {commit_message} ({commit_hash}) at {time}"
  - Link to the deployment

### 4.3 Implementation Notes

- This is a read-only correlation — it doesn't modify any data
- Pre-compute the counts when rendering the page (query auto_errors with time ranges relative to each deployment)
- For the mini chart: query `auto_errors` with 15-minute bucketing using `date_trunc('hour', created_at) + (EXTRACT(minute FROM created_at)::int / 15) * INTERVAL '15 min'`
- Cache the correlation data for deployments older than 2 hours (the window is stable, no need to re-compute)

---

## 5. Feature: Claude API Integration

### 5.1 Problem

Phase 1 and 2 generate copy-paste prompts. Phase 3 adds optional Claude API calls for auto-categorization and inline fix suggestions — for when Braxton wants an immediate analysis without leaving BCC.

### 5.2 Cost Control

This feature uses the Anthropic API and costs money. Implement strict controls:

- **Never auto-call the API.** Every Claude API call requires an explicit button click.
- **Use Claude Haiku 4.5 for categorization** (cheapest, fast, good enough for classification)
- **Use Claude Sonnet 4.5 for fix suggestions** (better reasoning, still affordable)
- **Display estimated cost before calling** (e.g., "~$0.01 for this analysis")
- **Monthly budget cap:** Track total API spend in a `bcc_api_usage` table. If monthly spend exceeds a configurable limit (default: $5), disable API features and show a warning.

### 5.3 Feature A: Auto-Categorization

A "Categorize with AI" button on bug reports and error groups.

**What it does:**
1. Sends bug description + steps to reproduce (or error message + stack trace) to Claude Haiku 4.5
2. Claude returns:
   - **Suggested severity**: blocker / major / minor (with reasoning)
   - **Likely area**: frontend / backend / database / auth / infrastructure / unknown
   - **Suggested tags**: array of relevant tags (e.g., "voice-channels", "rls-policy", "livekit")
   - **Similar past bugs**: if the description matches patterns from previously resolved bugs, suggest them
3. Display results inline on the bug/error detail page
4. Braxton can accept suggestions (one-click apply severity, tags) or dismiss

**Prompt:**
```
You are a bug triage assistant for Bedrock AI, a company building privacy-first software products.

Analyze this bug report and provide categorization:

Product: {product}
Description: {description}
Steps to Reproduce: {steps}
Route: {current_route}
Error (if any): {error_message}
Stack Trace (if any): {first 50 lines of stack_trace}

Respond in JSON only:
{
  "suggested_severity": "blocker|major|minor",
  "severity_reasoning": "one sentence",
  "likely_area": "frontend|backend|database|auth|infrastructure|unknown",
  "area_reasoning": "one sentence",
  "suggested_tags": ["tag1", "tag2"],
  "quick_diagnosis": "2-3 sentence assessment of what's likely wrong",
  "suggested_fix_approach": "1-2 sentence suggestion for how to approach the fix"
}
```

**Database:**

```sql
-- Track AI categorizations
ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS ai_categorization JSONB;
ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS ai_categorized_at TIMESTAMPTZ;

-- Tags support (simple text array, no separate table)
ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- API usage tracking
CREATE TABLE bcc_api_usage (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  feature TEXT NOT NULL,                        -- 'categorize', 'fix_suggestion', 'duplicate_check'
  model TEXT NOT NULL,                          -- 'claude-haiku-4-5', 'claude-sonnet-4-5'
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  estimated_cost_usd NUMERIC(10, 6) NOT NULL,
  bug_report_id UUID REFERENCES bug_reports(id),
  error_fingerprint TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_api_usage_created ON bcc_api_usage(created_at DESC);
```

### 5.4 Feature B: Inline Fix Suggestion

A "Suggest Fix with AI" button on bug reports and error groups. More expensive than categorization, so it's a separate explicit action.

**What it does:**
1. Sends full bug context to Claude Sonnet 4.5
2. Claude returns a detailed fix suggestion:
   - What's likely wrong (root cause hypothesis)
   - Which files/areas to check (based on route, error type, product)
   - Suggested code changes (pseudocode or approach — Claude doesn't have the actual codebase)
   - Testing approach to verify the fix
3. Displayed in a collapsible panel on the bug/error detail page
4. "Copy as Claude Code prompt" button that takes Claude's analysis and wraps it into an actionable prompt for Claude Code (which DOES have codebase context)

**This creates a two-step workflow:**
1. BCC asks Claude Sonnet: "What do you think is wrong?" → gets a hypothesis
2. Braxton copies the hypothesis into Claude Code: "Claude Sonnet thinks X is wrong. Investigate and fix." → Claude Code has the codebase and can actually implement the fix

This is more effective than going straight to Claude Code because the Sonnet analysis provides a targeted starting point rather than dumping a raw bug report.

### 5.5 Feature C: Smart Duplicate Detection

When a new bug report is submitted, check if it's a duplicate of an existing open bug.

**Implementation:**
1. On new bug report INSERT (in the API route, before sending email):
2. Take the description + steps_to_reproduce
3. Send to Claude Haiku 4.5 along with the descriptions of the last 20 open bugs for the same product
4. Claude returns: `{ is_likely_duplicate: boolean, duplicate_of_id: string | null, confidence: number, reasoning: string }`
5. If is_likely_duplicate with confidence > 0.8:
   - Don't auto-merge (too risky)
   - Mark the new bug with `potential_duplicate_of: UUID`
   - Show a yellow banner on the bug detail: "This may be a duplicate of Bug #{other_id}: {reasoning}"
   - Quick action button: "Mark as duplicate" (sets status to 'duplicate', adds a link to the original)

**Cost consideration:** This runs on every new bug submission. At current volume (maybe 5-20 bugs/day), this is < $0.10/day with Haiku. If volume increases significantly, add a toggle to disable it.

**Database:**
```sql
ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS potential_duplicate_of UUID REFERENCES bug_reports(id);
ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS duplicate_confidence NUMERIC;
ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS duplicate_reasoning TEXT;
```

---

## 6. Feature: Performance Metrics

### 6.1 Problem

Bugs and errors are reactive — something broke and you're fixing it. Performance metrics are proactive — you can see slow endpoints and degraded user experience before users report them.

### 6.2 Server-Side: API Response Times

**New SDK module: `withPerformanceTracking.ts`**

Wraps API route handlers (similar to `withErrorCapture` from Phase 2) and logs response times.

```typescript
// Usage:
// export const GET = withPerformanceTracking('bedrock-chat', async (request) => { ... });
//
// What it logs:
// - request_url (path only, no query params)
// - request_method
// - response_status
// - response_time_ms
// - product
//
// Sampling: Only log 10% of requests (random sampling) to avoid overwhelming the database
// Exception: Always log requests > 2000ms (slow requests are always interesting)
```

**Database:**

```sql
CREATE TABLE performance_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product TEXT NOT NULL REFERENCES bcc_products(id),
  endpoint TEXT NOT NULL,                       -- normalized path, e.g., '/api/channels/[id]'
  method TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  response_time_ms INTEGER NOT NULL,
  is_slow BOOLEAN DEFAULT false,                -- true if > 2000ms
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_perf_product_endpoint ON performance_logs(product, endpoint, created_at DESC);
CREATE INDEX idx_perf_slow ON performance_logs(is_slow, created_at DESC) WHERE is_slow = true;

-- Aggregated view for dashboard
CREATE MATERIALIZED VIEW endpoint_performance AS
SELECT
  product,
  endpoint,
  method,
  COUNT(*) AS request_count,
  AVG(response_time_ms)::INTEGER AS avg_ms,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY response_time_ms)::INTEGER AS p50_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time_ms)::INTEGER AS p95_ms,
  PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY response_time_ms)::INTEGER AS p99_ms,
  COUNT(*) FILTER (WHERE is_slow) AS slow_count,
  MAX(created_at) AS last_seen
FROM performance_logs
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY product, endpoint, method
ORDER BY p95_ms DESC;

CREATE UNIQUE INDEX idx_endpoint_perf_pk ON endpoint_performance(product, endpoint, method);
```

### 6.3 Client-Side: Web Vitals (Optional)

**New SDK module: `useWebVitals.ts`**

Reports Core Web Vitals using the `web-vitals` library.

```typescript
// Usage:
// useWebVitals({ product: 'bedrock-chat' });
//
// Reports: LCP, FID, CLS, TTFB, INP
// Sampling: 10% of page loads (random)
// POST to /api/bcc/vitals → BCC stores in a web_vitals table
//
// This is a nice-to-have. Only build if API performance tracking proves useful first.
```

### 6.4 Dashboard: Performance Page (`/performance`)

New page in the sidebar navigation.

**Slow Endpoints Table:**
| Endpoint | Method | Requests (7d) | Avg | p50 | p95 | p99 | Slow Count |
|----------|--------|---------------|-----|-----|-----|-----|------------|

Sorted by p95 descending (slowest endpoints first).
Color coding: green < 200ms, yellow < 1000ms, red >= 1000ms (on p95).

**Endpoint Detail (click a row):**
- Response time distribution chart (histogram)
- Response time over time (line chart, last 7 days)
- Breakdown by status code

**Product selector:** dropdown to filter by product

---

## 7. Feature: Bulk Triage Actions

### 7.1 Bug List Bulk Actions

On `/bugs` page:
- Checkbox on each row (leftmost column)
- "Select all visible" checkbox in header
- When 1+ rows selected, show action bar at top:
  - **Change Status**: dropdown → applies to all selected
  - **Change Severity**: dropdown → applies to all selected
  - **Assign To**: text input → applies to all selected
  - **Mark as Duplicate**: prompts for the original bug ID → marks all selected as duplicate of that ID
- Confirm dialog before applying: "Apply {action} to {count} bugs?"

### 7.2 Error List Bulk Actions

On `/errors` page:
- Checkbox on each row
- Bulk actions:
  - **Acknowledge All**: sets status to 'acknowledged' on all selected error groups
  - **Resolve All**: sets status to 'resolved'
  - **Ignore All**: sets status to 'ignored'

---

## 8. Feature: Data Export

### 8.1 Bug Report Export

On `/bugs` page: "Export" button in the top bar.

Options:
- **Format**: CSV or JSON
- **Scope**: "Current filters" (exports what's currently filtered/visible) or "All"
- **Fields**: All fields by default. Option to exclude metadata (user_agent, viewport) for cleaner exports.

CSV columns: id, product, severity, status, description, steps_to_reproduce, reporter, assigned_to, tags, resolution_notes, created_at, resolved_at

### 8.2 Error Export

On `/errors` page: "Export" button.

Exports the grouped error list with: fingerprint, product, error_message, source, occurrence_count, affected_users, first_seen, last_seen, status

### 8.3 Implementation

- Generate CSV/JSON on the server side (Server Action or API route) to handle large datasets
- Stream the response as a file download
- Filename: `bcc-bugs-{date}.csv` or `bcc-errors-{date}.csv`

---

## 9. Feature: Keyboard Shortcuts

### 9.1 Global Shortcuts

| Shortcut | Action |
|----------|--------|
| `g` then `o` | Navigate to Overview |
| `g` then `b` | Navigate to Bugs |
| `g` then `e` | Navigate to Errors |
| `g` then `u` | Navigate to Uptime |
| `g` then `d` | Navigate to Deploys |
| `?` | Show keyboard shortcut help modal |
| `/` | Focus search/filter input |

### 9.2 Bug List Shortcuts

| Shortcut | Action |
|----------|--------|
| `j` / `k` | Move selection down / up |
| `Enter` | Open selected bug |
| `x` | Toggle checkbox on selected row |
| `s` then `n` | Set status: New |
| `s` then `i` | Set status: In Progress |
| `s` then `r` | Set status: Resolved |

### 9.3 Bug Detail Shortcuts

| Shortcut | Action |
|----------|--------|
| `p` | Generate Claude fix prompt |
| `c` | Copy fix prompt to clipboard |
| `Escape` | Go back to bug list |

### 9.4 Implementation

- Use a lightweight keyboard shortcut library or a custom hook
- Show shortcuts in a help modal (triggered by `?`)
- Don't activate shortcuts when user is typing in an input/textarea
- Shortcuts are a polish feature — implement last, skip if time is tight

---

## 10. Feature: Bug Report Templates

### 10.1 Problem

Different products have different common bug patterns. A voice channel bug in Bedrock Chat needs different information than a quote generation bug in QuoteFlow.

### 10.2 Implementation

**Database:**

```sql
CREATE TABLE bug_report_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product TEXT NOT NULL REFERENCES bcc_products(id),
  name TEXT NOT NULL,                           -- 'Voice Channel Issue', 'Quote Generation Error'
  description_placeholder TEXT NOT NULL,        -- pre-filled text for the description field
  steps_placeholder TEXT NOT NULL,              -- pre-filled text for the steps field
  default_severity TEXT CHECK (default_severity IN ('blocker', 'major', 'minor')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Widget integration:**
- When the bug report widget opens, if templates exist for the current product:
  - Show a "What type of issue?" dropdown before the form
  - Selecting a template pre-fills the description and steps textareas with placeholder text
  - User can edit freely after selection
  - "Other / Custom" option shows a blank form (current behavior)

**Settings page integration:**
- Manage templates from Settings: create, edit, delete per product
- Simple form: name, description placeholder, steps placeholder, default severity

**Example templates for Bedrock Chat:**
- "Voice Channel Issue" → description: "Describe the voice channel problem (e.g., can't connect, audio cutting out, echo)..." steps: "1. Which voice channel were you trying to join?\n2. Were other users in the channel?\n3. What happened when you clicked join?"
- "Message/Chat Issue" → description: "Describe the messaging problem..." steps: "1. What channel/DM were you in?\n2. What were you trying to do?\n3. What happened instead?"
- "Login/Account Issue" → description: "Describe the login or account problem..." steps: "1. Were you trying to log in, sign up, or access your account?\n2. What error message did you see?\n3. Which browser/device are you using?"

---

## 11. Feature: Notification Preferences

### 11.1 Problem

As BCC matures, different team members may want different notification levels. One person wants all alerts, another only wants blockers and downtime.

### 11.2 Implementation

**Database:**

```sql
CREATE TABLE notification_preferences (
  user_email TEXT PRIMARY KEY,
  notify_blocker_bugs BOOLEAN DEFAULT true,
  notify_major_bugs BOOLEAN DEFAULT false,
  notify_downtime BOOLEAN DEFAULT true,
  notify_recovery BOOLEAN DEFAULT true,
  notify_error_spikes BOOLEAN DEFAULT true,
  notify_deploys BOOLEAN DEFAULT false,
  digest_frequency TEXT DEFAULT 'none' CHECK (digest_frequency IN ('none', 'daily', 'weekly')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed with Braxton's defaults
INSERT INTO notification_preferences (user_email) VALUES ('braxton@bedrockai.systems');
```

**Settings page:**
- Toggle switches for each notification type
- Digest frequency: None / Daily / Weekly
- Daily digest: sent at 8 AM UTC, summarizes yesterday's bugs, errors, uptime events
- Weekly digest: sent Monday 8 AM UTC, summarizes the week

**Implementation:**
- All notification functions check `notification_preferences` before sending
- Digest emails: a cron job that queries activity for the period and sends a summary

---

## 12. Feature: Dynamic Team Management

### 12.1 Problem

Currently, adding a team member requires editing the `is_bcc_team()` SQL function. This should be manageable from the Settings UI.

### 12.2 Implementation

**Database:**

```sql
CREATE TABLE bcc_team_members (
  email TEXT PRIMARY KEY,
  display_name TEXT,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  added_by TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed with Braxton
INSERT INTO bcc_team_members (email, display_name, role) VALUES
  ('braxton@bedrockai.systems', 'Braxton', 'admin');

-- Update is_bcc_team() to check this table instead of hardcoded emails
CREATE OR REPLACE FUNCTION is_bcc_team()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM bcc_team_members
    WHERE email = auth.jwt() ->> 'email'
    AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Settings page:**
- Team members list: email, display name, role, added date
- "Add team member" form: email (must create the user in Supabase Auth separately), display name, role
- Remove: soft delete (set is_active = false)
- Only admins can manage team members
- Braxton is always admin and cannot be removed

---

## 13. Feature: Audit Log

### 13.1 Problem

As the team grows, it's useful to know who changed what. Who resolved this bug? Who acknowledged that error group?

### 13.2 Implementation

**Database:**

```sql
CREATE TABLE audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_email TEXT NOT NULL,
  action TEXT NOT NULL,                         -- 'bug.status_changed', 'bug.assigned', 'error.acknowledged', etc.
  entity_type TEXT NOT NULL,                    -- 'bug_report', 'error_group', 'deployment', 'team_member'
  entity_id TEXT NOT NULL,                      -- UUID or fingerprint
  old_value TEXT,
  new_value TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id, created_at DESC);
CREATE INDEX idx_audit_actor ON audit_log(actor_email, created_at DESC);
CREATE INDEX idx_audit_created ON audit_log(created_at DESC);
```

**What gets logged:**
- Bug status changes: who changed it, from what to what
- Bug severity changes
- Bug assignments
- Error group status changes (acknowledged, resolved, ignored)
- Team member additions/removals
- Notification preference changes

**Dashboard integration:**
- On bug detail and error detail pages: small "History" section at the bottom showing the audit trail for that entity
- Optional: `/settings/audit` page showing the full audit log with filters (actor, action, entity type, date range)

**Implementation:**
- Create audit entries in the same Server Action / API call that performs the mutation
- Use a helper function: `logAudit({ actor, action, entityType, entityId, oldValue, newValue })`
- Keep it simple — this is for visibility, not compliance

---

## 14. Feature: Configurable Data Retention

### 14.1 Settings Page Section

Move data retention from hardcoded cron cleanup functions to configurable settings:

| Data Type | Default Retention | Min | Max |
|-----------|------------------|-----|-----|
| Auto errors | 90 days | 30 days | 365 days |
| Uptime checks | 90 days | 30 days | 365 days |
| Performance logs | 30 days | 7 days | 90 days |
| Active sessions (stale) | 10 minutes | 5 minutes | 30 minutes |
| Audit log | 365 days | 90 days | unlimited |

**Database:**

```sql
CREATE TABLE bcc_settings (
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
  ('spike_cooldown_hours', '2');
```

**Cleanup cron reads from this table** instead of using hardcoded intervals.

**Settings UI:** Simple key-value editor with human-readable labels, validation for min/max ranges, save button.

---

## 15. Feature: BCC SDK Documentation & Packaging

### 15.1 Problem

Integrating BCC into a new product (QuoteFlow, EchoSafe) should take < 1 hour. This requires clear docs and a clean copy-paste package.

### 15.2 Deliverable

A `/docs` section in the BCC dashboard (or a README in the SDK directory) with:

**Quick Start (5 minutes):**
1. Add env vars to your product: `NEXT_PUBLIC_BCC_API_URL`, `BCC_INGEST_KEY`
2. Copy the SDK files into your project (list exact files)
3. Add `<BugReportWidget product="your-product-id" />` to your root layout
4. Done — bug reports will flow to BCC

**Full Integration (30 minutes):**
1. Quick Start steps above
2. Add `<BCCErrorBoundary>` to root layout
3. Add `useFetchInterceptor()` to a client component
4. Add `useHeartbeat()` to a client component
5. Add `/api/health` route using the SDK health handler
6. Add proxy routes: `/api/bcc/error`, `/api/bcc/heartbeat`
7. Done — errors, heartbeats, and health checks all flowing

**Per-file documentation:**
Each SDK file should have a JSDoc header explaining:
- What it does
- How to use it
- What env vars it needs
- What it POSTs and where

### 15.3 Product Registration

When integrating a new product, the team should:
1. Add the product to `bcc_products` table (from Settings page)
2. Set up Vercel webhook for the new product's Vercel project
3. Follow the Quick Start or Full Integration guide
4. Verify data flow by submitting a test bug and checking the dashboard

---

## 16. Implementation Priority Order

These are suggested priorities. Braxton should reorder based on what feels most needed after using Phase 2 daily.

### High Priority (build these first)

| # | Feature | Reason |
|---|---------|--------|
| 1 | Deploy ↔ error correlation | Directly answers "did this deploy break something?" — the most common question after deploying |
| 2 | Error spike detection | Catches problems you'd otherwise miss until a user reports them |
| 3 | Bulk triage actions | Daily workflow efficiency — triaging 10 bugs one-by-one is slow |
| 4 | Keyboard shortcuts | Speed multiplier for daily triage workflow |

### Medium Priority (build when high priority is done)

| # | Feature | Reason |
|---|---------|--------|
| 5 | Claude auto-categorization | Reduces manual triage effort, especially as bug volume grows |
| 6 | Data export (CSV/JSON) | Useful for sharing bug lists with others or tracking trends outside BCC |
| 7 | Bug report templates | Improves bug report quality from beta testers |
| 8 | SDK documentation | Required before integrating QuoteFlow or EchoSafe |

### Low Priority (build if there's time or need)

| # | Feature | Reason |
|---|---------|--------|
| 9 | Performance metrics | Proactive monitoring is valuable but less urgent than reactive bug/error tracking |
| 10 | Claude inline fix suggestions | Nice but the copy-paste workflow from Phase 1 might be good enough |
| 11 | Smart duplicate detection | Only useful when bug volume is high enough for duplicates to be a problem |
| 12 | Dynamic team management | Only needed when the team grows beyond Braxton |
| 13 | Notification preferences | Only needed when the team grows beyond Braxton |
| 14 | Audit log | Only needed when multiple people are triaging |
| 15 | Configurable data retention | Hardcoded 90-day retention is fine for now |

---

## 17. Implementation Checklist — Phase 3

Unlike Phases 1 and 2, Phase 3 features are modular. Each can be built independently. The checklist below groups them by feature.

### Deploy ↔ Error Correlation
- [ ] Add correlation badge calculation to deploys page
- [ ] Build mini chart component (error count around deploy time)
- [ ] Add "new errors after deploy" list to expanded deploy card
- [ ] Add deploy correlation note to error detail page
- [ ] Test with real deploy + error data

### Error Spike Detection
- [ ] Create `error_spike_alerts` table
- [ ] Add spike detection logic to cron job (or new cron)
- [ ] Build alert banner component for overview page
- [ ] Add acknowledge action
- [ ] Add spike alert email notification
- [ ] Add spike settings to settings page

### Bulk Triage Actions
- [ ] Add checkbox column to bug list
- [ ] Build bulk action bar component
- [ ] Implement bulk status change
- [ ] Implement bulk severity change
- [ ] Implement bulk assign
- [ ] Add checkbox column to errors list
- [ ] Implement bulk acknowledge/resolve/ignore for error groups

### Keyboard Shortcuts
- [ ] Build keyboard shortcut system (hook or library)
- [ ] Implement global navigation shortcuts
- [ ] Implement bug list navigation shortcuts
- [ ] Implement bug detail shortcuts
- [ ] Build help modal (? key)

### Claude Auto-Categorization
- [ ] Create `bcc_api_usage` table
- [ ] Add ai_categorization, tags columns to bug_reports
- [ ] Build "Categorize with AI" button and result display
- [ ] Implement Anthropic API call with Haiku
- [ ] Build cost tracking and monthly budget cap
- [ ] Add budget display to settings page

### Claude Inline Fix Suggestions
- [ ] Build "Suggest Fix with AI" button
- [ ] Implement Sonnet API call with fix prompt
- [ ] Build result display panel with "Copy as Claude Code prompt" button
- [ ] Track API usage

### Smart Duplicate Detection
- [ ] Add duplicate columns to bug_reports
- [ ] Implement duplicate check on new bug ingestion
- [ ] Build duplicate banner on bug detail page
- [ ] Build "Mark as duplicate" quick action

### Data Export
- [ ] Build export button on bugs page
- [ ] Implement CSV generation (server-side)
- [ ] Implement JSON generation
- [ ] Build export button on errors page
- [ ] Stream large exports as file downloads

### Bug Report Templates
- [ ] Create `bug_report_templates` table
- [ ] Build template management in settings
- [ ] Integrate template selector into bug report widget
- [ ] Create default templates for Bedrock Chat

### Performance Metrics
- [ ] Create `performance_logs` table and materialized view
- [ ] Build `withPerformanceTracking.ts` SDK module
- [ ] Build `/performance` dashboard page
- [ ] Build endpoint detail view with charts
- [ ] Optional: build `useWebVitals.ts` for client-side metrics

### Notification Preferences
- [ ] Create `notification_preferences` table
- [ ] Build preferences UI in settings
- [ ] Update all notification functions to check preferences
- [ ] Build daily/weekly digest cron and email template

### Dynamic Team Management
- [ ] Create `bcc_team_members` table
- [ ] Update `is_bcc_team()` function
- [ ] Build team management UI in settings
- [ ] Test: new team member can log in and access dashboard

### Audit Log
- [ ] Create `audit_log` table
- [ ] Build `logAudit()` helper function
- [ ] Add audit logging to all mutation endpoints
- [ ] Build history section on bug/error detail pages
- [ ] Optional: build `/settings/audit` full log page

### Configurable Data Retention
- [ ] Create `bcc_settings` table
- [ ] Build settings editor UI
- [ ] Update cleanup cron to read from settings table

### SDK Documentation
- [ ] Write Quick Start guide
- [ ] Write Full Integration guide
- [ ] Add JSDoc headers to all SDK files
- [ ] Test: follow the guide to integrate BCC into a fresh Next.js project

---

## 18. Success Criteria — Phase 3

Phase 3 is successful when:

1. ✅ Deploy correlation answers "did this deploy break something?" within 5 seconds of looking
2. ✅ Error spikes are detected and alerted automatically, without Braxton needing to check the dashboard
3. ✅ Triaging 10 bugs takes < 5 minutes with bulk actions and keyboard shortcuts
4. ✅ Integrating BCC into a new product takes < 1 hour following the SDK docs
5. ✅ If Claude API features are enabled, they cost < $5/month and provide actionable categorization
6. ✅ The overall time from "bug reported" to "fix deployed" is measurably faster than before BCC existed

---

## 19. Long-Term Vision (Beyond Phase 3)

These are ideas, not plans. Revisit if BCC becomes central to Bedrock AI's operations:

- **Public status page** for Bedrock AI products (separate from the internal dashboard)
- **Slack/Discord integration** for notifications (if the team uses these)
- **GitHub integration** — auto-create issues from bug reports, link PRs to bug IDs
- **AI-powered root cause analysis** using Claude with codebase context (via MCP or file upload)
- **Incident timeline** — automatic reconstruction of what happened during an outage (deploy + errors + uptime events combined into a narrative)
- **SLA tracking** — define response time targets for blocker/major/minor and track adherence
- **Multi-product dependency mapping** — visualize which products depend on shared services

None of these are planned. They're recorded here so good ideas don't get lost.