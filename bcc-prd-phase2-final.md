# Bedrock AI — Bug Control Center (BCC)

## Product Requirements Document — Phase 2: Observability & Command Center

**Author:** Braxton / Claude Opus 4.6
**Date:** February 20, 2026
**Target Implementation:** Claude Code / Opus 4.6
**Prerequisite:** Phase 1 must be fully deployed and functional
**Status:** Ready for implementation after Phase 1 ships

---

## 1. What Phase 2 Adds

Phase 1 gave us manual bug triage. Phase 2 turns BCC into a real-time operations dashboard. After this phase, opening BCC tells you everything about your products in under 30 seconds.

### New Capabilities
- **Automated error capture**: Unhandled exceptions, API failures, and client crashes flow into BCC automatically — no user action required
- **Error grouping and trends**: Identical errors are grouped by fingerprint, with occurrence counts and time-series trend charts
- **Uptime monitoring**: Cron pinger hits each product's health endpoint every 5 minutes, tracks response times, alerts on downtime
- **Deployment tracking**: Vercel webhook logs every deploy with commit info, enabling deploy ↔ error correlation
- **Active user signals**: Lightweight heartbeat from each product shows who's using what right now
- **Overview command center**: Single page with all signals aggregated — the page you open every morning
- **Realtime updates**: New bugs, errors, and status changes appear live without page refresh

### What Phase 2 Does NOT Include (deferred to Phase 3)
- Error spike detection and intelligent alerting
- Deploy ↔ error correlation analysis
- Performance metrics (API response times, client load times)
- Data retention automation
- Bulk triage actions
- CSV export
- BCC SDK as a distributable package
- Claude API integration for auto-categorization

---

## 2. Prerequisites Check

Before starting Phase 2, verify Phase 1 is solid:

- [ ] BCC dashboard is deployed and accessible at its Vercel URL
- [ ] Bug report widget is integrated into Bedrock Chat and submitting successfully
- [ ] Bug triage workflow works: list → detail → status change → Claude prompt generation
- [ ] PWA is installable and functional
- [ ] Supabase project for BCC is stable with `bug_reports` and `bcc_products` tables
- [ ] API route `/api/bcc/report` is receiving and storing bug reports
- [ ] Auth and RLS are working correctly

If any of the above are broken, fix them before starting Phase 2.

---

## 3. Database Schema Additions

All new tables go into the existing BCC Supabase project alongside `bug_reports` and `bcc_products`.

### 3.1 `auto_errors` — Automated Error Captures

```sql
CREATE TABLE auto_errors (
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
  metadata JSONB DEFAULT '{}',                  -- flexible field for extra context per error type
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_auto_errors_product ON auto_errors(product);
CREATE INDEX idx_auto_errors_fingerprint ON auto_errors(fingerprint);
CREATE INDEX idx_auto_errors_created ON auto_errors(created_at DESC);
CREATE INDEX idx_auto_errors_product_created ON auto_errors(product, created_at DESC);
CREATE INDEX idx_auto_errors_product_fingerprint ON auto_errors(product, fingerprint);
CREATE INDEX idx_auto_errors_environment ON auto_errors(environment);
```

### 3.2 `error_groups` — Materialized View for Grouped Errors

```sql
CREATE MATERIALIZED VIEW error_groups AS
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

CREATE UNIQUE INDEX idx_error_groups_pk ON error_groups(fingerprint, product);
CREATE INDEX idx_error_groups_last_seen ON error_groups(last_seen DESC);
CREATE INDEX idx_error_groups_occurrences ON error_groups(occurrence_count DESC);
```

**Refresh strategy:** Refresh this view on demand from the dashboard (button click) or via a cron job every 15 minutes. The dashboard can query `auto_errors` directly for real-time data and use `error_groups` for the aggregated list view.

```sql
-- Function to refresh the materialized view (callable from Edge Function or dashboard)
CREATE OR REPLACE FUNCTION refresh_error_groups()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY error_groups;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 3.3 `error_group_status` — Manual Status Tracking for Error Groups

The materialized view is read-only, so we need a separate table to track manual triage actions on error groups.

```sql
CREATE TABLE error_group_status (
  fingerprint TEXT NOT NULL,
  product TEXT NOT NULL REFERENCES bcc_products(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'acknowledged', 'resolved', 'ignored')),
  notes TEXT,
  resolved_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (fingerprint, product)
);

CREATE TRIGGER error_group_status_updated_at
  BEFORE UPDATE ON error_group_status
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

### 3.4 `uptime_checks` — Health Endpoint Pings

```sql
CREATE TABLE uptime_checks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product TEXT NOT NULL REFERENCES bcc_products(id),
  status_code INTEGER,                          -- HTTP status or NULL if timeout/unreachable
  response_time_ms INTEGER,                     -- milliseconds
  is_healthy BOOLEAN NOT NULL,
  error_message TEXT,                           -- reason if unhealthy
  checked_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_uptime_product_checked ON uptime_checks(product, checked_at DESC);
CREATE INDEX idx_uptime_healthy ON uptime_checks(product, is_healthy, checked_at DESC);
```

### 3.5 `deployments` — Deploy History

```sql
CREATE TABLE deployments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product TEXT NOT NULL REFERENCES bcc_products(id),
  commit_hash TEXT,
  commit_message TEXT,
  branch TEXT DEFAULT 'main',
  deployed_by TEXT,                             -- 'vercel-auto', 'braxton', etc.
  environment TEXT NOT NULL DEFAULT 'production' CHECK (environment IN ('production', 'staging', 'preview')),
  deploy_url TEXT,                              -- Vercel deployment URL
  notes TEXT,
  deployed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_deployments_product ON deployments(product, deployed_at DESC);
CREATE INDEX idx_deployments_deployed_at ON deployments(deployed_at DESC);
```

### 3.6 `active_sessions` — Product Activity Heartbeats

```sql
CREATE TABLE active_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product TEXT NOT NULL REFERENCES bcc_products(id),
  session_id TEXT NOT NULL,
  user_id UUID,
  last_heartbeat TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(product, session_id)
);

CREATE INDEX idx_active_sessions_product ON active_sessions(product, last_heartbeat DESC);

-- View for quick active counts
CREATE OR REPLACE VIEW active_user_counts AS
SELECT
  product,
  COUNT(*) AS active_count,
  COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) AS authenticated_count
FROM active_sessions
WHERE last_heartbeat > NOW() - INTERVAL '5 minutes'
GROUP BY product;
```

### 3.7 `bcc_products` Table Update

Add the `health_endpoint` field (column already exists from Phase 1 schema, but now we actually populate it):

```sql
UPDATE bcc_products SET health_endpoint = 'https://bedrockchat.com/api/health' WHERE id = 'bedrock-chat';
UPDATE bcc_products SET health_endpoint = 'https://echosafe.app/api/health' WHERE id = 'echosafe';
-- QuoteFlow: set when it has a production URL
```

### 3.8 RLS Policies for New Tables

```sql
ALTER TABLE auto_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE error_group_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE uptime_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE deployments ENABLE ROW LEVEL SECURITY;
ALTER TABLE active_sessions ENABLE ROW LEVEL SECURITY;

-- auto_errors: written by service_role via API routes, team reads from dashboard
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

-- deployments: team can read and manually insert
CREATE POLICY "Team can view deployments"
  ON deployments FOR SELECT TO authenticated
  USING (is_bcc_team());

CREATE POLICY "Team can log deployments"
  ON deployments FOR INSERT TO authenticated
  WITH CHECK (is_bcc_team());

-- active_sessions: written by service_role via heartbeat API, team reads
CREATE POLICY "Team can view sessions"
  ON active_sessions FOR SELECT TO authenticated
  USING (is_bcc_team());
```

### 3.9 Cleanup Cron Jobs

```sql
-- Delete stale sessions (no heartbeat in 10 minutes)
-- Run every 5 minutes via pg_cron or Vercel cron
CREATE OR REPLACE FUNCTION cleanup_stale_sessions()
RETURNS void AS $$
BEGIN
  DELETE FROM active_sessions WHERE last_heartbeat < NOW() - INTERVAL '10 minutes';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Delete old uptime checks (older than 90 days)
-- Run daily
CREATE OR REPLACE FUNCTION cleanup_old_uptime_checks()
RETURNS void AS $$
BEGIN
  DELETE FROM uptime_checks WHERE checked_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Delete old auto_errors (older than 90 days)
-- Run daily
CREATE OR REPLACE FUNCTION cleanup_old_auto_errors()
RETURNS void AS $$
BEGIN
  DELETE FROM auto_errors WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## 4. BCC SDK — Error Capture Module

### 4.1 Overview

The BCC SDK expands from Phase 1's bug report widget to include three new modules: automated error capture, heartbeat, and a product-side health endpoint. Each module is independent — products can adopt them incrementally.

### 4.2 SDK File Structure

```
bcc-sdk/
├── BugReportWidget.tsx       -- Phase 1 (already exists)
├── ErrorBoundary.tsx         -- NEW: React error boundary
├── withErrorCapture.ts       -- NEW: API route wrapper
├── useFetchInterceptor.ts    -- NEW: client-side fetch error capture
├── useHeartbeat.ts           -- NEW: active session heartbeat hook
├── bcc-client.ts             -- NEW: shared HTTP client for BCC API
├── fingerprint.ts            -- NEW: error fingerprint generation
├── types.ts                  -- Shared types (extend from Phase 1)
└── health-route.ts           -- NEW: standard /api/health route handler
```

### 4.3 Fingerprint Generation (`fingerprint.ts`)

Generates a consistent hash for grouping identical errors.

```typescript
// Algorithm:
// 1. Take error_message
// 2. Take first meaningful line of stack trace (skip "Error:" prefix, skip node_modules frames)
// 3. Concatenate: `${error_message}::${first_meaningful_stack_frame}`
// 4. SHA-256 hash → hex string (first 16 chars)
//
// Example:
// error_message: "Cannot read properties of undefined (reading 'map')"
// stack: "at VoiceChannelList (src/components/VoiceChannelList.tsx:42:18)"
// fingerprint: "a3f8b2c1e9d04567"
//
// This means the same error at the same location always groups together,
// but the same error message at different locations creates different groups.
```

Implementation requirements:
- Use Web Crypto API (`crypto.subtle.digest`) for hashing — works in both browser and Edge Runtime
- Normalize stack traces: strip line/column numbers that change between builds (keep file path + function name only)
- If no stack trace available, hash just the error message
- Must be deterministic: same input always produces same fingerprint

### 4.4 Error Boundary (`ErrorBoundary.tsx`)

A React Error Boundary component that wraps the product's root layout.

```typescript
// What it catches:
// - Unhandled React rendering errors
// - Errors thrown during event handlers that propagate to React
//
// What it does:
// 1. Catches the error via componentDidCatch
// 2. Generates a fingerprint
// 3. POSTs to product's /api/bcc/error route (which forwards to BCC)
// 4. Renders a user-friendly fallback UI:
//    - "Something went wrong" message
//    - "Report this issue" button (opens BugReportWidget with error pre-filled)
//    - "Reload page" button
//
// Debouncing:
// - Track sent fingerprints in a Set (in-memory, per session)
// - Don't send the same fingerprint more than once per 60 seconds
// - Reset debounce set every 5 minutes
//
// Usage in product's layout.tsx:
// <BCCErrorBoundary product="bedrock-chat">
//   {children}
// </BCCErrorBoundary>
```

Props:
- `product`: string (product identifier)
- `fallback?`: React component (custom fallback UI, optional)
- `onError?`: callback for product-specific error handling alongside BCC reporting

### 4.5 API Route Wrapper (`withErrorCapture.ts`)

A higher-order function that wraps Next.js App Router route handlers to catch server-side errors.

```typescript
// Usage:
// export const POST = withErrorCapture('bedrock-chat', async (request) => {
//   // normal route handler logic
//   return NextResponse.json({ ok: true });
// });
//
// What it does:
// 1. Wraps the handler in try/catch
// 2. On error: generates fingerprint, POSTs to BCC error API asynchronously
//    (uses waitUntil or fire-and-forget — does NOT block the response)
// 3. Returns appropriate error response to the client (500 with generic message)
// 4. Captures: error_message, stack_trace, source: 'server',
//    request.url, request.method, app_version from env
//
// Important: This does NOT replace the product's own error handling.
// If the handler already catches errors and returns proper responses,
// this wrapper won't interfere. It only catches truly unhandled exceptions.
```

### 4.6 Fetch Interceptor (`useFetchInterceptor.ts`)

A React hook that patches `window.fetch` to report failed API calls.

```typescript
// Usage (in a client component near root):
// useFetchInterceptor({ product: 'bedrock-chat' });
//
// What it does:
// 1. Wraps window.fetch
// 2. After each fetch response, checks if !response.ok (status >= 400)
// 3. If error: generates fingerprint from `${status}::${url_path}`,
//    POSTs to product's /api/bcc/error route
// 4. Returns the original response unchanged (interceptor is transparent)
//
// Configuration:
// - excludeUrls: string[] — URL patterns to ignore (e.g., '/api/bcc/', analytics endpoints)
// - excludeStatuses: number[] — status codes to ignore (e.g., 401 for auth redirects)
// - debounceMs: number — don't report same URL+status combo more than once per this interval
//   Default: 300000 (5 minutes)
//
// Important:
// - Only patches fetch in the browser (check typeof window !== 'undefined')
// - Restore original fetch on component unmount
// - Don't capture request/response bodies (privacy + performance)
// - Capture only: URL path (not query params), method, status code, status text
```

### 4.7 Heartbeat Hook (`useHeartbeat.ts`)

A React hook that sends periodic activity signals to BCC.

```typescript
// Usage (in a client component near root):
// useHeartbeat({ product: 'bedrock-chat', userId: session?.user?.id });
//
// Behavior:
// 1. Generate session_id with crypto.randomUUID(), store in sessionStorage
//    (persists across page navigations within the same tab, resets on new tab)
// 2. Track user activity: listen for mousemove, keydown, touchstart, scroll
//    Set lastActivity timestamp on each event (throttled to once per 10 seconds)
// 3. Every 60 seconds:
//    - Check if document.visibilityState === 'visible'
//    - Check if lastActivity was within the last 2 minutes
//    - If both true: POST heartbeat to product's /api/bcc/heartbeat
//    - If either false: skip (user is idle or tab is hidden)
// 4. On page unload (beforeunload): attempt navigator.sendBeacon with final heartbeat
//
// POST body:
// { product: string, session_id: string, user_id?: string }
//
// Keep it tiny. This fires every 60 seconds for every active user.
// Total payload should be < 200 bytes.
```

### 4.8 Health Route (`health-route.ts`)

A standard health check route handler that products expose at `/api/health`.

```typescript
// Usage: export { healthHandler as GET } from 'bcc-sdk/health-route';
//
// Or with custom checks:
// export const GET = createHealthHandler({
//   product: 'bedrock-chat',
//   checks: [
//     { name: 'database', check: async () => { /* ping supabase */ } },
//     { name: 'livekit', check: async () => { /* ping livekit */ } },
//   ]
// });
//
// Response (200 if all healthy, 503 if any check fails):
// {
//   status: 'healthy' | 'degraded' | 'unhealthy',
//   version: '1.2.3',      -- from package.json or env
//   timestamp: '2026-02-20T15:30:00Z',
//   checks: {
//     database: { status: 'healthy', latency_ms: 12 },
//     livekit: { status: 'healthy', latency_ms: 45 }
//   }
// }
```

### 4.9 Shared BCC Client (`bcc-client.ts`)

Internal HTTP client used by all SDK modules to POST to BCC.

```typescript
// All SDK modules POST to the product's own API routes first:
//   /api/bcc/error     → forwards to BCC /api/bcc/error
//   /api/bcc/heartbeat → forwards to BCC /api/bcc/heartbeat
//
// The product's API route adds the BCC_INGEST_KEY server-side.
// Client never sees the key.
//
// This client handles:
// - Base URL from NEXT_PUBLIC_BCC_API_URL or relative path
// - Automatic retry (1 retry after 2 second delay, then give up silently)
// - Timeout: 5 seconds
// - Silent failure: BCC reporting should NEVER break the product.
//   If the POST fails, log to console.warn and move on.
```

---

## 5. New API Routes in BCC Dashboard

### 5.1 `POST /api/bcc/error`

Ingests automated error captures from products.

**Auth:** `Authorization: Bearer {BCC_INGEST_KEY}`

**Request body:**
```typescript
{
  product: string;              // required
  error_message: string;        // required, max 2000 chars
  stack_trace?: string;         // max 10000 chars
  error_type: 'unhandled_exception' | 'api_error' | 'client_crash' | 'edge_function_error';
  source: 'client' | 'server' | 'edge_function';
  request_url?: string;
  request_method?: string;
  response_status?: number;
  current_route?: string;
  app_version?: string;
  user_agent?: string;
  user_id?: string;
  environment?: string;
  fingerprint: string;          // required, generated by client SDK
  metadata?: Record<string, any>; // max 5000 chars when stringified
}
```

**Rate limiting:** Max 100 errors per product per minute. Count using an in-memory Map keyed by product, resetting every 60 seconds. If exceeded, respond 429 but drop silently (don't let rate limiting errors cascade into more error reports).

**Response:** `201 Created` → `{ id: string, status: 'received' }` or `429` if rate limited.

### 5.2 `POST /api/bcc/heartbeat`

Receives activity heartbeats.

**Auth:** `Authorization: Bearer {BCC_INGEST_KEY}`

**Request body:**
```typescript
{
  product: string;
  session_id: string;
  user_id?: string;
}
```

**Implementation:** UPSERT into `active_sessions`:
```sql
INSERT INTO active_sessions (product, session_id, user_id, last_heartbeat)
VALUES ($1, $2, $3, NOW())
ON CONFLICT (product, session_id)
DO UPDATE SET last_heartbeat = NOW(), user_id = COALESCE(EXCLUDED.user_id, active_sessions.user_id);
```

**Response:** `200 OK` → `{ status: 'ok' }`

### 5.3 `POST /api/webhook/vercel-deploy`

Receives Vercel deployment webhooks.

**Auth:** Verify `x-vercel-signature` header against `VERCEL_WEBHOOK_SECRET` env var using HMAC-SHA1.

**Vercel sends:**
```json
{
  "type": "deployment.succeeded",
  "payload": {
    "deployment": {
      "id": "dpl_xxx",
      "url": "bedrock-chat-xxx.vercel.app",
      "meta": {
        "githubCommitSha": "abc123",
        "githubCommitMessage": "fix: voice channel reconnect",
        "githubCommitRef": "main",
        "githubCommitAuthorLogin": "braxton"
      }
    },
    "project": {
      "name": "bedrock-chat"
    }
  }
}
```

**Processing:**
1. Verify signature
2. Only process `deployment.succeeded` events (ignore `deployment.created`, `deployment.error`, etc.)
3. Map `project.name` to `bcc_products.id` — use a configurable mapping in env or a lookup table:
   ```
   VERCEL_PROJECT_MAP=bedrock-chat:bedrock-chat,echosafe-app:echosafe,quoteflow:quoteflow
   ```
4. If project doesn't map to a known product, log warning and respond 200 (don't reject)
5. Insert into `deployments` table
6. Respond 200 OK

**Response:** `200 OK` always (Vercel retries on non-2xx)

### 5.4 `GET /api/cron/uptime-ping`

Vercel Cron job that pings all active products.

**Schedule:** Every 5 minutes (`*/5 * * * *` in `vercel.json`)

**Auth:** Verify `CRON_SECRET` header (Vercel adds this automatically for cron routes).

**Logic:**
```
1. Fetch all products from bcc_products WHERE is_active = true AND health_endpoint IS NOT NULL
2. For each product (in parallel with Promise.allSettled):
   a. Fetch health_endpoint with 10-second timeout
   b. Record: status_code, response_time_ms, is_healthy
   c. If fetch throws (timeout, DNS failure, etc.): is_healthy = false, error_message = error.message
   d. INSERT into uptime_checks
3. For each result:
   a. If is_healthy = false:
      - Check previous check for this product
      - If previous was healthy → this is a NEW downtime event → send email notification
   b. If is_healthy = true:
      - Check previous check for this product
      - If previous was unhealthy → product RECOVERED → send email notification
4. Respond 200 OK with summary
```

**Vercel cron config (`vercel.json`):**
```json
{
  "crons": [
    {
      "path": "/api/cron/uptime-ping",
      "schedule": "*/5 * * * *"
    },
    {
      "path": "/api/cron/cleanup",
      "schedule": "0 3 * * *"
    }
  ]
}
```

### 5.5 `GET /api/cron/cleanup`

Daily cleanup job.

**Schedule:** 3:00 AM UTC daily

**Logic:**
1. Delete stale active_sessions (last_heartbeat > 10 min ago)
2. Delete old uptime_checks (> 90 days)
3. Delete old auto_errors (> 90 days)
4. Refresh error_groups materialized view
5. Log counts of deleted rows

---

## 6. New Dashboard Pages

### 6.1 Updated App Structure

```
app/
├── layout.tsx                          -- update sidebar: enable Errors, Uptime, Deploys, Overview
├── page.tsx                            -- redirect to /overview (was /bugs in Phase 1)
├── login/page.tsx                      -- unchanged
├── overview/
│   └── page.tsx                        -- NEW: command center
├── bugs/
│   ├── page.tsx                        -- unchanged
│   └── [id]/page.tsx                   -- unchanged
├── errors/
│   ├── page.tsx                        -- NEW: grouped error list
│   └── [fingerprint]/
│       └── page.tsx                    -- NEW: error group detail
├── uptime/
│   └── page.tsx                        -- NEW: uptime status
├── deploys/
│   └── page.tsx                        -- NEW: deployment history
└── api/
    ├── bcc/
    │   ├── report/route.ts             -- unchanged
    │   ├── screenshot/route.ts         -- unchanged
    │   ├── error/route.ts              -- NEW
    │   └── heartbeat/route.ts          -- NEW
    ├── webhook/
    │   └── vercel-deploy/route.ts      -- NEW
    ├── cron/
    │   ├── uptime-ping/route.ts        -- NEW
    │   └── cleanup/route.ts            -- NEW
    └── auth/callback/route.ts          -- unchanged
```

### 6.2 Overview Page (`/overview`) — Command Center

This becomes the default landing page. Everything important in one view.

**Section 1: Product Health Bar (top of page, always visible)**

Horizontal row of cards, one per active product:
- Product name
- Status dot: green (healthy), yellow (degraded — response time > 2000ms), red (down — last check unhealthy), gray (no health endpoint configured)
- Last check: "2 min ago"
- Response time: "142ms"
- Active users: "12 active" (from active_user_counts view)
- Click card → `/uptime` filtered to that product

Data source: latest row from `uptime_checks` per product + `active_user_counts` view
Refresh: poll every 60 seconds (no realtime subscription needed — uptime checks happen every 5 min)

**Section 2: Open Bug Summary**

Three stat cards:
- **Blockers**: count where severity='blocker' AND status IN ('new','in-progress'). Red background if > 0.
- **Major**: count where severity='major' AND status IN ('new','in-progress'). Yellow if > 5.
- **Total Open**: count where status IN ('new','in-progress').

Below stats: compact list of 5 most recent bugs with status='new'. Each shows severity badge, product badge, description (truncated), relative time.

"View all →" links to `/bugs`

**Section 3: Error Trend Chart**

Recharts `<AreaChart>` showing error count per day for the last 14 days.
- Stacked areas, one color per product
- Tooltip: hover shows breakdown per product
- X-axis: dates. Y-axis: error count.

Data source: `SELECT date_trunc('day', created_at) as day, product, COUNT(*) FROM auto_errors WHERE created_at > NOW() - INTERVAL '14 days' GROUP BY day, product ORDER BY day`

Below chart: "Top 3 errors (24h)" — show the 3 error groups with highest `occurrences_24h` from `error_groups`. Each shows: truncated error message, occurrence count, product badge.

"View all →" links to `/errors`

**Section 4: Recent Deployments**

Compact list of last 5 deployments:
- Product badge
- Commit message (truncated to 60 chars)
- Branch badge (if not 'main')
- Deployed by
- Relative time

"View all →" links to `/deploys`

**Section 5: Active Users by Product**

Recharts `<BarChart>` — horizontal bars, one per product.
- Bar length = active user count
- Label on each bar: count number
- Refresh: poll every 60 seconds

Data source: `active_user_counts` view

### 6.3 Errors Page (`/errors`)

**Top bar: Error stats**
- Total unique error groups (active, not resolved/ignored)
- Total occurrences in last 24h
- Total affected users in last 24h

**Filters:**
- Product: dropdown (All, per product)
- Source: chips (Client, Server, Edge Function)
- Status: chips (Active, Acknowledged, Resolved, Ignored) — from `error_group_status`
- Time range: Last 24h, 7 days, 30 days
- Min occurrences: number input (default: 1)

**Table: Error groups**

| Column | Notes |
|--------|-------|
| Error Message | Truncated, monospace, max 1 line |
| Product | Badge |
| Source | client/server/edge_function |
| Count (24h) | Number with small sparkline (7 days) |
| Affected Users | Distinct count |
| First Seen | Date |
| Last Seen | Relative time |
| Status | From error_group_status (active/acknowledged/resolved/ignored) |

Default sort: last_seen DESC
Click row → `/errors/[fingerprint]`

**Sparkline implementation:** For each error group, query daily counts for the last 7 days. Render as a tiny inline Recharts `<LineChart>` (50px wide, 20px tall, no axes). This gives a visual trend without taking up space. If this is too expensive to render for many rows, make it a hover-only tooltip instead.

**Refresh button:** "Refresh data" button that calls `refresh_error_groups()` and reloads the page.

### 6.4 Error Detail Page (`/errors/[fingerprint]`)

**Header:**
- Full error message (monospace, wrapped)
- Product badge, source badge, error type badge
- Status dropdown: Active | Acknowledged | Resolved | Ignored (saves to `error_group_status`)
- Notes textarea (saves to `error_group_status`)

**Occurrence Timeline:**
Recharts `<BarChart>` showing occurrences per day for last 30 days. Highlights today in a different color.

**Sample Stack Trace:**
Collapsible code block with syntax highlighting (use a simple `<pre>` with monospace font — don't add a syntax highlighting library just for this). Show the full stack trace from the sample.

**Claude Fix Prompt:**
Same "Generate Fix Prompt" button as bugs, but adapted for errors:
- Pre-fills with error_message, stack_trace, source, and the route where it occurred
- Uses the "Root Cause Analysis" template by default (since automated errors often need deeper investigation than user-reported bugs)

**Recent Occurrences:**
Table of the last 20 individual `auto_errors` matching this fingerprint:

| Timestamp | User | Route | User Agent | Request |
|-----------|------|-------|------------|---------|
| 2m ago | user_123 | /channels/voice | Chrome/macOS | GET /api/channels |

Expandable rows to see full metadata (JSONB field, user_agent, etc.)

### 6.5 Uptime Page (`/uptime`)

One section per active product with a health endpoint.

**Per product:**

**Status Header:**
- Large status dot + text: "Healthy" (green), "Degraded" (yellow), "Down" (red)
- Current response time
- Last checked: relative time

**Uptime Percentages:**
Three inline metrics:
- 24-hour uptime: `(healthy_checks / total_checks * 100)%`
- 7-day uptime: same formula
- 30-day uptime: same formula
Format: "99.8%" with color coding (green > 99%, yellow > 95%, red <= 95%)

**Response Time Chart:**
Recharts `<LineChart>` showing response_time_ms over the last 24 hours.
- Each data point = one uptime check (every 5 min = 288 points/day)
- Reference lines: average (dashed gray), p95 (dashed yellow)
- Points where is_healthy = false: highlighted in red

**Incident Log:**
List of downtime events (consecutive unhealthy checks):
- Start time, end time (or "Ongoing"), duration
- Error message from first failure
- Sorted newest first

Computing incidents: Group consecutive unhealthy checks by product. A gap of one healthy check between two unhealthy checks = two separate incidents. An incident is "ongoing" if the most recent check for the product is unhealthy.

**Auto-refresh:** Page polls for new data every 60 seconds.

### 6.6 Deployments Page (`/deploys`)

**Filters:**
- Product: dropdown
- Environment: chips (Production, Staging, Preview)
- Date range: Last 7 days, 30 days, 90 days

**Timeline view:**
Vertical timeline, newest at top. Each deployment is a card:

```
┌──────────────────────────────────────┐
│ [Bedrock Chat]  [production]         │
│                                      │
│ fix: voice channel reconnect logic   │
│                                      │
│ abc1234 · main · by braxton          │
│ 2 hours ago                          │
│                                      │
│ Notes: Fixed the LiveKit reconnect   │
│ issue that caused dropped calls      │
└──────────────────────────────────────┘
```

- Commit hash: first 7 chars, linked to GitHub commit URL if `repo_url` is set on the product
- Branch: shown in a small badge, only if not 'main'
- Environment: color-coded badge (green=production, yellow=staging, gray=preview)
- Notes: shown only if present

**Manual deploy log:**
A small "Log a deploy" button at the top for manually recording deploys (for products not on Vercel or for hotfixes):
- Product dropdown
- Commit hash (optional)
- Notes (required if no commit hash)
- Saves to `deployments` table

---

## 7. Realtime Subscriptions

### 7.1 What Gets Realtime Updates

| Event | Page | Implementation |
|-------|------|---------------|
| New bug report | `/bugs`, `/overview` | Supabase Realtime: subscribe to INSERT on `bug_reports` |
| Bug status change | `/bugs`, `/bugs/[id]` | Supabase Realtime: subscribe to UPDATE on `bug_reports` |
| New auto error | `/overview` | Supabase Realtime: subscribe to INSERT on `auto_errors` |

### 7.2 Implementation Notes

- Use Supabase Realtime Broadcast with `realtime.broadcast_changes()` trigger approach (recommended by Supabase for scalability over direct Postgres Changes)
- Set up private channels with RLS authorization
- On new bug_report INSERT: show toast notification in dashboard ("New blocker in Bedrock Chat"), prepend to list
- On bug_report UPDATE: update the row in place if visible, update stat counts
- On auto_error INSERT: increment the error count in the overview section (don't try to update the error_groups view in real-time — that's a materialized view. Just show "+1" on the raw count)
- Only subscribe when the relevant page is open. Unsubscribe on page navigation to conserve connections.

### 7.3 Fallback

If Supabase Realtime setup is complex or causes issues, fall back to polling every 30 seconds on pages that need fresh data. Realtime is a nice-to-have in Phase 2, not a blocker.

---

## 8. Email Notifications — Phase 2 Additions

### 8.1 New Notification Triggers

| Event | Subject | Priority |
|-------|---------|----------|
| Product goes down | `[BCC] ⚠️ {product} is DOWN` | Immediate |
| Product recovers | `[BCC] ✅ {product} recovered ({duration} downtime)` | Immediate |
| New blocker bug | Already implemented in Phase 1 | Immediate |

### 8.2 Downtime Email Content

**Down notification:**
```
{product_display_name} is not responding.

Status: {status_code or 'unreachable'}
Error: {error_message}
Endpoint: {health_endpoint}
Detected: {checked_at}

View in BCC: {dashboard_url}/uptime
```

**Recovery notification:**
```
{product_display_name} is back online.

Downtime duration: {duration_formatted}
Current response time: {response_time_ms}ms

View in BCC: {dashboard_url}/uptime
```

---

## 9. Recharts Integration

### 9.1 Dependencies

```bash
npm install recharts@^3.7
```

### 9.2 Chart Components Needed

| Chart | Page | Type | Data |
|-------|------|------|------|
| Error trend (14d) | /overview | AreaChart, stacked | daily error counts by product |
| Active users | /overview | BarChart, horizontal | active count per product |
| Error sparklines | /errors | LineChart, tiny inline | 7-day daily counts per group |
| Occurrence timeline | /errors/[fp] | BarChart | 30-day daily counts for one group |
| Response time | /uptime | LineChart | 24h response_time_ms per product |

### 9.3 Chart Styling

- Dark theme: dark background, light grid lines, bright data colors
- Product color mapping (consistent across all charts):
  - Bedrock Chat: `#00D9FF` (cyan)
  - EchoSafe: `#10B981` (emerald)
  - QuoteFlow: `#F59E0B` (amber)
- Use Recharts v3 custom components where needed (no `Customized` wrapper — deprecated in v3)
- Tooltips: dark background with light text, rounded corners
- Responsive: charts should fill their container width

---

## 10. Environment Variables — Phase 2 Additions

### BCC Dashboard (add to existing Vercel env)
```env
# Vercel webhook verification
VERCEL_WEBHOOK_SECRET=whsec_xxxxxxxxxxxx

# Vercel cron auth (auto-provided by Vercel for cron routes)
CRON_SECRET=auto_provided_by_vercel

# Vercel project name → BCC product ID mapping
VERCEL_PROJECT_MAP=bedrock-chat:bedrock-chat,echosafe-app:echosafe,quoteflow-app:quoteflow
```

### Each Product (add to existing env alongside Phase 1 vars)
```env
# These were added in Phase 1:
# NEXT_PUBLIC_BCC_API_URL=https://bedrock-bcc.vercel.app
# BCC_INGEST_KEY=bcc_sk_xxxxxxxxxxxx

# New for Phase 2:
# No new env vars needed — SDK modules use the same BCC_API_URL and INGEST_KEY
```

---

## 11. Implementation Checklist — Phase 2

Complete in order. Each step should be working before starting the next.

### Step 1: Database Schema
- [ ] Run all new table creation SQL (auto_errors, error_group_status, uptime_checks, deployments, active_sessions)
- [ ] Create materialized view + refresh function
- [ ] Create active_user_counts view
- [ ] Create cleanup functions
- [ ] Apply all new RLS policies
- [ ] Test: verify team user can query new tables, non-team cannot

### Step 2: New API Routes
- [ ] `POST /api/bcc/error` with validation, rate limiting, fingerprint
- [ ] `POST /api/bcc/heartbeat` with UPSERT logic
- [ ] `POST /api/webhook/vercel-deploy` with signature verification
- [ ] `GET /api/cron/uptime-ping` with health endpoint fetching
- [ ] `GET /api/cron/cleanup` with data retention logic
- [ ] Test all endpoints with curl

### Step 3: Vercel Configuration
- [ ] Add cron config to `vercel.json`
- [ ] Set up Vercel webhook for each product's Vercel project pointing to BCC's webhook URL
- [ ] Deploy and verify crons execute on schedule

### Step 4: Install Recharts
- [ ] `npm install recharts@^3.7`
- [ ] Build reusable chart wrapper components with dark theme styling
- [ ] Build the product color mapping utility

### Step 5: Overview Page
- [ ] Build product health bar with uptime status
- [ ] Build open bug summary section
- [ ] Build error trend chart (AreaChart)
- [ ] Build recent deployments section
- [ ] Build active users bar chart
- [ ] Wire all sections to Supabase queries
- [ ] Set default landing page from /bugs to /overview

### Step 6: Errors Page
- [ ] Build `/errors` page with grouped error list
- [ ] Implement filters (product, source, status, time range)
- [ ] Build sparkline components for inline trend display
- [ ] Build refresh button for materialized view

### Step 7: Error Detail Page
- [ ] Build `/errors/[fingerprint]` with full error info
- [ ] Build occurrence timeline chart
- [ ] Build recent occurrences table with expandable rows
- [ ] Integrate Claude fix prompt generator (adapt from bug detail templates)
- [ ] Implement status management via error_group_status table

### Step 8: Uptime Page
- [ ] Build per-product uptime display with status indicators
- [ ] Calculate and display uptime percentages (24h, 7d, 30d)
- [ ] Build response time line chart
- [ ] Build incident log with downtime grouping logic
- [ ] Implement auto-refresh polling

### Step 9: Deployments Page
- [ ] Build timeline view with deployment cards
- [ ] Implement filters (product, environment, date range)
- [ ] Build manual deploy log form
- [ ] Link commit hashes to GitHub

### Step 10: BCC SDK Modules
- [ ] Build fingerprint.ts
- [ ] Build ErrorBoundary.tsx
- [ ] Build withErrorCapture.ts
- [ ] Build useFetchInterceptor.ts
- [ ] Build useHeartbeat.ts
- [ ] Build health-route.ts
- [ ] Build bcc-client.ts shared HTTP client
- [ ] Document SDK integration steps for each product

### Step 11: Integrate SDK into Bedrock Chat
- [ ] Add ErrorBoundary to root layout
- [ ] Add useFetchInterceptor to a client component
- [ ] Add useHeartbeat to a client component
- [ ] Add /api/health route
- [ ] Add /api/bcc/error proxy route
- [ ] Add /api/bcc/heartbeat proxy route
- [ ] Test: trigger an error → verify it appears in BCC errors page
- [ ] Test: verify heartbeat → active user count appears in BCC

### Step 12: Realtime + Email
- [ ] Set up Supabase Realtime subscriptions for bug_reports and auto_errors
- [ ] Add toast notifications for new bugs/errors
- [ ] Add downtime/recovery email notifications to uptime pinger
- [ ] Test full flow end-to-end
- [ ] If realtime is too complex: fall back to 30-second polling

### Step 13: Sidebar Update
- [ ] Enable all nav items (remove "Coming soon" state from Errors, Uptime, Deploys)
- [ ] Add Overview as first nav item
- [ ] Add active indicator badges on nav items (e.g., red dot on Errors if there are new errors today)

---

## 12. Performance Considerations

- **Error ingestion rate limiting:** 100/product/minute prevents cascading failure floods
- **Materialized view over live aggregation:** error_groups avoids expensive GROUP BY on every page load
- **Heartbeat UPSERT over INSERT:** Prevents table bloat from repeated heartbeats
- **Cron cleanup:** 90-day retention keeps table sizes manageable
- **Chart data queries:** Always include a WHERE on created_at to prevent full table scans
- **Sparklines:** If rendering 50+ tiny charts on the errors page is slow, switch to hover-only tooltips
- **Realtime subscriptions:** Only subscribe on relevant pages, unsubscribe on navigate away

---

## 13. Success Criteria — Phase 2

Phase 2 is done when:

1. ✅ An unhandled error in Bedrock Chat automatically appears in BCC's errors page within 10 seconds
2. ✅ The overview page shows product health, open bugs, error trends, deploys, and active users in one view
3. ✅ When Bedrock Chat goes down, Braxton gets an email within 5 minutes
4. ✅ Vercel deploys are automatically logged with commit info
5. ✅ Error groups show occurrence trends and the Claude fix prompt works for automated errors
6. ✅ Active user counts are visible per product
7. ✅ The BCC SDK is integrated into Bedrock Chat and documented for QuoteFlow/EchoSafe