# BCC Widget Integration Guide

How to add the Bug Report Widget to any Bedrock AI product (Bedrock Chat, EchoSafe, QuoteFlow).

---

## Overview

The widget lives in **BCC's repo** at `components/widget/BugReportWidget.tsx`.
Copy it into the product's codebase, or publish it as a shared package later.

Bug reports flow like this to keep the BCC ingest key server-side:

```
User submits widget
  → Client POSTs to product's /api/report-bug        (no key — uses session auth)
      → Product server POSTs to BCC /api/bcc/report  (with BCC_INGEST_KEY)
            → BCC writes to its Supabase
```

---

## Step 1 — Add env vars to the product

```env
# In the product's .env.local (and in Vercel dashboard for that product)
NEXT_PUBLIC_BCC_API_URL=https://bedrock-bug-control.vercel.app
BCC_INGEST_KEY=bcc_sk_...   # same key as the BCC dashboard uses
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

The widget has **zero external dependencies** at import time. `html2canvas` is lazy-loaded only when the user clicks "Allow Screenshot".

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
          product="bedrock-chat"                        // must match bcc_products.id in BCC Supabase
          productName="Bedrock Chat"                    // shown in the success message
          userId={session?.user?.id ?? null}
          username={session?.user?.email ?? null}
          isAuthenticated={!!session}                   // hides widget when not logged in
          appVersion={process.env.NEXT_PUBLIC_APP_VERSION}
          theme={{ primaryColor: '#3b82f6' }}           // per-product accent color
        />
      </body>
    </html>
  )
}
```

**Product IDs** (must match exactly):
| Product | `product` prop | Suggested accent color |
|---------|---------------|----------------------|
| Bedrock Chat | `"bedrock-chat"` | `#3b82f6` (blue) |
| EchoSafe | `"echosafe"` | `#8b5cf6` (purple) |
| QuoteFlow | `"quoteflow"` | `#10b981` (emerald) |

### All widget props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `product` | `string` | — | **Required.** Product ID matching `bcc_products.id` |
| `productName` | `string` | `"the product"` | Shown in success message |
| `userId` | `string \| null` | `null` | From host app auth session |
| `username` | `string \| null` | `null` | From host app auth session |
| `appVersion` | `string` | — | App version string, e.g. `"1.2.0"` |
| `isAuthenticated` | `boolean` | `true` | Widget renders `null` when `false` |
| `theme.primaryColor` | `string` | `#3b82f6` | Hex accent color — buttons, selected states |

---

## Step 5 — Verify

1. Load the product locally — you should see a bug icon button in the bottom-right corner
2. Click it, complete the form, submit
3. Check the BCC dashboard at `https://bedrock-bug-control.vercel.app/bugs` — the report should appear within seconds
4. For blocker bugs: check `braxton@bedrockai.systems` for the email alert

---

## Notes

- The widget does **not** import BCC's Supabase client — it stays completely isolated from BCC internals
- `BCC_INGEST_KEY` stays server-side and never reaches the browser
- If screenshot upload fails, the report is still submitted without it
- Console errors entered in the form are appended to `steps_to_reproduce` in the submitted payload
- Z-index: trigger button is `z-40`, modal overlay is `z-50` — adjust if your product uses higher values
