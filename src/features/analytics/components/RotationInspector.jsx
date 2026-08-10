import { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { tr } from '../../../i18n/runtime'
import { number, percent, shortDate, shortDateTime } from '../../../shared/formatters'
import { ChartCell, ChartEmpty, SectionHeading } from './AnalyticsPrimitives'
import { returnTone } from '../utils/performance'

const PAGE_SIZE = 12

function metricValue(value, formatter = percent) {
  return value == null ? '—' : formatter(value)
}

function signedPercent(value) {
  if (value == null) return '—'
  const formatted = percent(Math.abs(Number(value)))
  if (Number(value) > 0) return `+${formatted}`
  if (Number(value) < 0) return `-${formatted}`
  return formatted
}

function RotationTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const row = payload[0]?.payload || {}
  return <div className="analytics-performance-tooltip rotation-inspector-tooltip">
    <strong>{row.from_asset} → {row.to_asset}</strong>
    <div><span>{tr('Executed')}</span><b>{shortDateTime(row.executed_at)}</b></div>
    <div><span>{tr('Rotation value added')}</span><b className={returnTone(row.rotation_value_added)}>{signedPercent(row.rotation_value_added)}</b></div>
    <div><span>{tr('Opportunity cost')}</span><b>{percent(row.opportunity_cost)}</b></div>
    <div><span>{tr('Realized next return')}</span><b className={returnTone(row.subsequent_position_return)}>{signedPercent(row.subsequent_position_return)}</b></div>
  </div>
}

function ExcursionTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const row = payload[0]?.payload || {}
  return <div className="analytics-performance-tooltip rotation-inspector-tooltip">
    <strong>{row.from_asset} → {row.to_asset}</strong>
    <div><span>MFE</span><b className="positive">{percent(row.maximum_favorable_excursion)}</b></div>
    <div><span>MAE</span><b className="negative">{percent(row.maximum_adverse_excursion)}</b></div>
    <div><span>{tr('Realized next return')}</span><b className={returnTone(row.subsequent_position_return)}>{signedPercent(row.subsequent_position_return)}</b></div>
    <div><span>{tr('Profit capture')}</span><b>{percent(row.profit_capture_ratio)}</b></div>
  </div>
}

function InspectorMetric({ label, value, tone = '' }) {
  return <div className="rotation-inspector-metric">
    <span>{tr(label)}</span>
    <strong className={tone}>{value}</strong>
  </div>
}

export function RotationInspector({ rotations = [], summary = {} }) {
  const diagnosed = useMemo(
    () => rotations
      .map((row, index) => ({ ...row, sequence: index + 1, sequence_label: `#${index + 1}` }))
      .filter((row) => row.rotation_value_added != null),
    [rotations],
  )
  const [selectedSequence, setSelectedSequence] = useState(null)
  const [page, setPage] = useState(1)

  useEffect(() => {
    setSelectedSequence(diagnosed[0]?.sequence ?? null)
    setPage(1)
  }, [diagnosed.length])

  const selected = diagnosed.find((row) => row.sequence === selectedSequence) || diagnosed[0] || null
  const pages = Math.max(1, Math.ceil(diagnosed.length / PAGE_SIZE))
  const currentPage = Math.min(page, pages)
  const pageRows = diagnosed.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const costly = useMemo(
    () => [...diagnosed]
      .filter((row) => Number(row.opportunity_cost) > 0)
      .sort((left, right) => Number(right.opportunity_cost) - Number(left.opportunity_cost))
      .slice(0, 10)
      .map((row) => ({ ...row, transition: `${row.from_asset} → ${row.to_asset}` })),
    [diagnosed],
  )

  return <section className="analytics-workspace-section rotation-inspector-section">
    <SectionHeading
      kicker={tr('ROTATION INSPECTOR')}
      title={tr('Where rotations added or left capital on the table')}
      description={tr('Retrospective market-path diagnostics for each completed rotation. They do not expose model scores, features or protected strategy thresholds.')}
    />

    {!diagnosed.length ? <div className="rotation-inspector-unavailable">
      <strong>{tr('Detailed rotation diagnostics are not stored for this backtest.')}</strong>
      <span>{tr('Run a new backtest with API v1.13.34 or later to populate Rotation Value Added, MFE, MAE and Opportunity Cost.')}</span>
    </div> : <>
      <div className="rotation-inspector-summary">
        <InspectorMetric label="Diagnosed rotations" value={String(summary.diagnosed_rotations ?? diagnosed.length)} />
        <InspectorMetric label="Positive value-added rate" value={metricValue(summary.positive_value_added_rate)} tone={returnTone(summary.positive_value_added_rate)} />
        <InspectorMetric label="Average rotation value added" value={signedPercent(summary.average_rotation_value_added)} tone={returnTone(summary.average_rotation_value_added)} />
        <InspectorMetric label="Average opportunity cost" value={metricValue(summary.average_opportunity_cost)} />
        <InspectorMetric label="Average MFE" value={metricValue(summary.average_maximum_favorable_excursion)} tone="positive" />
        <InspectorMetric label="Average MAE" value={metricValue(summary.average_maximum_adverse_excursion)} tone="negative" />
        <InspectorMetric label="Average profit capture" value={metricValue(summary.average_profit_capture_ratio)} />
      </div>

      <div className="rotation-inspector-chart-grid">
        <ChartCell kicker={tr('ROTATION VALUE')} title={tr('Value added by each rotation')} className="rotation-inspector-chart-cell">
          <div className="analytics-chart rotation-inspector-chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={diagnosed} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="sequence" tickFormatter={(value) => `#${value}`} minTickGap={26} />
                <YAxis tickFormatter={(value) => `${Math.round(value * 100)}%`} />
                <ReferenceLine y={0} stroke="var(--muted)" strokeDasharray="4 4" />
                <Tooltip content={<RotationTooltip />} />
                <Line type="monotone" dataKey="rotation_value_added" name={tr('Rotation value added')} dot={false} strokeWidth={2} stroke="var(--accent)" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartCell>

        <ChartCell kicker={tr('POSITION PATH')} title={tr('MFE versus realized next return')} className="rotation-inspector-chart-cell">
          <div className="analytics-chart rotation-inspector-chart">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" dataKey="maximum_favorable_excursion" name="MFE" tickFormatter={(value) => `${Math.round(value * 100)}%`} />
                <YAxis type="number" dataKey="subsequent_position_return" name={tr('Realized next return')} tickFormatter={(value) => `${Math.round(value * 100)}%`} />
                <ReferenceLine y={0} stroke="var(--muted)" strokeDasharray="4 4" />
                <Tooltip content={<ExcursionTooltip />} />
                <Scatter data={diagnosed} fill="var(--accent)" />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </ChartCell>

        <ChartCell kicker={tr('OPPORTUNITY COST')} title={tr('Largest missed alternatives')} className="rotation-inspector-chart-cell rotation-inspector-cost-chart-cell">
          {costly.length ? <div className="analytics-chart rotation-inspector-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={costly} layout="vertical" margin={{ top: 4, right: 12, bottom: 4, left: 12 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tickFormatter={(value) => `${Math.round(value * 100)}%`} />
                <YAxis type="category" dataKey="transition" width={92} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(value) => percent(value)} labelFormatter={(label) => label} />
                <Bar dataKey="opportunity_cost" name={tr('Opportunity cost')} fill="var(--warning, #d6a74d)" radius={[0, 4, 4, 0]}>
                  {costly.map((row) => <Cell key={`${row.sequence}-${row.transition}`} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div> : <ChartEmpty>{tr('No positive opportunity cost was measured.')}</ChartEmpty>}
        </ChartCell>
      </div>

      <div className="rotation-inspector-detail-grid">
        <div className="rotation-inspector-table-panel">
          <div className="analytics-subsection-heading"><span>{tr('ROTATIONS')}</span><strong>{tr('Select a rotation to inspect')}</strong></div>
          <div className="table-wrap"><table className="dashboard-table analytics-table rotation-inspector-table"><thead><tr>
            <th>#</th><th>{tr('Executed')}</th><th>{tr('Transition')}</th><th>{tr('Value added')}</th><th>{tr('Opportunity cost')}</th><th>{tr('Next return')}</th>
          </tr></thead><tbody>{pageRows.map((row) => <tr
            key={`${row.sequence}-${row.executed_at}`}
            className={row.sequence === selected?.sequence ? 'selected-row' : ''}
            onClick={() => setSelectedSequence(row.sequence)}
            tabIndex={0}
            onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setSelectedSequence(row.sequence) }}
          >
            <td>{row.sequence}</td><td>{shortDate(row.executed_at)}</td><td><strong>{row.from_asset} → {row.to_asset}</strong></td><td className={returnTone(row.rotation_value_added)}>{signedPercent(row.rotation_value_added)}</td><td>{percent(row.opportunity_cost)}</td><td className={returnTone(row.subsequent_position_return)}>{signedPercent(row.subsequent_position_return)}</td>
          </tr>)}</tbody></table></div>
          <div className="rotation-inspector-pagination">
            <button type="button" disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>{tr('Previous page')}</button>
            <span>{tr('Page')} {currentPage} {tr('of')} {pages}</span>
            <button type="button" disabled={currentPage >= pages} onClick={() => setPage((value) => Math.min(pages, value + 1))}>{tr('Next page')}</button>
          </div>
        </div>

        <aside className="rotation-inspector-detail-panel">
          <div className="analytics-subsection-heading"><span>{tr('SELECTED ROTATION')}</span><strong>{selected ? `${selected.from_asset} → ${selected.to_asset}` : '—'}</strong></div>
          {selected ? <dl className="analytics-definition-list compact rotation-inspector-definition-list">
            <div><dt>{tr('Executed')}</dt><dd>{shortDateTime(selected.executed_at)}</dd></div>
            <div><dt>{tr('Prior position return')}</dt><dd className={returnTone(selected.position_return)}>{signedPercent(selected.position_return)}</dd></div>
            <div><dt>{tr('Next realized return')}</dt><dd className={returnTone(selected.subsequent_position_return)}>{signedPercent(selected.subsequent_position_return)}</dd></div>
            <div><dt>{tr('Chosen market return')}</dt><dd className={returnTone(selected.chosen_market_return)}>{signedPercent(selected.chosen_market_return)}</dd></div>
            <div><dt>{tr('If previous asset was kept')}</dt><dd className={returnTone(selected.counterfactual_previous_asset_return)}>{signedPercent(selected.counterfactual_previous_asset_return)}</dd></div>
            <div><dt>{tr('Rotation value added')}</dt><dd className={returnTone(selected.rotation_value_added)}>{signedPercent(selected.rotation_value_added)}</dd></div>
            <div><dt>{tr('Best alternative')}</dt><dd>{selected.best_alternative_asset || '—'} {selected.best_alternative_return == null ? '' : `· ${signedPercent(selected.best_alternative_return)}`}</dd></div>
            <div><dt>{tr('Opportunity cost')}</dt><dd>{percent(selected.opportunity_cost)}</dd></div>
            <div><dt>MFE</dt><dd className="positive">{percent(selected.maximum_favorable_excursion)}</dd></div>
            <div><dt>MAE</dt><dd className="negative">{percent(selected.maximum_adverse_excursion)}</dd></div>
            <div><dt>{tr('Profit capture')}</dt><dd>{percent(selected.profit_capture_ratio)}</dd></div>
            <div><dt>{tr('Next holding')}</dt><dd>{selected.subsequent_holding_days == null ? '—' : tr('{count} days', { count: number(selected.subsequent_holding_days, 1) })}</dd></div>
          </dl> : null}
        </aside>
      </div>
    </>}
  </section>
}
