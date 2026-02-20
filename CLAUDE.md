# CLAUDE.md — BedrockBugControl Project Notes

## ⚠️ CRITICAL: Middleware is DEPRECATED

**DO NOT use `middleware.ts` for auth or routing logic in this project.**

Next.js `middleware.ts` is deprecated in this codebase. All middleware-equivalent logic (auth session checks, redirects) is handled via **`proxy.ts`** instead.

- Do NOT create `middleware.ts`
- Do NOT reference `middleware.ts` in any implementation
- Auth protection and request interception → use `proxy.ts`
- If you see any reference to `middleware.ts` in the PRD or docs, replace it with the `proxy.ts` equivalent

## Auth Defense-in-Depth (without middleware.ts)

Since middleware.ts is not used:
- Auth checks happen in `proxy.ts` for routing/redirect logic
- Server Components must independently verify session before rendering any protected data
- Never rely on a single auth gate — check session at the Server Component level too

## Stack

- Next.js 15 App Router
- TypeScript strict mode
- Tailwind CSS 4
- Supabase (@supabase/supabase-js + @supabase/ssr)
- Resend (blocker email notifications)
- PWA: manual service worker (no next-pwa)
