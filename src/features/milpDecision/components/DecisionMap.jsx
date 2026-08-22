import { useMemo, useState } from 'react'

import { tr } from '../../../i18n/runtime'
import { MilpDialog } from './MilpDialog'
import { actionLabel, number, percent } from '../utils/formatters'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function decisionDetail(row) {
  const components = Object.entries(row?.objective_breakdown || {})
    .filter(([key]) => key !== 'objective')
    .map(([label, value]) => ({ label: label.replaceAll('_', ' '), value: number(value, 4) }))
  return {
    kicker: 'MILP DECISION',
    title: `${String(row?.execution_at || row?.decision_at || '').slice(0, 10)} · ${row?.current_symbol || '—'} → ${row?.target_symbol || '—'}`,
    metrics: [
      { label: tr('MILP decision'), value: actionLabel(row?.action) },
      { label: tr('Control decision'), value: row?.control_target_symbol || '—' },
      { label: tr('MILP objective'), value: number(row?.objective, 4) },
      { label: tr('Value added vs Control'), value: percent(row?.decision_value_added_vs_control, 2), tone: Number(row?.decision_value_added_vs_control) > 0 ? 'positive' : Number(row?.decision_value_added_vs_control) < 0 ? 'negative' : '' },
    ],
    components,
    alternatives: (row?.alternatives || []).map((item) => ({ symbol: item.symbol, objective: number(item.objective, 4) })),
  }
}

export function DecisionMap({ result }) {
  const [detail, setDetail] = useState(null)
  const years = useMemo(() => {
    const grouped = new Map()
    for (const row of result?.decision_map || []) {
      const [year, month] = String(row.month || '').split('-')
      if (!year || !month) continue
      if (!grouped.has(year)) grouped.set(year, {})
      grouped.get(year)[Number(month)] = row
    }
    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [result])
  if (!years.length) return null
  const samples = result?.decision_samples || []
  return <section className="milp-decision-map">
    <div className="milp-section-heading"><div><strong>{tr('Decision Map')}</strong><span>{tr('Dominant MILP action by month')}</span></div></div>
    <div className="milp-month-grid milp-month-head"><span />{MONTHS.map((month) => <strong key={month}>{month}</strong>)}</div>
    {years.map(([year, months]) => <div className="milp-month-grid" key={year}><strong>{year}</strong>{MONTHS.map((_, index) => {
      const row = months[index + 1]
      const action = actionLabel(row?.dominant_action)
      return <button key={`${year}-${index + 1}`} type="button" className={`milp-month-cell ${action.toLowerCase()}`} disabled={!row} onClick={() => {
        const monthKey = `${year}-${String(index + 1).padStart(2, '0')}`
        const sample = samples.find((item) => String(item.execution_at || item.decision_at || '').startsWith(monthKey))
        setDetail(sample ? decisionDetail(sample) : {
          kicker: 'MILP DECISION MAP',
          title: monthKey,
          metrics: Object.entries(row?.counts || {}).map(([label, value]) => ({ label, value: number(value, 0) })),
        })
      }}>{row ? action.slice(0, 1) : '·'}</button>
    })}</div>)}
    <MilpDialog detail={detail} onClose={() => setDetail(null)} />
  </section>
}
