# BCC Widget Integration Guide

How to add the Bug Report Widget to any Bedrock AI product (Bedrock Chat, EchoSafe, QuoteFlow).

---

## Overview

The widget lives in **BCC's repo** at `components/widget/BugReportWidget.tsx`.
Copy it into the product's codebase, or publish it as a shared package later.

Bug reports flow like this to keep the BCC ingest key server-side:

```
User submits widget
  → Client POSTs to product's /api/report-bug  (no key, uses session auth)
    → Product server POSTs to BCC /api/bcc/report  (with BCC_INGEST_KEY)
      → BCC writes to its Supabase
```

---

## Step 1 — Add env vars to the product

```env
# In the product's .env.local (and in Vercel dashboard for that product)
NEXT_PUBLIC_BCC_API_URL=https://bedrock-bcc.vercel.app
BCC_INGEST_KEY=bcc_sk_...   # same key as BCC dashboard
```

---

## Step 2 — Create proxy API routes in the product

### `app/api/report-bug/route.ts`

```typescript
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  const body = await request.json()

  const bccRes = await fetch(`${process.env.NEXT_PUBLIC_BCC_API_URL}/api/bcc/report`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.BCC_INGEST_KEY}`,
    },
    body: JSON.stringify(body),
  })

  const data = await bccRes.json()
  return NextResponse.json(data, { status: bccRes.status })
}
```

### `app/api/report-bug/screenshot/route.ts`

```typescript
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  const formData = await request.formData()

  const bccRes = await fetch(`${process.env.NEXT_PUBLIC_BCC_API_URL}/api/bcc/screenshot`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.BCC_INGEST_KEY}`,
    },
    body: formData,
  })

  const data = await bccRes.json()
  return NextResponse.json(data, { status: bccRes.status })
}
```

---

## Step 3 — Copy the widget component

Copy `components/widget/BugReportWidget.tsx` from this repo into the product's `components/` directory.

The widget has **zero external dependencies** at import time. `html2canvas` is lazy-loaded only when the user allows a screenshot.

---

## Step 4 — Mount it in the root layout

```tsx
// app/layout.tsx (in the product)
import { BugReportWidget } from '@/components/widget/BugReportWidget'

export default async function RootLayout({ children }) {
  // Get user from your product's own auth (Supabase, etc.)
  const session = await getSession()

  return (
    <html>
      <body>
        {children}
        <BugReportWidget
          product="bedrock-chat"          // must match bcc_products.id in BCC Supabase
          productName="Bedrock Chat"
          userId={session?.user?.id ?? null}
          username={session?.user?.email ?? null}
          appVersion={process.env.NEXT_PUBLIC_APP_VERSION}
        />
      </body>
    </html>
  )
}
```

**Product IDs** (must match exactly):
| Product | `product` prop |
|---------|---------------|
| Bedrock Chat | `"bedrock-chat"` |
| EchoSafe | `"echosafe"` |
| QuoteFlow | `"quoteflow"` |

---

## Step 5 — Verify

1. Load the product locally — you should see a small ⚠ button in the bottom-right corner
2. Click it, fill in a bug report, submit
3. Check the BCC dashboard at `https://bedrock-bcc.vercel.app/bugs` — it should appear within a few seconds
4. For blocker bugs: check `braxton@bedrockai.systems` inbox for the email alert

---

## Notes

- The widget does **not** import BCC's Supabase client — it stays completely isolated
- The `BCC_INGEST_KEY` stays server-side (never reaches the browser)
- If the BCC API is down, the widget shows an error and keeps the form data so the user can retry
- Z-index is set to 40/50 — adjust if your product uses higher z-index modals
