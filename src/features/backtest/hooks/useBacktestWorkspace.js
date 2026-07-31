import { useEffect, useMemo, useState } from 'react'

import { apiFetch } from '../../../api/http'
import { API } from '../../../config/env'
import { rotationModelLabel } from '../../../shared/formatters'
import { ACTIVE_STRATEGY_MODE, AVAILABLE_ASSETS, STRATEGY_CATALOG } from '../model/constants'
import { defaultForm, numericFields } from '../model/defaults'
import { STRATEGY_PRESETS, SWING_QRDQN_QR0_CONFIG, SWING_QRDQN_QR1_CONFIG, SWING_QRDQN_QR2_CONFIG } from '../model/presets'

function parseAssets(text) {
  const assets = String(text)
    .split(',')
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean)
  return [...new Set(assets)]
}

export function useBacktestWorkspace() {
  const [form, setForm] = useState(defaultForm)
  const [assetsText, setAssetsText] = useState(defaultForm.assets.join(', '))
  const [selectedStrategy, setSelectedStrategy] = useState(defaultForm.strategy_mode)
  const [job, setJob] = useState(null)
  const [results, setResults] = useState(null)
  const [selectedKey, setSelectedKey] = useState('')
  const [error, setError] = useState('')
  const [loadingResults, setLoadingResults] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)
  const [settingsMessage, setSettingsMessage] = useState('')
  const [apiVersion, setApiVersion] = useState('…')
  const [computeStatus, setComputeStatus] = useState(null)
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState('analysis')
  const [alpacaIntegration, setAlpacaIntegration] = useState({ configured: false, api_key_id_masked: null })
  const [alpacaApiKeyId, setAlpacaApiKeyId] = useState('')
  const [alpacaSecretKey, setAlpacaSecretKey] = useState('')
  const [alpacaMessage, setAlpacaMessage] = useState('')
  const [alpacaBusy, setAlpacaBusy] = useState(false)
  const [showJsonConfig, setShowJsonConfig] = useState(true)
  const [configJsonText, setConfigJsonText] = useState('')
  const [configJsonBusy, setConfigJsonBusy] = useState(false)
  const [configJsonMessage, setConfigJsonMessage] = useState('')

  const running = Boolean(job && ['queued', 'running'].includes(job.status))
  const selectedRun = useMemo(
    () => results?.runs?.find((run) => run.key === selectedKey) || results?.runs?.[0] || null,
    [results, selectedKey],
  )

  const rotationSelectionText = (models, source) => (models || [])
    .map((model) => {
      const repetitions = model === 'xgboost_utility'
        ? Number(source?.rotation_xgb_repetitions ?? 1)
        : Number(source?.rotation_qrdqn_repetitions ?? 1)
      return `${rotationModelLabel(model)}${repetitions > 1 ? ` × ${repetitions}` : ''}`
    })
    .join(' + ')

  const jobRotationModels = Array.isArray(job?.request?.rotation_models)
    ? job.request.rotation_models
    : []
  const jobRotationModelText = rotationSelectionText(jobRotationModels, job?.request)
  const currentRotationModelText = rotationSelectionText(form.rotation_models, form)
  const screenDiffersFromJob = Boolean(
    jobRotationModelText
    && currentRotationModelText
    && jobRotationModelText !== currentRotationModelText,
  )

  async function loadResults(jobId) {
    setLoadingResults(true)
    try {
      const payload = await apiFetch(`${API}/jobs/${jobId}/results`)
      setResults(payload)
      setSelectedKey((current) => current || payload.runs?.[0]?.key || '')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoadingResults(false)
    }
  }

  useEffect(() => {
    async function bootstrap() {
      try {
        const health = await apiFetch(`${API}/health`)
        setApiVersion(health.api_version || 'unknown')
        setComputeStatus(health.compute || null)
      } catch {
        setApiVersion('unavailable')
      }

      try {
        setAlpacaIntegration(await apiFetch(`${API}/integrations/alpaca`))
      } catch {
        setAlpacaIntegration({ configured: false, api_key_id_masked: null })
      }

      try {
        const config = await apiFetch(`${API}/config`)
        const loadedStrategy = STRATEGY_CATALOG.some((item) => item.mode === config.strategy_mode)
          ? config.strategy_mode
          : ACTIVE_STRATEGY_MODE
        const normalized = {
          ...defaultForm,
          ...(STRATEGY_PRESETS[loadedStrategy] || {}),
          ...config,
          strategy_mode: loadedStrategy,
          assets: Array.isArray(config.assets) && config.assets.length ? config.assets : AVAILABLE_ASSETS,
          end_date: config.end_date || '',
        }
        setForm(normalized)
        setAssetsText(normalized.assets.join(', '))
        setSelectedStrategy(loadedStrategy)
        setConfigJsonText(JSON.stringify(normalized, null, 2))
        const latest = await apiFetch(`${API}/jobs/latest`)
        if (latest) {
          setJob(latest)
          if (latest.status === 'completed') await loadResults(latest.id)
        }
      } catch (requestError) {
        setError(requestError.message)
      }
    }
    bootstrap()
  }, [])

  useEffect(() => {
    if (!running || !job?.id) return undefined
    const timer = window.setInterval(async () => {
      try {
        const updated = await apiFetch(`${API}/jobs/${job.id}`)
        setJob(updated)
        if (updated.status === 'completed') {
          window.clearInterval(timer)
          await loadResults(updated.id)
        } else if (['failed', 'interrupted'].includes(updated.status)) {
          window.clearInterval(timer)
        }
      } catch (requestError) {
        setError(requestError.message)
      }
    }, 5000)
    return () => window.clearInterval(timer)
  }, [running, job?.id])

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function toggleRotationModel(model) {
    setForm((current) => {
      const models = Array.isArray(current.rotation_models) ? current.rotation_models : []
      const next = models.includes(model)
        ? models.filter((item) => item !== model)
        : [...models, model]
      return next.length ? { ...current, rotation_models: next } : current
    })
  }

  function buildPayload() {
    const assets = parseAssets(assetsText)
    if (assets.length < 2) throw new Error('Compound Capital Rotation requires at least two assets.')
    const payload = {
      ...form,
      assets,
      strategy_mode: selectedStrategy,
      end_date: form.end_date || null,
    }
    numericFields.forEach((field) => {
      payload[field] = Number(payload[field])
    })
    payload.rotation_switch_margin_candidates = (payload.rotation_switch_margin_candidates || []).map(Number)
    return payload
  }

  function applyConfigToScreen(config) {
    const strategy = STRATEGY_CATALOG.some((item) => item.mode === config.strategy_mode)
      ? config.strategy_mode
      : ACTIVE_STRATEGY_MODE
    const normalized = {
      ...defaultForm,
      ...(STRATEGY_PRESETS[strategy] || {}),
      ...config,
      strategy_mode: strategy,
      assets: Array.isArray(config.assets) && config.assets.length ? config.assets : AVAILABLE_ASSETS,
      end_date: config.end_date || '',
    }
    setForm(normalized)
    setAssetsText(normalized.assets.join(', '))
    setSelectedStrategy(strategy)
    setConfigJsonText(JSON.stringify(normalized, null, 2))
  }

  async function saveSettings() {
    setSavingSettings(true)
    setSettingsMessage('')
    setError('')
    try {
      const saved = await apiFetch(`${API}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      })
      applyConfigToScreen(saved)
      setSettingsMessage('Parameters saved in MongoDB.')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSavingSettings(false)
    }
  }

  async function resetSettings() {
    setSavingSettings(true)
    setSettingsMessage('')
    setError('')
    try {
      const restored = await apiFetch(`${API}/config/reset`, { method: 'POST' })
      applyConfigToScreen(restored)
      setSettingsMessage('Default parameters restored.')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSavingSettings(false)
    }
  }

  function parseConfigurationJson() {
    try {
      const parsed = JSON.parse(configJsonText)
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
        throw new Error('Configuration JSON must be an object.')
      }
      return parsed
    } catch (parseError) {
      throw new Error(`Invalid JSON: ${parseError.message}`)
    }
  }

  function loadSwingHeadToHeadJson() {
    setConfigJsonText(JSON.stringify(SWING_QRDQN_QR0_CONFIG, null, 2))
    setConfigJsonMessage('QR0 Legacy baseline loaded into the editor. Nothing has been saved yet.')
    setShowJsonConfig(true)
  }

  function loadSwingQr1Json() {
    setConfigJsonText(JSON.stringify(SWING_QRDQN_QR1_CONFIG, null, 2))
    setConfigJsonMessage('QR1 N-step 5 configuration loaded into the editor. Nothing has been saved yet.')
    setShowJsonConfig(true)
  }

  function loadSwingQr2Json() {
    setConfigJsonText(JSON.stringify(SWING_QRDQN_QR2_CONFIG, null, 2))
    setConfigJsonMessage('QR2 N-step 10 configuration loaded into the editor. Nothing has been saved yet.')
    setShowJsonConfig(true)
  }

  function loadCurrentConfigurationJson() {
    try {
      setConfigJsonText(JSON.stringify(buildPayload(), null, 2))
      setConfigJsonMessage('Current screen configuration loaded into the JSON editor.')
      setShowJsonConfig(true)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function validateConfigurationJson() {
    setConfigJsonBusy(true)
    setConfigJsonMessage('')
    setError('')
    try {
      const result = await apiFetch(`${API}/config/json/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parseConfigurationJson()),
      })
      const count = Object.keys(result.changes || {}).length
      setConfigJsonMessage(`JSON is valid. ${count} parameter${count === 1 ? '' : 's'} can be applied.`)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setConfigJsonBusy(false)
    }
  }

  async function applyConfigurationJson() {
    setConfigJsonBusy(true)
    setConfigJsonMessage('')
    setSettingsMessage('')
    setError('')
    try {
      const result = await apiFetch(`${API}/config/json/apply`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parseConfigurationJson()),
      })
      applyConfigToScreen(result.config || {})
      const count = Object.keys(result.changes || {}).length
      setConfigJsonMessage(`Applied ${count} parameter${count === 1 ? '' : 's'} to MongoDB.`)
      setSettingsMessage('JSON configuration applied to MongoDB.')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setConfigJsonBusy(false)
    }
  }

  async function saveAndTestAlpaca() {
    setAlpacaBusy(true)
    setAlpacaMessage('')
    setError('')
    try {
      if (!alpacaApiKeyId.trim() || !alpacaSecretKey.trim()) {
        throw new Error('Enter both the Alpaca API Key ID and Secret Key.')
      }
      const saved = await apiFetch(`${API}/integrations/alpaca`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key_id: alpacaApiKeyId.trim(), secret_key: alpacaSecretKey.trim() }),
      })
      setAlpacaIntegration(saved)
      const tested = await apiFetch(`${API}/integrations/alpaca/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feed: form.alpaca_feed || 'iex' }),
      })
      setAlpacaApiKeyId('')
      setAlpacaSecretKey('')
      setAlpacaMessage(`Connected: ${tested.symbol} ${tested.feed.toUpperCase()} · ${tested.bars} recent bars · last ${Number(tested.last_close).toFixed(2)}`)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setAlpacaBusy(false)
    }
  }

  async function testStoredAlpaca() {
    setAlpacaBusy(true)
    setAlpacaMessage('')
    setError('')
    try {
      const tested = await apiFetch(`${API}/integrations/alpaca/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feed: form.alpaca_feed || 'iex' }),
      })
      setAlpacaMessage(`Connected: ${tested.symbol} ${tested.feed.toUpperCase()} · ${tested.bars} recent bars · last ${Number(tested.last_close).toFixed(2)}`)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setAlpacaBusy(false)
    }
  }

  async function removeAlpaca() {
    setAlpacaBusy(true)
    setAlpacaMessage('')
    setError('')
    try {
      await apiFetch(`${API}/integrations/alpaca`, { method: 'DELETE' })
      setAlpacaIntegration({ configured: false, api_key_id_masked: null })
      setAlpacaApiKeyId('')
      setAlpacaSecretKey('')
      setAlpacaMessage('Alpaca credentials removed from MongoDB.')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setAlpacaBusy(false)
    }
  }

  async function runBacktest() {
    setError('')
    setSettingsMessage('')
    setResults(null)
    try {
      const created = await apiFetch(`${API}/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      })
      setSettingsMessage('Current parameters were saved and queued as an immutable execution snapshot.')
      setJob(created)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  const comparisonData = useMemo(
    () => (results?.comparison || []).map((row) => ({
      ...row,
      label: row.strategy_label || row.backend,
      modelLabel: row.model_family || row.backend,
      strategyPct: Number(row.strategy_return) * 100,
      buyHoldPct: Number(row.buy_hold_return) * 100,
      excessPct: Number(row.excess_return) * 100,
    })),
    [results],
  )

  const bestRun = useMemo(() => {
    if (!comparisonData.length) return null
    return [...comparisonData].sort((a, b) => b.excessPct - a.excessPct)[0]
  }, [comparisonData])

  const selectedMetrics = selectedRun?.metrics || {}
  const selectedStrategyMetadata = STRATEGY_CATALOG.find((item) => item.mode === selectedStrategy)

  return {
    form,
    setForm,
    assetsText,
    setAssetsText,
    selectedStrategy,
    setSelectedStrategy,
    job,
    results,
    selectedKey,
    setSelectedKey,
    error,
    setError,
    loadingResults,
    savingSettings,
    settingsMessage,
    apiVersion,
    computeStatus,
    activeWorkspaceTab,
    setActiveWorkspaceTab,
    alpacaIntegration,
    alpacaApiKeyId,
    setAlpacaApiKeyId,
    alpacaSecretKey,
    setAlpacaSecretKey,
    alpacaMessage,
    alpacaBusy,
    showJsonConfig,
    setShowJsonConfig,
    configJsonText,
    setConfigJsonText,
    configJsonBusy,
    configJsonMessage,
    running,
    jobRotationModels,
    jobRotationModelText,
    currentRotationModelText,
    screenDiffersFromJob,
    selectedRun,
    buildPayload,
    saveSettings,
    resetSettings,
    update,
    toggleRotationModel,
    loadSwingHeadToHeadJson,
    loadSwingQr1Json,
    loadSwingQr2Json,
    loadCurrentConfigurationJson,
    validateConfigurationJson,
    applyConfigurationJson,
    saveAndTestAlpaca,
    testStoredAlpaca,
    removeAlpaca,
    runBacktest,
    comparisonData,
    bestRun,
    selectedMetrics,
    selectedStrategyMetadata,
  }
}

