import type { BugReport } from '@/types'

interface BugStatsProps {
  bugs: BugReport[]
}

export function BugStats({ bugs }: BugStatsProps) {
  const blockers = bugs.filter(
    (b) => b.severity === 'blocker' && !['resolved', 'wont-fix', 'duplicate'].includes(b.status)
  ).length

  const open = bugs.filter(
    (b) => !['resolved', 'wont-fix', 'duplicate'].includes(b.status)
  ).length

  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const resolvedThisWeek = bugs.filter(
    (b) => b.status === 'resolved' && b.resolved_at && b.resolved_at >= oneWeekAgo
  ).length

  const stats = [
    {
      label: 'Blockers',
      value: blockers,
      urgent: blockers > 0,
      description: 'Open blocker bugs',
    },
    {
      label: 'Open Bugs',
      value: open,
      urgent: false,
      description: 'New + In Progress',
    },
    {
      label: 'Resolved This Week',
      value: resolvedThisWeek,
      urgent: false,
      description: 'Closed in last 7 days',
    },
  ]

  return (
    <div className="grid grid-cols-3 gap-3 mb-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className={`rounded-lg border px-4 py-3 ${
            stat.urgent
              ? 'bg-red-500/10 border-red-500/30'
              : 'bg-slate-800 border-slate-700'
          }`}
        >
          <p className={`text-2xl font-bold ${stat.urgent ? 'text-red-400' : 'text-slate-100'}`}>
            {stat.value}
          </p>
          <p className={`text-xs font-medium mt-0.5 ${stat.urgent ? 'text-red-400' : 'text-slate-300'}`}>
            {stat.label}
          </p>
          <p className="text-xs text-slate-500 mt-0.5 hidden sm:block">{stat.description}</p>
        </div>
      ))}
    </div>
  )
}
