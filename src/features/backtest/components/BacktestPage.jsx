import { useEffect, useMemo, useState } from 'react'

import { apiFetch, downloadFile } from '../../../api/http'
import { hasCapability } from '../../../auth/capabilities'
import { API } from '../../../config/env'
import { tr } from '../../../i18n/runtime'
import { HISTORY_PAGE_SIZE } from '../backtestConfig'
import { sortRows } from '../backtestUtils'
import { BacktestWorkspaceView } from './BacktestWorkspaceView'

export function BacktestPage({ workspace, capabilities = {}, onSessionExpired }) {
  const canExportResults = hasCapability(capabilities, 'backtest.export')
  const canViewResearchModels = hasCapability(capabilities, 'research_models.view')
  const canStartBacktest = hasCapability(capabilities, 'backtest.start')
  const canViewTuning = hasCapability(capabilities, 'tuning.view')
  const canViewTemporalIntelligence = hasCapability(capabilities, 'temporal_intelligence.view')
  const {
    job,
    dashboard,
    detail,
    loadingDetail,
    running,
    restoringExecution,
    startingBacktest,
    startDisabled,
    runBacktest,
    refreshDashboard,
  } = workspace
  const metrics = detail?.metrics || {}
  const [rotationPayload, setRotationPayload] = useState(null)
  const [rotationLoading, setRotationLoading] = useState(false)
  const [rotationError, setRotationError] = useState('')
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const [historyQuery, setHistoryQuery] = useState('')
  const [historyStatus, setHistoryStatus] = useState('all')
  const [historySort, setHistorySort] = useState({ key: 'created_at', direction: 'desc' })
  const [historyPage, setHistoryPage] = useState(1)
  const [selectedStrategyModel, setSelectedStrategyModel] = useState(null)
  const [researchWorkspaceMode, setResearchWorkspaceMode] = useState('simulation')
  const [researchLabMode, setResearchLabMode] = useState(canViewTuning ? 'tuning' : 'temporal')
  const [temporalTuningStrategy, setTemporalTuningStrategy] = useState(null)
  const [strategyContextError, setStrategyContextError] = useState('')
  const [researchExecutionModels, setResearchExecutionModels] = useState({})
  const selectedStrategyName = dashboard?.selected_backtest_strategy_name || tr('Not selected')
  const activeStrategyName = (running ? job?.strategy_profile_name : null) || selectedStrategyName

  useEffect(() => {
    if (researchLabMode === 'tuning' && !canViewTuning && canViewTemporalIntelligence) setResearchLabMode('temporal')
    if (researchLabMode === 'temporal' && !canViewTemporalIntelligence && canViewTuning) setResearchLabMode('tuning')
  }, [canViewTemporalIntelligence, canViewTuning, researchLabMode])

  useEffect(() => {
    let active = true
    if (!canViewResearchModels) {
      setSelectedStrategyModel(null)
      setStrategyContextError('')
      return () => { active = false }
    }

    apiFetch(`${API}/admin/strategies/control`)
      .then((value) => {
        if (!active) return
        setSelectedStrategyModel(value?.research_strategy?.research_model || null)
        setStrategyContextError('')
      })
      .catch((requestError) => {
        if (!active) return
        setSelectedStrategyModel(null)
        if (requestError?.status === 403) {
          setStrategyContextError('')
          return
        }
        setStrategyContextError(requestError.message || 'Unable to load the model saved with the selected Strategy.')
      })
    return () => { active = false }
  }, [canViewResearchModels, dashboard?.selected_backtest_strategy_name])

  useEffect(() => {
    let active = true
    if (!canViewResearchModels) {
      setResearchExecutionModels({})
      return () => { active = false }
    }

    apiFetch(`${API}/admin/model-research/executions?limit=50`)
      .then((value) => {
        if (!active) return
        const items = Array.isArray(value?.items) ? value.items : []
        setResearchExecutionModels(Object.fromEntries(items.filter((item) => item?.id).map((item) => [item.id, item])))
      })
      .catch(() => {
        if (active) setResearchExecutionModels({})
      })
    return () => { active = false }
  }, [canViewResearchModels, job?.id, detail?.id, dashboard?.recent_backtests?.[0]?.id])

  useEffect(() => {
    let active = true
    const jobId = detail?.id
    if (!jobId) {
      setRotationPayload(null)
      setRotationError('')
      setRotationLoading(false)
      return () => { active = false }
    }

    setRotationLoading(true)
    setRotationPayload(null)
    setRotationError('')
    apiFetch(`${API}/analytics/backtests/${encodeURIComponent(jobId)}`)
      .then((value) => {
        if (active) setRotationPayload(value)
      })
      .catch((requestError) => {
        if (active) {
          setRotationPayload(null)
          setRotationError(tr(requestError.message || 'Unable to load capital rotations.'))
        }
      })
      .finally(() => {
        if (active) setRotationLoading(false)
      })

    return () => { active = false }
  }, [detail?.id])

  const historyRows = useMemo(() => {
    const normalizedQuery = historyQuery.trim().toLowerCase()
    const rows = (dashboard?.recent_backtests || []).map((item) => ({
      ...item,
      research_model_label: canViewResearchModels ? (researchExecutionModels[item.id]?.model_label || 'Baseline') : '',
    })).filter((item) => {
      if (historyStatus !== 'all' && String(item.status || '').toLowerCase() !== historyStatus) return false
      if (!normalizedQuery) return true
      const haystack = `${item.strategy_profile_name || 'Unknown test'} ${canViewResearchModels ? item.research_model_label : ''}`.toLowerCase()
      return haystack.includes(normalizedQuery)
    })
    return sortRows(rows, historySort, {
      created_at: (item) => Date.parse(item.created_at || '') || 0,
      strategy_profile_name: (item) => String(item.strategy_profile_name || 'Unknown test'),
      research_model_label: (item) => String(item.research_model_label || 'Baseline'),
      status: (item) => String(item.status || ''),
      simulation_return: (item) => item.metrics?.simulation_return == null ? null : Number(item.metrics.simulation_return),
      sharpe: (item) => item.metrics?.sharpe == null ? null : Number(item.metrics.sharpe),
      maximum_drawdown: (item) => item.metrics?.maximum_drawdown == null ? null : Number(item.metrics.maximum_drawdown),
      position_changes: (item) => item.metrics?.position_changes == null ? null : Number(item.metrics.position_changes),
      duration_seconds: (item) => item.duration_seconds == null ? null : Number(item.duration_seconds),
    })
  }, [canViewResearchModels, dashboard, historyQuery, historySort, historyStatus, researchExecutionModels])

  const historyPages = Math.max(1, Math.ceil(historyRows.length / HISTORY_PAGE_SIZE))
  const currentHistoryPage = Math.min(historyPage, historyPages)
  const paginatedHistoryRows = historyRows.slice((currentHistoryPage - 1) * HISTORY_PAGE_SIZE, currentHistoryPage * HISTORY_PAGE_SIZE)

  useEffect(() => {
    refreshDashboard()
  }, [refreshDashboard])

  useEffect(() => { setHistoryPage(1) }, [historyQuery, historySort, historyStatus])

  const savedResearchModelLabel = canViewResearchModels ? (selectedStrategyModel?.label || '') : ''
  const activeResearchModelLabel = canViewResearchModels && job?.id ? (researchExecutionModels[job.id]?.model_label || savedResearchModelLabel) : ''
  const displayedResearchModelLabel = canViewResearchModels && detail?.id ? (researchExecutionModels[detail.id]?.model_label || '') : ''
  const historyColumnCount = canViewResearchModels ? 9 : 8

  async function exportResults() {
    if (!canExportResults || !detail?.id || exporting) return
    setExporting(true)
    setExportError('')
    try {
      await downloadFile(
        `${API}/jobs/${encodeURIComponent(detail.id)}/export.zip`,
        `market_cycle_trader_${detail.id}.zip`,
      )
    } catch (requestError) {
      setExportError(requestError.message || 'Unable to export the result.')
    } finally {
      setExporting(false)
    }
  }

    const workspaceView = {
    activeResearchModelLabel,
    activeStrategyName,
    canExportResults,
    canStartBacktest,
    canViewResearchModels,
    canViewTemporalIntelligence,
    canViewTuning,
    capabilities,
    currentHistoryPage,
    dashboard,
    detail,
    displayedResearchModelLabel,
    exportError,
    exportResults,
    exporting,
    historyColumnCount,
    historyPages,
    historyQuery,
    historyRows,
    historySort,
    historyStatus,
    loadingDetail,
    metrics,
    onSessionExpired,
    paginatedHistoryRows,
    researchLabMode,
    researchWorkspaceMode,
    restoringExecution,
    rotationError,
    rotationLoading,
    rotationPayload,
    runBacktest,
    running,
    savedResearchModelLabel,
    setHistoryPage,
    setHistoryQuery,
    setHistorySort,
    setHistoryStatus,
    setResearchLabMode,
    setResearchWorkspaceMode,
    setSelectedStrategyModel,
    setTemporalTuningStrategy,
    startDisabled,
    startingBacktest,
    strategyContextError,
    temporalTuningStrategy,
    workspace
  }

  return <BacktestWorkspaceView workspaceView={workspaceView} />
}
