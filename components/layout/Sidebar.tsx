'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const NAV_ITEMS = [
  { label: 'Overview', href: '/overview', icon: '⌂' },
  { label: 'Bugs', href: '/bugs', icon: '🐛' },
  { label: 'Errors', href: '/errors', icon: '⚡' },
  { label: 'Uptime', href: '/uptime', icon: '💚' },
  { label: 'Deploys', href: '/deploys', icon: '🚀' },
  { label: 'Settings', href: '/settings', icon: '⚙' },
]

interface SidebarProps {
  userEmail: string | null
}

export function Sidebar({ userEmail }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  async function handleLogout() {
    setLoggingOut(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const NavContent = () => (
    <>
      {/* Logo */}
      <div className="px-4 py-5 border-b border-slate-700/50">
        <div className="flex items-center gap-2.5">
          <span className="text-xl">🐛</span>
          <div>
            <p className="text-sm font-semibold text-slate-100 leading-tight">Bug Control</p>
            <p className="text-xs text-slate-400 leading-tight">Bedrock AI</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-slate-700 text-slate-100 font-medium'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* User / Logout */}
      <div className="px-2 py-3 border-t border-slate-700/50">
        <div className="px-3 py-2 mb-1">
          <p className="text-xs text-slate-500 truncate">{userEmail ?? '—'}</p>
        </div>
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors disabled:opacity-50"
        >
          <span>↩</span>
          {loggingOut ? 'Signing out…' : 'Sign Out'}
        </button>
      </div>
    </>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:flex-col md:w-52 md:min-h-screen bg-slate-900 border-r border-slate-700/50 flex-shrink-0">
        <NavContent />
      </aside>

      {/* Mobile header */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-700/50">
        <div className="flex items-center gap-2">
          <span>🐛</span>
          <span className="text-sm font-semibold text-slate-100">BCC</span>
        </div>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="text-slate-400 hover:text-slate-200 p-1"
          aria-label="Toggle menu"
        >
          {mobileOpen ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative flex flex-col w-60 bg-slate-900 border-r border-slate-700/50 h-full">
            <NavContent />
          </aside>
        </div>
      )}
    </>
  )
}
