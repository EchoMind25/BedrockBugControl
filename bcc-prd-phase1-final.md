# Bedrock AI — Bug Control Center (BCC)

## Product Requirements Document v1.1 — Phase 1

**Author:** Braxton / Claude Opus 4.6
**Date:** February 20, 2026
**Target Implementation:** Claude Code / Opus 4.6
**Scope:** Phase 1 only — Foundation build
**Status:** Ready for implementation

---

## 1. What This Is

The Bug Control Center (BCC) is Bedrock AI's centralized internal dashboard for managing bug reports across all products. Phase 1 delivers the bug triage system with a PWA-installable dashboard and Claude-powered fix prompt generation.

**Internal-only tool. Just us. Function over form.**

**Deploy:** Vercel default URL (no custom domain — use the `*.vercel.app` URL Vercel assigns)
**Database:** NEW standalone Supabase project (separate from Bedrock Chat, EchoSafe, and QuoteFlow — each product has its own database)
**Auth:** Supabase Auth on the BCC project, gated to team email(s)
**PWA:** Installable to home screen on mobile and desktop

### What Phase 1 Includes
- Bug report ingestion API (products POST bug reports here)
- Bug report widget component (drops into any Bedrock AI product)
- Bug triage dashboard (list, detail, status management)
- Claude fix prompt generator (copy-paste prompts for Claude Code)
- PWA installability
- Email notification on blocker bugs

### What Phase 1 Does NOT Include (deferred to Phase 2+)
- Automated error capture / error boundaries
- Uptime monitoring
- Deployment tracking
- Active user heartbeats
- Error trend charts
- Realtime subscriptions
- Overview command center page

These are documented at the end of this PRD as the Phase 2 roadmap so Opus knows what's coming and doesn't make architectural decisions that block them.

---

## 2. Architecture

### 2.1 System Topology

```
┌─────────────────────────────────────────────┐
│           BCC Dashboard (PWA)                │
│        (bedrock-bcc.vercel.app)              │
│     Next.js 15 + Supabase Client             │
│                                              │
│  ┌──────────┬──────────┬──────────┐         │
│  │ Bug      │ Bug      │ Claude   │         │
│  │ List     │ Detail   │ Prompts  │         │
│  └──────────┴──────────┴──────────┘         │
└──────────────────┬──────────────────────────┘
                   │
                   │ Supabase Client (RLS-gated)
                   ▼
┌─────────────────────────────────────────────┐
│         BCC Supabase Project (NEW)           │
│         (separate from all products)         │
│                                              │
│  Tables:                                     │
│  ├── bug_reports                             │
│  └── bcc_products                            │
│                                              │
│  Storage:                                    │
│  └── bug-screenshots (private bucket)        │
└─────────────────────────────────────────────┘
                   ▲
                   │ POST /api/bcc/report
                   │ (API key auth)
                   │
     ┌─────────────┼─────────────┐
     │             │             │
┌────┴────┐ ┌─────┴────┐ ┌─────┴────┐
│ Bedrock │ │  Echo    │ │ Quote   │
│ Chat    │ │  Safe    │ │ Flow    │
│         │ │          │ │         │
│ Widget  │ │ Widget   │ │ Widget  │
│ (own DB)│ │ (own DB) │ │(own DB) │
└─────────┘ └──────────┘ └─────────┘

Key: Each product keeps its own Supabase DB.
BCC has its own Supabase DB. Products send bug
reports to BCC's API. No shared databases.
```

### 2.2 Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Framework | Next.js 15.x (latest stable) | App Router, Server Components |
| Language | TypeScript 5.x | Strict mode |
| Database | Supabase (new project) | Separate from all product DBs |
| Auth | Supabase Auth | Email-based, team allowlist |
| Styling | Tailwind CSS 4.x | Minimal, dark theme |
| Charts | None in Phase 1 | Recharts 3.7 will be added in Phase 2 |
| Deployment | Vercel | Default *.vercel.app URL |
| Email | Resend | Free tier (100/day), blocker notifications only |
| PWA | next-pwa or manual SW | Installable, offline shell |

### 2.3 Key Design Decisions

- **Separate Supabase project:** BCC does NOT share a database with any product. Bedrock Chat, EchoSafe, and QuoteFlow each have their own Supabase projects. BCC gets a new one. Products communicate with BCC via HTTP POST to BCC's API routes.
- **API key auth for ingestion:** Products authenticate to BCC using a shared secret (`BCC_INGEST_KEY` env var), not user tokens. This keeps product databases completely isolated from BCC.
- **No custom domain:** Use Vercel's default URL. Save the money for product domains.
- **PWA for quick access:** Since there's no custom domain, having it installable as a PWA on Braxton's phone/desktop means fast access without remembering a URL.
- **Claude prompt templates over AI integration:** Rather than calling the Claude API from the dashboard (which costs money and adds complexity), BCC generates structured copy-paste prompts that Braxton drops into Claude Code or a Claude chat. Zero API cost, maximum usefulness.

---

## 3. Database Schema

### 3.1 New Supabase Project Setup

Create a new Supabase project for BCC. This is completely separate from Bedrock Chat, EchoSafe, and QuoteFlow projects.

### 3.2 `bcc_products` — Product Registry

```sql
CREATE TABLE bcc_products (
  id TEXT PRIMARY KEY,                          -- 'bedrock-chat', 'echosafe', 'quoteflow'
  display_name TEXT NOT NULL,                   -- 'Bedrock Chat'
  production_url TEXT,                          -- 'https://bedrockchat.com'
  repo_url TEXT,                                -- 'https://github.com/bedrockai/bedrock-chat'
  health_endpoint TEXT,                         -- Phase 2: for uptime monitoring
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed with current products
INSERT INTO bcc_products (id, display_name, production_url) VALUES
  ('bedrock-chat', 'Bedrock Chat', NULL),
  ('echosafe', 'EchoSafe', 'https://echosafe.app'),
  ('quoteflow', 'QuoteFlow', NULL);
```

### 3.3 `bug_reports` — Manual User Submissions

```sql
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

CREATE INDEX idx_bug_reports_product ON bug_reports(product);
CREATE INDEX idx_bug_reports_status ON bug_reports(status);
CREATE INDEX idx_bug_reports_severity ON bug_reports(severity);
CREATE INDEX idx_bug_reports_created ON bug_reports(created_at DESC);
CREATE INDEX idx_bug_reports_product_status ON bug_reports(product, status);

-- Auto-update updated_at on changes
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
```

### 3.4 RLS Policies

```sql
ALTER TABLE bug_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE bcc_products ENABLE ROW LEVEL SECURITY;

-- Helper: check if current user is Bedrock AI team
CREATE OR REPLACE FUNCTION is_bcc_team()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (
    auth.jwt() ->> 'email' IN (
      'braxton@bedrockai.systems'
      -- Add team members here as needed
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- bug_reports: ingestion happens via service_role (API routes), NOT via client RLS
-- Team can SELECT and UPDATE from the dashboard
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
```

### 3.5 Storage Bucket

```sql
INSERT INTO storage.buckets (id, name, public) VALUES ('bug-screenshots', 'bug-screenshots', false);

-- Products upload via service_role key through BCC API (no client-side upload policy needed)
-- Team views via signed URLs from the dashboard

CREATE POLICY "Team can view bug screenshots"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'bug-screenshots' AND is_bcc_team());
```

---

## 4. PWA Configuration

### 4.1 Requirements

- Installable on iOS (Add to Home Screen), Android, and desktop (Chrome/Edge install prompt)
- App name: "BCC" (short name for home screen icon)
- Full name: "Bug Control Center"
- Theme: dark (match dashboard theme)
- Offline: show cached shell with "No connection — data will refresh when online" message
- Icon: simple bug/beetle icon or Bedrock AI logo variant, sizes: 192x192, 512x512

### 4.2 Implementation

Use `next-pwa` package (or manual service worker if next-pwa has compatibility issues with Next.js 15).

**`public/manifest.json`:**
```json
{
  "name": "Bug Control Center",
  "short_name": "BCC",
  "description": "Bedrock AI internal bug tracking",
  "start_url": "/bugs",
  "display": "standalone",
  "background_color": "#0f172a",
  "theme_color": "#0f172a",
  "orientation": "any",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

**Service worker strategy:**
- Cache the app shell (HTML, CSS, JS bundles) for offline access
- API requests: network-first, fall back to showing stale data with a "stale" indicator
- Do NOT cache bug report data aggressively — freshness matters more than offline access for an internal tool

**Meta tags in root layout `<head>`:**
```html
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#0f172a" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<link rel="apple-touch-icon" href="/icons/icon-192.png" />
```

---

## 5. Claude Fix Prompt Generator

### 5.1 Concept

Every bug report in the BCC dashboard has a **"Generate Fix Prompt"** button. Clicking it assembles a structured, context-rich prompt that Braxton can copy-paste directly into Claude Code (which has codebase context) or a new Claude.ai chat.

This is NOT an API call to Claude. It's a client-side template engine that outputs text. Zero cost, instant, works offline.

### 5.2 Prompt Templates

Three prompt variants per bug, selectable via tabs or dropdown:

**Template A: "Quick Fix" (default)**
For straightforward bugs where the issue is clear.

```
## Bug Fix Request

**Product:** {product_display_name}
**Severity:** {severity}
**Route:** {current_route}
**Reported:** {created_at_formatted}

### What the user reported:
{description}

### Steps to reproduce:
{steps_to_reproduce}

{if stack_trace}
### Error / Stack Trace:
```
{stack_trace}
```
{/if}

### Instructions:
1. Locate the code responsible for the route `{current_route}` in this project.
2. Reproduce the issue based on the steps above.
3. Identify the root cause and implement a fix.
4. Verify the fix doesn't break adjacent functionality.
5. Briefly explain what caused the bug and what you changed.
```

**Template B: "Root Cause Analysis"**
For bugs where the cause isn't obvious.

```
## Root Cause Analysis Request

**Product:** {product_display_name}
**Severity:** {severity}
**Route:** {current_route}
**Browser/Device:** {user_agent_parsed}
**Viewport:** {viewport}
**App Version:** {app_version}

### Bug Report:
{description}

### Steps to reproduce:
{steps_to_reproduce}

{if screenshot_url}
### Screenshot:
A screenshot is attached showing the bug state.
{/if}

### Instructions:
I need you to investigate this bug deeply before fixing it:

1. **Trace the data flow** for the route `{current_route}` — from the user action through component state, API calls, server logic, and database queries.
2. **Identify all possible causes** — list them, then narrow down to the most likely.
3. **Check for related vulnerabilities** — could this same root cause affect other routes or features?
4. **Implement the fix** with an explanation of why this specific approach is correct.
5. **Add defensive checks** to prevent this class of bug from recurring (input validation, error boundaries, type guards, etc.)
```

**Template C: "Security Review"**
For bugs that might have security implications (especially relevant for Bedrock Chat's privacy-first architecture).

```
## Security-Focused Bug Review

**Product:** {product_display_name}
**Severity:** {severity}
**Route:** {current_route}

### Reported Issue:
{description}

### Steps to reproduce:
{steps_to_reproduce}

### Instructions:
This bug may have security or privacy implications. Before fixing:

1. **Assess the security impact:**
   - Can this be exploited by a malicious user?
   - Does this expose user data, bypass auth, or break data isolation?
   - Does this affect RLS policies or Supabase security?
2. **Check for similar patterns** across the codebase — if this vulnerability exists in one place, it likely exists in others.
3. **Implement the fix** with security as the priority (correctness > performance > UX).
4. **Review RLS policies** for the affected tables.
5. **Document** what was vulnerable and what was changed.
```

### 5.3 UI for Prompt Generator

Located on the **Bug Detail Page** (`/bugs/[id]`):

- **"Generate Fix Prompt" button** — prominent, in the action bar next to status controls
- Clicking it opens a panel/modal with:
  - Three tabs: "Quick Fix" | "Root Cause" | "Security Review"
  - Read-only textarea showing the assembled prompt with all variables filled in
  - **"Copy to Clipboard" button** — copies the prompt text
  - **"Open in Claude.ai" button** — opens `https://claude.ai/new` in a new tab (user pastes manually — we can't pre-fill)
  - Small note: "Paste this prompt into Claude Code or Claude.ai for best results. Claude Code has your codebase context."
- After copying, update `fix_prompt_generated = true` and `fix_prompt_copied_at = NOW()` on the bug report
- On the bug list page, show a small icon/indicator for bugs where a fix prompt has been generated (helps track which bugs have been acted on)

### 5.4 Variable Parsing

The prompt generator should:
- Parse `user_agent` into a human-readable format (e.g., "Chrome 121 / macOS" instead of the full UA string)
- Format `created_at` as a readable date/time
- Conditionally include sections (stack trace, screenshot) only when data exists
- Strip any sensitive data from the prompt (user_id should NOT be included — it's irrelevant for debugging)
- Escape any characters that might break markdown formatting

### 5.5 Future Enhancement (NOT Phase 1)

In Phase 2+, we can add:
- A "prompt history" showing which prompts were generated for which bugs
- Integration with Anthropic API to have Claude suggest a fix directly in the dashboard (costs money, only add if the copy-paste workflow becomes a bottleneck)
- Auto-categorization of bugs using Claude API to suggest severity and assign to likely code areas

---

## 6. Bug Report Widget (Product-Side Component)

### 6.1 Overview

A self-contained React component that drops into any Bedrock AI product's root layout. It submits bug reports to BCC's API, NOT to the product's own database.

### 6.2 Requirements

- **Floating button**: bottom-right corner, small bug/flag icon, visible on every page
- **Tooltip on hover**: "Report a Bug"
- **Click opens modal/drawer** with:

**Step 1: Screenshot consent**
- Text: "To help us understand the bug, we'd like to capture a screenshot of your current screen. This may include visible messages or content."
- Two buttons: "Allow Screenshot" | "Skip"
- If allowed: capture viewport using `html2canvas` (lazy-loaded), excluding the modal itself
- Show preview with "Retake" and "Remove" options

**Step 2: Bug report form**
- **Bug Description** (required, textarea): "What went wrong?"
- **Steps to Reproduce** (required, textarea): "What were you doing before this happened?"
- **Severity** (required, select): Blocker / Major / Minor
- Screenshot preview (if captured in Step 1)

**Auto-captured metadata (invisible to user):**
- `product`: hardcoded per-product (e.g., `"bedrock-chat"`)
- `app_version`: from env var or package.json
- `current_route`: `window.location.pathname`
- `user_agent`: `navigator.userAgent`
- `viewport`: `${window.innerWidth}x${window.innerHeight}`
- `user_id`: from auth context if available, `null` if not
- `username`: from auth context if available

**Step 3: Submission**
1. Upload screenshot to BCC's API (which stores in BCC's Supabase Storage)
2. POST bug report to `POST {BCC_URL}/api/bcc/report`
3. Show success: "Bug report submitted. Thank you for helping improve {product_name}."
4. Close modal, reset form

### 6.3 API Communication

The widget POSTs to BCC's hosted API, NOT directly to BCC's Supabase.

```typescript
// Widget sends to:
const BCC_API_URL = process.env.NEXT_PUBLIC_BCC_API_URL; // e.g., 'https://bedrock-bcc.vercel.app'
const BCC_INGEST_KEY = process.env.BCC_INGEST_KEY;       // server-side only

// Screenshot upload: POST {BCC_API_URL}/api/bcc/screenshot
// Bug report: POST {BCC_API_URL}/api/bcc/report
// Both authenticated with BCC_INGEST_KEY in Authorization header
```

**Important:** The screenshot upload and bug report submission should go through the PRODUCT'S OWN API route first (e.g., `/api/report-bug` in Bedrock Chat), which then forwards to BCC's API using the server-side `BCC_INGEST_KEY`. This avoids exposing the BCC API key to the client.

```
User clicks submit
  → Client POSTs to product's /api/report-bug (no key needed, uses session auth)
    → Product server POSTs to BCC /api/bcc/report (with BCC_INGEST_KEY)
      → BCC server writes to BCC's Supabase
```

### 6.4 Widget Implementation Notes

- Build as a single self-contained component: `BugReportWidget.tsx`
- Mount once in root layout: `app/layout.tsx`
- Use existing Supabase auth context from the host product for user_id/username (read-only, don't import BCC's Supabase client)
- Lazy-load `html2canvas` only when screenshot is requested
- Keep the component lightweight — total bundle impact should be < 15 KB
- Modal closable via: X button, clicking backdrop, Escape key
- Form validates required fields before submission
- If submission fails: show error, keep form data, allow retry
- Z-index: ensure the floating button and modal sit above all product UI but below critical modals like auth prompts

---

## 7. BCC Dashboard Pages

### 7.1 App Structure

```
app/
├── layout.tsx                    -- root layout: auth gate, sidebar nav, dark theme, PWA meta
├── page.tsx                      -- redirects to /bugs
├── login/
│   └── page.tsx                  -- Supabase Auth login (email only)
├── bugs/
│   ├── page.tsx                  -- bug report list with filters
│   └── [id]/
│       └── page.tsx              -- bug detail + status management + Claude prompts
└── api/
    ├── bcc/
    │   ├── report/route.ts       -- bug report ingestion endpoint
    │   └── screenshot/route.ts   -- screenshot upload endpoint
    └── auth/
        └── callback/route.ts     -- Supabase auth callback
```

### 7.2 Root Layout

- **Dark theme**: slate-900 background, slate-100 text (Tailwind)
- **Sidebar nav** (left, collapsible on mobile):
  - BCC logo/title at top
  - Nav items: Bugs (active in Phase 1), Errors (grayed, "Coming soon"), Uptime (grayed), Deploys (grayed)
  - Bottom: user email, logout button
- **Auth gate**: middleware checks Supabase session. If no session → redirect to `/login`. Defense-in-depth: Server Components also verify session before rendering data (per Next.js 15 security best practices — never rely on middleware alone).
- **PWA meta tags** in `<head>` (see Section 4)
- **Mobile responsive**: sidebar collapses to hamburger menu on small screens. This is an internal tool but PWA on phone means it needs to work on mobile.

### 7.3 Login Page (`/login`)

- Simple centered card with Bedrock AI branding
- Email + password login via Supabase Auth
- No social providers, no magic link (keep it simple)
- Error handling for invalid credentials
- After login: redirect to `/bugs`

**Note:** Team members must be pre-created in BCC's Supabase Auth dashboard. There is no self-registration. The `is_bcc_team()` function provides a second layer of access control beyond auth.

### 7.4 Bug List Page (`/bugs`)

**Top bar: Stats summary**
- Three inline stat cards:
  - **Blockers**: count, red background if > 0
  - **Open Bugs**: total count where status NOT IN ('resolved', 'wont-fix', 'duplicate')
  - **Resolved This Week**: count resolved in last 7 days

**Filters (below stats, sticky on scroll):**
- **Product**: dropdown (All, Bedrock Chat, EchoSafe, QuoteFlow)
- **Status**: multi-select chips (New, In Progress, Resolved, Won't Fix, Duplicate) — default: New + In Progress selected
- **Severity**: multi-select chips (Blocker, Major, Minor) — default: all selected
- **Sort**: dropdown (Newest First, Oldest First, Severity High→Low)

**Bug table:**

| Column | Width | Notes |
|--------|-------|-------|
| Severity | 80px | Color badge: red=blocker, yellow=major, blue=minor |
| Product | 100px | Product name in small badge |
| Description | flex | First 2 lines, truncated with ellipsis |
| Reporter | 100px | Username or "Anonymous" |
| Status | 110px | Color-coded text label |
| Prompt | 40px | Small icon: ✓ if fix prompt was generated, empty if not |
| Created | 100px | Relative time ("2h ago"), full date on hover tooltip |

**Row behavior:**
- Click anywhere on row → navigate to `/bugs/[id]`
- "New" bugs have a subtle highlight (e.g., left border accent or slightly different background)
- No pagination initially — load all open bugs, lazy-load resolved if scrolling

### 7.5 Bug Detail Page (`/bugs/[id]`)

**Two-column layout on desktop, stacked on mobile.**

**Left column (main content, ~65% width):**

1. **Header**: Severity badge + Product badge + "Bug #{short_id}" + created timestamp
2. **Description**: Full text, whitespace preserved
3. **Steps to Reproduce**: Full text, whitespace preserved
4. **Screenshot**: If provided, clickable thumbnail → full-size in a lightbox modal. If no screenshot, don't show the section.
5. **Metadata** (collapsible, collapsed by default):
   - Route, user agent (parsed to readable format), viewport, app version
   - User ID, username
   - Created at, updated at

**Right column (triage panel, ~35% width, sticky on scroll):**

1. **Status**: Select dropdown → saves on change (with loading indicator)
2. **Severity**: Select dropdown → saves on change
3. **Assigned To**: Text input (free text — just type a name)
4. **Resolution Notes**: Textarea (shown when status is resolved/wont-fix/duplicate)
5. **Timestamps**: Created, Updated, Resolved at (auto-set when status changes)
6. **---** (divider)
7. **Claude Fix Prompt Section**:
   - **"Generate Fix Prompt" button** (prominent, primary color)
   - Clicking opens the prompt generator panel (see Section 5.3)
   - If prompt was already generated, show "Prompt generated {time ago}" with option to regenerate

---

## 8. API Routes

### 8.1 `POST /api/bcc/report`

Ingests bug reports from product widgets.

**Authentication:** `Authorization: Bearer {BCC_INGEST_KEY}` header. Reject with 401 if missing or invalid.

**Request body:**
```typescript
{
  product: string;              // required, must match bcc_products.id
  description: string;          // required, max 5000 chars
  steps_to_reproduce: string;   // required, max 5000 chars
  severity: 'blocker' | 'major' | 'minor'; // required
  screenshot_url?: string;      // URL from screenshot upload, if provided
  current_route?: string;
  app_version?: string;
  user_agent?: string;
  viewport?: string;
  user_id?: string;
  username?: string;
}
```

**Validation:**
- Reject if `product` doesn't exist in `bcc_products`
- Reject if required fields are missing or empty
- Sanitize strings: trim whitespace, limit lengths
- If severity is 'blocker': trigger email notification (see Section 9)

**Response:** `201 Created` → `{ id: string, status: 'received' }`

**Database write:** Uses Supabase service_role key (server-side only, never exposed to client).

### 8.2 `POST /api/bcc/screenshot`

Receives screenshot uploads from product widgets.

**Authentication:** Same `BCC_INGEST_KEY` header.

**Request:** `multipart/form-data` with:
- `file`: PNG image, max 5 MB
- `product`: string (for organizing in storage)

**Process:**
1. Validate file is an image and under size limit
2. Generate filename: `{product}/{timestamp}_{randomId}.png`
3. Upload to `bug-screenshots` bucket in BCC's Supabase Storage using service_role key
4. Return signed URL (or public URL if bucket is public — but we're keeping it private, so return a path that the dashboard can generate signed URLs for)

**Response:** `201 Created` → `{ screenshot_url: string }`

---

## 9. Email Notifications

### 9.1 When to Notify (Phase 1)

Only one trigger in Phase 1:
- **New blocker bug report** → immediate email to `braxton@bedrockai.systems`

### 9.2 Implementation

Use **Resend** (free tier: 100 emails/day).

**Setup:**
1. Create Resend account
2. Add API key as `RESEND_API_KEY` env var in Vercel
3. Verify sender domain or use Resend's default `onboarding@resend.dev` for testing

**Email format:**
- **From:** `BCC <bugs@bedrockai.systems>` (or Resend default)
- **Subject:** `[BCC] 🔴 BLOCKER: {description_first_50_chars} — {product_display_name}`
- **Body (HTML):**
  ```
  New blocker bug reported in {product_display_name}

  Description: {description_first_300_chars}
  Steps: {steps_first_300_chars}
  Reporter: {username or 'Anonymous'}
  Route: {current_route}

  View in BCC: {dashboard_url}/bugs/{id}
  ```

### 9.3 Fallback

If Resend setup takes more than 30 minutes, skip it entirely. Add a TODO comment in the code. The dashboard alone is sufficient for Phase 1 — Braxton will see new bugs when he opens the PWA.

---

## 10. Environment Variables

### BCC Dashboard (Vercel)
```env
# Supabase (BCC's own project)
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Ingestion auth
BCC_INGEST_KEY=bcc_sk_xxxxxxxxxxxx    # generate a random 32+ char string

# Email (optional, skip if setup takes too long)
RESEND_API_KEY=re_xxxxxxxxxxxx

# App
NEXT_PUBLIC_APP_URL=https://bedrock-bcc.vercel.app   # update after first deploy
```

### Each Product (Bedrock Chat, EchoSafe, QuoteFlow)
```env
# BCC integration (add to each product's env)
NEXT_PUBLIC_BCC_API_URL=https://bedrock-bcc.vercel.app
BCC_INGEST_KEY=bcc_sk_xxxxxxxxxxxx    # same key as BCC dashboard
```

---

## 11. Implementation Checklist — Phase 1

Opus should complete these in order:

### Step 1: Project Setup
- [ ] Create new Next.js 15 project with TypeScript, Tailwind CSS 4, App Router
- [ ] Set up Supabase client (`@supabase/supabase-js`, `@supabase/ssr`)
- [ ] Configure PWA: manifest.json, service worker, icons (generate simple placeholder icons)
- [ ] Set up dark theme in Tailwind config
- [ ] Configure Vercel deployment (connect to GitHub repo)

### Step 2: Database
- [ ] Create new Supabase project for BCC
- [ ] Run all SQL from Section 3: tables, indexes, RLS policies, storage bucket, trigger
- [ ] Create initial team user in Supabase Auth dashboard
- [ ] Test RLS policies manually

### Step 3: Auth + Layout
- [ ] Implement login page with Supabase Auth
- [ ] Implement auth middleware + Server Component session checks (defense-in-depth)
- [ ] Build root layout: sidebar nav, dark theme, PWA meta tags
- [ ] Test: unauthenticated users cannot access /bugs

### Step 4: API Routes
- [ ] `POST /api/bcc/report` — bug report ingestion with validation and API key auth
- [ ] `POST /api/bcc/screenshot` — screenshot upload to Supabase Storage
- [ ] Test both endpoints with curl/Postman using BCC_INGEST_KEY

### Step 5: Bug List Page
- [ ] Build `/bugs` page with filters, stats, and table
- [ ] Implement product, status, severity filters
- [ ] Implement sort functionality
- [ ] Style with dark theme, responsive layout

### Step 6: Bug Detail Page
- [ ] Build `/bugs/[id]` with two-column layout
- [ ] Implement inline status/severity updates (save on change)
- [ ] Build screenshot lightbox viewer
- [ ] Build collapsible metadata section

### Step 7: Claude Fix Prompt Generator
- [ ] Build prompt template engine with three templates (Quick Fix, Root Cause, Security)
- [ ] Build prompt generator UI (tabs, read-only display, copy button)
- [ ] Implement clipboard copy with confirmation feedback
- [ ] Track prompt generation in database (fix_prompt_generated, fix_prompt_copied_at)
- [ ] Add prompt indicator icon to bug list table

### Step 8: Bug Report Widget (for products)
- [ ] Build `BugReportWidget.tsx` as a self-contained component
- [ ] Implement screenshot consent → capture → preview flow
- [ ] Implement bug report form with validation
- [ ] Implement submission flow: screenshot upload → bug report POST → success message
- [ ] Test widget in isolation
- [ ] Document how to integrate into a product (env vars needed, layout mount point)

### Step 9: Email Notification
- [ ] Set up Resend integration
- [ ] Send email on blocker bug creation
- [ ] Test end-to-end: widget → API → database → email
- [ ] If Resend takes > 30 min: skip, add TODO

### Step 10: Final Testing + Deploy
- [ ] Test full flow: submit bug from widget → appears in dashboard → triage → generate prompt
- [ ] Test PWA: install on Chrome desktop + iOS Safari
- [ ] Test mobile responsiveness
- [ ] Deploy to Vercel
- [ ] Document the Vercel URL for product env vars

---

## 12. Security Requirements

- **Auth defense-in-depth**: Check session in BOTH middleware AND Server Components. Never rely on middleware alone (CVE-2025-29927).
- **API key validation**: All ingestion endpoints require `BCC_INGEST_KEY`. Reject 401 otherwise.
- **Service role isolation**: Only BCC's server-side code uses the service_role key. Never expose to client.
- **Screenshot privacy**: Private bucket, signed URLs only, team access only.
- **Input sanitization**: Validate and sanitize all inputs from products. Don't trust product-submitted data blindly.
- **No PII in prompts**: Claude fix prompt templates exclude user_id. Include only debugging-relevant data.
- **CORS**: BCC API routes should accept POST from known product origins only. Set CORS headers accordingly.

---

## 13. Phase 2 Roadmap (DO NOT BUILD NOW)

Opus should be aware these features are coming so it doesn't make architectural decisions that block them. But these are NOT in scope for Phase 1.

### Phase 2A: Automated Error Capture
- `auto_errors` table (schema provided in full PRD v1.0)
- Error boundary component for BCC SDK
- API wrapper for server-side error capture
- Global fetch interceptor
- Error grouping via fingerprint
- `/errors` page with grouped error list
- `/errors/[fingerprint]` detail page

### Phase 2B: Observability
- Uptime monitoring: `uptime_checks` table, cron pinger, `/uptime` page
- Deployment tracking: `deployments` table, Vercel webhook, `/deploys` page
- Active user heartbeats: `active_sessions` table, heartbeat SDK, active user counts

### Phase 2C: Command Center
- `/overview` page aggregating all data
- Error trend charts (Recharts 3.7)
- Realtime subscriptions for live updates
- Deploy ↔ error correlation

**Architectural implications for Phase 1:**
- The sidebar nav should have placeholder items for Errors, Uptime, Deploys (grayed out / "Coming soon")
- The `bcc_products` table includes `health_endpoint` and `repo_url` columns even though they're unused in Phase 1
- The API route structure (`/api/bcc/...`) should be organized to easily add `/api/bcc/error`, `/api/bcc/heartbeat`, `/api/webhook/vercel-deploy` later
- The BCC SDK structure should be modular enough to add error capture and heartbeat modules without refactoring the bug reporter

---

## 14. Dependencies — Exact Versions

**IMPORTANT:** Before installing any dependency, check npm for the actual latest stable version as of February 2026. Do NOT use alpha, beta, rc, or canary versions. The versions below are approximate starting points.

```json
{
  "dependencies": {
    "next": "^15.2",
    "react": "^19.0",
    "react-dom": "^19.0",
    "@supabase/supabase-js": "^2.49",
    "@supabase/ssr": "^0.6",
    "resend": "^4.1"
  },
  "devDependencies": {
    "typescript": "^5.7",
    "tailwindcss": "^4.0",
    "@tailwindcss/postcss": "^4.0",
    "@types/react": "^19.0",
    "@types/node": "^22.0"
  }
}
```

**Client-side (lazy-loaded):**
- `html2canvas`: ^1.4 (only loaded when user requests screenshot in widget)

**NOT needed in Phase 1:**
- `recharts` (Phase 2 — charts)
- `next-pwa` (evaluate if manual SW is simpler for Next.js 15 compatibility)

---

## 15. Success Criteria — Phase 1

Phase 1 is done when:

1. ✅ A bug submitted from the widget in Bedrock Chat appears in the BCC dashboard within 5 seconds
2. ✅ Braxton can triage bugs (change status, severity, assign, add notes) from the dashboard
3. ✅ The Claude fix prompt generator produces a copy-paste ready prompt for any bug
4. ✅ The dashboard is installable as a PWA on phone and desktop
5. ✅ Blocker bugs trigger an email notification
6. ✅ The entire system works with zero shared database dependencies between products
