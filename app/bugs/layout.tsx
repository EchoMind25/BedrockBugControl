import { requireAuth } from '@/lib/proxy'
import { Sidebar } from '@/components/layout/Sidebar'

export default async function BugsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Defense-in-depth: verify session in Server Component (proxy.ts replaces middleware.ts)
  const session = await requireAuth()

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-slate-900">
      <Sidebar userEmail={session.user.email ?? null} />
      <main className="flex-1 min-w-0 overflow-auto">
        {children}
      </main>
    </div>
  )
}
