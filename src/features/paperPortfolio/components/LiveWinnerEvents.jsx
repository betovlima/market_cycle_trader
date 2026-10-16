import { useEffect, useState } from 'react'
import { getIntlLocale } from '../../../i18n/runtime'
import { apiFetch, downloadFile } from '../../../api/http'
import { API } from '../../../config/env'
import './LiveWinnerEvents.css'

const REFRESH_MS = 15000
const STATES = {
  analysis_only_recalibrating: 'Recalibrando LightGBM',
  analysis_only_requested: 'Aguardando worker Live',
  analysis_only_completed: 'Análise concluída',
  recalibrating: 'Recalibrando LightGBM',
  preparing_signal: 'Preparando sinal Winner',
  signal_prepared: 'Sinal preparado',
  review_required: 'Revisão necessária',
}

function formatTime(value) {
  const when = new Date(value)
  return Number.isNaN(when.getTime()) ? '—' : when.toLocaleTimeString(getIntlLocale(), {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

function detailsText(details) {
  return Object.entries(details || {})
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([key, value]) => `${key}: ${value}`).join(' · ')
}

export function LiveWinnerEvents({ executionSession, winnerStatus }) {
  const [selectedDay, setSelectedDay] = useState('')
  const [level, setLevel] = useState('all')
  const [events, setEvents] = useState([])
  const [refreshKey, setRefreshKey] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState(false)
  const activeSession = selectedDay || executionSession || ''

  useEffect(() => {
    if (!activeSession) {
      setEvents([])
      return undefined
    }
    let active = true
    let running = false
    const loadEvents = async () => {
      if (running) return
      running = true
      setLoading(true)
      try {
        const params = new URLSearchParams({
          execution_session: activeSession, level, limit: '200',
        })
        const data = await apiFetch(`${API}/live-market/winner/events?${params}`)
        if (active) {
          setEvents(Array.isArray(data?.events) ? data.events : [])
          setError('')
        }
      } catch (exc) {
        if (active) setError(exc.message || 'Não foi possível consultar os eventos.')
      } finally {
        if (active) setLoading(false)
        running = false
      }
    }
    loadEvents()
    const timer = window.setInterval(loadEvents, REFRESH_MS)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [activeSession, level, refreshKey])

  const exportLogs = async () => {
    if (!activeSession) return
    setExporting(true)
    try {
      const params = new URLSearchParams({ execution_session: activeSession })
      await downloadFile(`${API}/live-market/winner/events/export.zip?${params}`, 'mct_live_winner_logs.zip')
      setError('')
    } catch (exc) {
      setError(exc.message || 'Falha ao exportar logs.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <section className="live-winner-events" aria-label="Logs da Winner Live">
      <header className="live-winner-events-header">
        <div>
          <span className="panel-kicker">Diagnóstico operacional · Live</span>
          <h3>Logs da Winner Live</h3>
          <small>{STATES[winnerStatus] || winnerStatus || 'Aguardando estado da Winner'} · Atualização a cada 15 segundos</small>
        </div>
        <div className="live-winner-events-actions">
          <button type="button" className="secondary-action compact" disabled={loading || !activeSession} onClick={() => setRefreshKey((v) => v + 1)}>
            {loading ? 'Consultando…' : 'Atualizar'}
          </button>
          <button type="button" className="secondary-action compact" disabled={exporting || !activeSession} onClick={exportLogs}>
            {exporting ? 'Exportando…' : 'Exportar logs ZIP'}
          </button>
        </div>
      </header>
      <div className="live-winner-events-filters">
        <label>
          Sessão
          <input aria-label="Sessão dos logs" type="date" value={activeSession} onChange={(event) => setSelectedDay(event.target.value)} />
        </label>
        {selectedDay ? <button type="button" className="secondary-action compact" onClick={() => setSelectedDay('')}>Sessão atual</button> : null}
        <label>
          Severidade
          <select aria-label="Filtrar logs por severidade" value={level} onChange={(event) => setLevel(event.target.value)}>
            <option value="all">Todos</option>
            <option value="info">Informações</option>
            <option value="warning">Avisos</option>
            <option value="error">Erros</option>
          </select>
        </label>
        <span>{events.length} evento(s)</span>
      </div>
      {error ? <p className="live-winner-events-error" role="alert">{error}</p> : null}
      <div className="live-winner-events-scroll" aria-live="polite" aria-busy={loading}>
        {events.length ? (
          <ol>
            {events.map((event, index) => (
              <li key={`${event.recorded_at}-${event.stage}-${index}`} className={`live-winner-events-row ${event.level || 'info'}`}>
                <time dateTime={event.recorded_at}>{formatTime(event.recorded_at)}</time>
                <span className="live-winner-events-dot" aria-hidden="true" />
                <div>
                  <strong>{event.message}</strong>
                  <small>{event.stage}{detailsText(event.details) ? ` · ${detailsText(event.details)}` : ''}</small>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="live-winner-events-empty">
            {loading ? 'Consultando eventos…' : 'Nenhum evento registrado para esta sessão e filtro. Logs anteriores à implantação não são reconstruídos.'}
          </p>
        )}
      </div>
      <small className="live-winner-events-footnote">Diagnóstico de leitura. Esta seção não envia ordens e não modifica a Winner.</small>
    </section>
  )
}
