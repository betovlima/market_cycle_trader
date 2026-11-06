import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../../../api/http'
import { API } from '../../../config/env'

const HORIZONS = [
  { id: '1d', label: '1 pregão' },
  { id: '5d', label: '5 pregões' },
  { id: '20d', label: '20 pregões' },
]

export function changeForHorizon(item, horizon) {
  const candidate = item?.[`change_${horizon}`]
  return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : null
}

export function heatmapTone(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'missing'
  if (Math.abs(value) < 0.005) return 'neutral'
  const direction = value > 0 ? 'gain' : 'loss'
  const magnitude = Math.abs(value)
  const level = magnitude >= 6 ? 4 : magnitude >= 3 ? 3 : magnitude >= 1.5 ? 2 : 1
  return `${direction}-${level}`
}

export function sortedHeatmapAssets(items, horizon, order) {
  const rows = [...(Array.isArray(items) ? items : [])]
  if (order === 'ticker') {
    return rows.sort((a, b) => String(a.symbol).localeCompare(String(b.symbol)))
  }
  return rows.sort((a, b) => {
    const left = changeForHorizon(a, horizon)
    const right = changeForHorizon(b, horizon)
    if (left == null && right == null) return String(a.symbol).localeCompare(String(b.symbol))
    if (left == null) return 1
    if (right == null) return -1
    return (order === 'lowest' ? left - right : right - left)
      || String(a.symbol).localeCompare(String(b.symbol))
  })
}

function changeText(value) {
  return value == null ? 'N/D' : `${value > 0 ? '+' : ''}${value.toFixed(2).replace('.', ',')}%`
}

function dateText(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return '—'
  const [year, month, day] = date.split('-')
  return `${day}/${month}/${year}`
}

function currencyText(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
}

export function StockMarketHeatmap() {
  const [payload, setPayload] = useState(null)
  const [horizon, setHorizon] = useState('1d')
  const [order, setOrder] = useState('highest')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async (isInitial = false) => {
    if (!isInitial) setRefreshing(true)
    try {
      const data = await apiFetch(`${API}/dashboard/asset-heatmap`, { cache: 'no-store' })
      setPayload(data)
      setError('')
    } catch {
      setError('Não foi possível consultar as cotações diárias dos ativos cadastrados.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    const fetchOnce = () => {
      if (!active) return
      apiFetch(`${API}/dashboard/asset-heatmap`, { cache: 'no-store' })
        .then((data) => {
          if (active) { setPayload(data); setError(''); setLoading(false) }
        })
        .catch(() => {
          if (active) { setError('Não foi possível consultar as cotações diárias dos ativos cadastrados.'); setLoading(false) }
        })
    }
    fetchOnce()
    const id = window.setInterval(fetchOnce, 5 * 60 * 1000)
    return () => { active = false; window.clearInterval(id) }
  }, [])

  const rows = useMemo(
    () => sortedHeatmapAssets(payload?.items, horizon, order),
    [payload, horizon, order],
  )
  const counts = useMemo(() => {
    const values = rows.map(item => changeForHorizon(item, horizon))
    return {
      gains: values.filter(value => value != null && value > 0).length,
      losses: values.filter(value => value != null && value < 0).length,
      neutral: values.filter(value => value === 0).length,
      missing: values.filter(value => value == null).length,
    }
  }, [rows, horizon])

  return (
    <section className="dashboard-stock-heatmap" aria-label="Heatmap das ações cadastradas">
      <div className="dashboard-stock-heatmap-header">
        <div>
          <span className="panel-kicker">MERCADO · WINNER</span>
          <h2>Heatmap das ações cadastradas</h2>
          <p>
            Variação dos fechamentos diários completos da Alpaca, por ativo da Winner.
            Não representa a pontuação nem a recomendação do LightGBM.
          </p>
          {payload?.strategy_sequence ? (
            <p role="status">
              Universo da Winner selecionada neste ambiente: Strategy #{payload.strategy_sequence}
              {' · '}{payload.total_assets} ativos. O mapa acompanha a configuração da
              estratégia atual, que pode ser diferente da Winner de produção.
            </p>
          ) : null}
        </div>
        <div className="dashboard-stock-heatmap-controls">
          <div className="dashboard-stock-heatmap-switch" role="group" aria-label="Intervalo da variação">
            {HORIZONS.map(item => (
              <button key={item.id} type="button"
                aria-pressed={horizon === item.id}
                className={horizon === item.id ? 'is-active' : ''}
                onClick={() => setHorizon(item.id)}>
                {item.label}
              </button>
            ))}
          </div>
          <label className="dashboard-stock-heatmap-order">
            <span>Ordenar</span>
            <select value={order} onChange={event => setOrder(event.target.value)}>
              <option value="highest">Maiores altas</option>
              <option value="lowest">Maiores quedas</option>
              <option value="ticker">Código (A–Z)</option>
            </select>
          </label>
          <button type="button" className="dashboard-stock-heatmap-refresh"
            onClick={() => refresh()} disabled={refreshing || loading}
            title="Consultar novamente as variações diárias">
            {refreshing ? 'Atualizando…' : 'Atualizar'}
          </button>
        </div>
      </div>

      <div className="dashboard-stock-heatmap-summary" aria-live="polite">
        <span>{payload?.total_assets ?? '—'} ações cadastradas</span>
        <span className="heatmap-summary-gain">{counts.gains} em alta</span>
        <span className="heatmap-summary-loss">{counts.losses} em queda</span>
        <span>{counts.neutral} estáveis</span>
        <span>{counts.missing} sem dados</span>
        <span className="heatmap-summary-date">Fechamento até {dateText(payload?.as_of)}</span>
      </div>

      {loading ? (
        <div className="dashboard-stock-heatmap-state" role="status">
          <span className="loading-ring" aria-hidden="true"/> Consultando os ativos cadastrados…
        </div>
      ) : null}
      {error ? <p className="dashboard-stock-heatmap-error" role="alert">{error}</p> : null}
      {!loading && !rows.length && !error ? (
        <div className="dashboard-stock-heatmap-state">Nenhum ativo cadastrado disponível para exibição.</div>
      ) : null}
      {rows.length ? (
        <div className="dashboard-stock-heatmap-grid" role="list"
          aria-label="Variação dos ativos por fechamento diário">
          {rows.map(item => {
            const value = changeForHorizon(item, horizon)
            const tooltip = [
              item.symbol,
              `Variação ${horizon}: ${changeText(value)}`,
              `Preço: ${currencyText(item.price)}`,
              `Último fechamento recebido: ${dateText(item.date)}`,
              item.stale ? 'Cotação indisponível na data de referência' : '',
            ].filter(Boolean).join(' · ')
            return (
              <div key={item.symbol}
                role="listitem"
                title={tooltip}
                className={`dashboard-stock-heatmap-cell tone-${heatmapTone(value)}`}
                aria-label={tooltip}>
                <strong>{item.symbol}</strong>
                <span className="dashboard-stock-heatmap-change">{changeText(value)}</span>
                <small>{currencyText(item.price)}</small>
              </div>
            )
          })}
        </div>
      ) : null}

      <div className="dashboard-stock-heatmap-footer">
        <span>Queda</span>
        <div className="dashboard-stock-heatmap-legend" aria-hidden="true">
          {['loss-4', 'loss-3', 'loss-2', 'loss-1', 'neutral', 'gain-1', 'gain-2', 'gain-3', 'gain-4'].map(tone => (
            <span key={tone} className={`tone-${tone}`} />
          ))}
        </div>
        <span>Alta</span>
        <small>Sem dados: cinza. Base: candles diários completos (SIP, ajuste RAW). Durante o pregão, não inclui o candle de hoje.</small>
      </div>
    </section>
  )
}
