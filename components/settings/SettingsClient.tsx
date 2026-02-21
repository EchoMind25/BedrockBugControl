'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { BccSetting, BccProduct } from '@/types'

interface SettingsClientProps {
  settings: BccSetting[]
  monthlySpend: number
  products: BccProduct[]
}

// Human-readable labels + constraints per setting key
const SETTING_META: Record<string, {
  label: string
  description: string
  unit: string
  min: number
  max: number
  section: string
}> = {
  spike_threshold_multiplier: {
    label: 'Spike threshold multiplier',
    description: 'Alert when errors in the last hour exceed this multiple of the 7-day baseline.',
    unit: 'x',
    min: 1.5,
    max: 20,
    section: 'Error Spike Detection',
  },
  spike_cooldown_hours: {
    label: 'Spike alert cooldown',
    description: 'Minimum hours between spike alerts for the same product.',
    unit: 'hours',
    min: 0.5,
    max: 24,
    section: 'Error Spike Detection',
  },
  api_monthly_budget_usd: {
    label: 'AI API monthly budget cap',
    description: 'Maximum USD spend on Claude API per calendar month. AI features are disabled when this limit is reached.',
    unit: 'USD',
    min: 1,
    max: 100,
    section: 'Claude AI Budget',
  },
  retention_auto_errors_days: {
    label: 'Auto errors retention',
    description: 'Days to keep auto-captured error records.',
    unit: 'days',
    min: 30,
    max: 365,
    section: 'Data Retention',
  },
  retention_uptime_days: {
    label: 'Uptime checks retention',
    description: 'Days to keep uptime ping records.',
    unit: 'days',
    min: 30,
    max: 365,
    section: 'Data Retention',
  },
  retention_performance_days: {
    label: 'Performance logs retention',
    description: 'Days to keep API performance log records.',
    unit: 'days',
    min: 7,
    max: 90,
    section: 'Data Retention',
  },
  retention_sessions_minutes: {
    label: 'Session staleness timeout',
    description: 'Minutes before an inactive session is removed from active user counts.',
    unit: 'minutes',
    min: 5,
    max: 30,
    section: 'Data Retention',
  },
  retention_audit_days: {
    label: 'Audit log retention',
    description: 'Days to keep audit trail records.',
    unit: 'days',
    min: 90,
    max: 3650,
    section: 'Data Retention',
  },
}

const SECTION_ORDER = ['Error Spike Detection', 'Claude AI Budget', 'Data Retention']

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

type ProductFields = { production_url: string; repo_url: string; health_endpoint: string }
type ProductSaveState = 'idle' | 'saving' | 'saved' | 'error'

export function SettingsClient({ settings, monthlySpend, products }: SettingsClientProps) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(settings.map((s) => [s.key, s.value]))
  )
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({})

  const [productValues, setProductValues] = useState<Record<string, ProductFields>>(
    Object.fromEntries(
      products.map((p) => [p.id, {
        production_url: p.production_url ?? '',
        repo_url: p.repo_url ?? '',
        health_endpoint: p.health_endpoint ?? '',
      }])
    )
  )
  const [productSaveStates, setProductSaveStates] = useState<Record<string, ProductSaveState>>({})

  async function saveSetting(key: string) {
    setSaveStates((prev) => ({ ...prev, [key]: 'saving' }))
    const supabase = createClient()
    const { error } = await supabase
      .from('bcc_settings')
      .update({ value: values[key], updated_at: new Date().toISOString() })
      .eq('key', key)

    if (error) {
      setSaveStates((prev) => ({ ...prev, [key]: 'error' }))
      setTimeout(() => setSaveStates((prev) => ({ ...prev, [key]: 'idle' })), 3000)
    } else {
      setSaveStates((prev) => ({ ...prev, [key]: 'saved' }))
      setTimeout(() => setSaveStates((prev) => ({ ...prev, [key]: 'idle' })), 2000)
    }
  }

  async function saveProduct(id: string) {
    setProductSaveStates((prev) => ({ ...prev, [id]: 'saving' }))
    const supabase = createClient()
    const fields = productValues[id]
    const { error } = await supabase
      .from('bcc_products')
      .update({
        production_url: fields.production_url || null,
        repo_url: fields.repo_url || null,
        health_endpoint: fields.health_endpoint || null,
      })
      .eq('id', id)

    if (error) {
      setProductSaveStates((prev) => ({ ...prev, [id]: 'error' }))
      setTimeout(() => setProductSaveStates((prev) => ({ ...prev, [id]: 'idle' })), 3000)
    } else {
      setProductSaveStates((prev) => ({ ...prev, [id]: 'saved' }))
      setTimeout(() => setProductSaveStates((prev) => ({ ...prev, [id]: 'idle' })), 2000)
    }
  }

  // Group settings by section
  const grouped: Record<string, Array<{ key: string; meta: typeof SETTING_META[string] }>> = {}
  for (const key of Object.keys(SETTING_META)) {
    const meta = SETTING_META[key]
    if (!grouped[meta.section]) grouped[meta.section] = []
    grouped[meta.section].push({ key, meta })
  }

  // Budget limit for display
  const budgetLimit = parseFloat(values['api_monthly_budget_usd'] ?? '5')
  const budgetPct = budgetLimit > 0 ? Math.min((monthlySpend / budgetLimit) * 100, 100) : 0
  const budgetOver = monthlySpend >= budgetLimit

  return (
    <div className="space-y-6">
      {SECTION_ORDER.map((section) => {
        const items = grouped[section] ?? []

        return (
          <div key={section} className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-700/50">
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">{section}</h2>
            </div>

            <div className="divide-y divide-slate-700/30">
              {/* AI Budget: show current spend */}
              {section === 'Claude AI Budget' && (
                <div className="px-5 py-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm text-slate-300">Current month spend</p>
                    <p className={`text-sm font-semibold ${budgetOver ? 'text-red-400' : 'text-slate-200'}`}>
                      ${monthlySpend.toFixed(4)} / ${budgetLimit.toFixed(2)}
                    </p>
                  </div>
                  <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${budgetOver ? 'bg-red-500' : budgetPct > 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                      style={{ width: `${budgetPct}%` }}
                    />
                  </div>
                  {budgetOver && (
                    <p className="text-xs text-red-400 mt-1.5">Budget exceeded — AI features disabled until next month</p>
                  )}
                </div>
              )}

              {items.map(({ key, meta }) => {
                if (!(key in values)) return null
                const state = saveStates[key] ?? 'idle'
                const numVal = parseFloat(values[key] ?? '0')

                return (
                  <div key={key} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <label htmlFor={key} className="text-sm font-medium text-slate-200 block mb-0.5">
                          {meta.label}
                        </label>
                        <p className="text-xs text-slate-500">{meta.description}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <input
                          id={key}
                          type="number"
                          value={values[key] ?? ''}
                          min={meta.min}
                          max={meta.max}
                          step={key.includes('multiplier') ? '0.5' : '1'}
                          onChange={(e) => setValues((prev) => ({ ...prev, [key]: e.target.value }))}
                          onBlur={() => {
                            // Clamp value on blur
                            const clamped = Math.min(meta.max, Math.max(meta.min, numVal || meta.min))
                            setValues((prev) => ({ ...prev, [key]: clamped.toString() }))
                          }}
                          className="w-24 bg-slate-900 border border-slate-700/50 text-sm text-slate-200 rounded-lg px-3 py-1.5 text-right focus:outline-none focus:border-slate-500"
                        />
                        <span className="text-xs text-slate-500 w-12">{meta.unit}</span>
                        <button
                          onClick={() => saveSetting(key)}
                          disabled={state === 'saving'}
                          className="text-xs px-3 py-1.5 bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-200 rounded-lg transition-colors disabled:opacity-50 min-w-[52px]"
                        >
                          {state === 'saving' ? '…' : state === 'saved' ? '✓ Saved' : state === 'error' ? 'Error' : 'Save'}
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {/* Products */}
      {products.length > 0 && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-700/50">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Products</h2>
          </div>
          <div className="divide-y divide-slate-700/30">
            {products.map((product) => {
              const fields = productValues[product.id] ?? { production_url: '', repo_url: '', health_endpoint: '' }
              const state = productSaveStates[product.id] ?? 'idle'
              return (
                <div key={product.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-200 mb-3">{product.display_name}</p>
                      <div className="space-y-2">
                        <div>
                          <label className="text-xs text-slate-500 block mb-1">Production URL</label>
                          <input
                            type="url"
                            value={fields.production_url}
                            placeholder="https://..."
                            onChange={(e) => setProductValues((prev) => ({ ...prev, [product.id]: { ...prev[product.id], production_url: e.target.value } }))}
                            className="w-full bg-slate-900 border border-slate-700/50 text-sm text-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-slate-500"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 block mb-1">Repo URL</label>
                          <input
                            type="url"
                            value={fields.repo_url}
                            placeholder="https://github.com/..."
                            onChange={(e) => setProductValues((prev) => ({ ...prev, [product.id]: { ...prev[product.id], repo_url: e.target.value } }))}
                            className="w-full bg-slate-900 border border-slate-700/50 text-sm text-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-slate-500"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 block mb-1">Health Endpoint</label>
                          <input
                            type="url"
                            value={fields.health_endpoint}
                            placeholder="https://.../api/health"
                            onChange={(e) => setProductValues((prev) => ({ ...prev, [product.id]: { ...prev[product.id], health_endpoint: e.target.value } }))}
                            className="w-full bg-slate-900 border border-slate-700/50 text-sm text-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-slate-500"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="flex-shrink-0 pt-6">
                      <button
                        onClick={() => saveProduct(product.id)}
                        disabled={state === 'saving'}
                        className="text-xs px-3 py-1.5 bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-200 rounded-lg transition-colors disabled:opacity-50 min-w-[52px]"
                      >
                        {state === 'saving' ? '…' : state === 'saved' ? '✓ Saved' : state === 'error' ? 'Error' : 'Save'}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Info footer */}
      <p className="text-xs text-slate-600 text-center pb-2">
        Settings take effect on the next cron run. Data retention changes apply on the next nightly cleanup.
      </p>
    </div>
  )
}
