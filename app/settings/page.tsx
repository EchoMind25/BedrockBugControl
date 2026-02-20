import { createClient } from '@/lib/supabase/server'
import { SettingsClient } from '@/components/settings/SettingsClient'
import type { BccSetting } from '@/types'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const supabase = await createClient()

  // Fetch all settings
  const { data: settingsData } = await supabase
    .from('bcc_settings')
    .select('*')
    .order('key')

  const settings: BccSetting[] = (settingsData ?? []) as BccSetting[]

  // Fetch monthly API spend
  const { data: spendData } = await supabase.rpc('get_monthly_api_spend')
  const monthlySpend: number = (spendData as number) ?? 0

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-100">Settings</h1>
        <p className="text-sm text-slate-400 mt-0.5">
          Configure BCC behavior — thresholds, retention, and AI budget
        </p>
      </div>

      <SettingsClient settings={settings} monthlySpend={monthlySpend} />
    </div>
  )
}
