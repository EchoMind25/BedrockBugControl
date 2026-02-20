/**
 * proxy.ts — Auth routing/redirect logic for BCC.
 *
 * NOTE: middleware.ts is DEPRECATED in this project.
 * All auth checks and redirects happen here (called from Server Components)
 * plus a defense-in-depth check at the Server Component level.
 *
 * Usage in any protected Server Component or layout:
 *   import { requireAuth } from '@/lib/proxy'
 *   const session = await requireAuth()
 */

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

/**
 * Verifies that a valid Supabase session exists.
 * Redirects to /login if not authenticated.
 * Returns the session for use in the calling component.
 */
export async function requireAuth() {
  const supabase = await createClient()
  const { data: { session }, error } = await supabase.auth.getSession()

  if (error || !session) {
    redirect('/login')
  }

  return session
}

/**
 * Verifies the session without redirecting.
 * Use this when you need to check auth without hard-redirecting.
 * Returns null if not authenticated.
 */
export async function getSession() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

/**
 * Redirect authenticated users away from the login page.
 * Call this at the top of app/login/page.tsx.
 */
export async function redirectIfAuthenticated(destination = '/bugs') {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (session) {
    redirect(destination)
  }
}
