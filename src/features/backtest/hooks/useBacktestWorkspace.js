import { useEffect, useMemo, useState } from 'react'

import { apiFetch } from '../../../api/http'
import { API } from '../../../config/env'
import { rotationModelLabel } from '../../../shared/formatters'
import {
  ACTIVE_STRATEGY_MODE,
  ALL_ASSETS_VALUE,
  AVAILABLE_ASSETS,
  STRATEGY_CATALOG,
  normalizeFibonacciRatio,
  swingTimeframeProfiles,
} from '../model/constants'
import { defaultForm, numericFields } from '../model/defaults'
import {
  ASSET_DEFAULT_SETUPS,
  STRATEGY_PRESETS,
  SWING_HEAD_TO_HEAD_CONFIG,
} from '../model/presets'

export function useBacktestWorkspace() {
  const [form, setForm] = useState(defaultForm)
  const [assetsText, setAssetsText] = useState(defaultForm.assets.join(', '))
  const [selectedAsset, setSelectedAsset] = useState(ALL_ASSETS_VALUE)
  const [selectedStrategy, setSelectedStrategy] = useState(
    defaultForm.strategy_mode,
  )
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
  const [showJsonConfig, setShowJsonConfig] = useState(false)
  const [configJsonText, setConfigJsonText] = useState('')
  const [configJsonBusy, setConfigJsonBusy] = useState(false)
  const [configJsonMessage, setConfigJsonMessage] = useState('')

  const running = job && ['queued', 'running'].includes(job.status)
  const jobRotationModels = (
    ['COMPOUND_ROTATION_SWING_1W', 'COMPOUND_ROTATION_DAY_TRADE_OPEN_CLOSE'].includes(
      job?.request?.strategy_mode,
    )
    && Array.isArray(job?.request?.rotation_models)
  )
    ? job.request.rotation_models
    : []
  const rotationSelectionText = (models, source) => models
    .map((model) => {
      const repetitions = model === 'xgboost_utility'
        ? Number(source?.rotation_xgb_repetitions ?? 1)
        : Number(source?.rotation_qrdqn_repetitions ?? 1)
      return `${rotationModelLabel(model)}${repetitions > 1 ? ` × ${repetitions}` : ''}`
    })
    .join(' + ')
  const jobRotationModelText = rotationSelectionText(
    jobRotationModels,
    job?.request,
  )
  const currentRotationModelText = Array.isArray(form.rotation_models)
    ? rotationSelectionText(form.rotation_models, form)
    : ''
  const screenDiffersFromJob = Boolean(
    jobRotationModelText
    && currentRotationModelText
    && jobRotationModelText !== currentRotationModelText,
  )
  const selectedRun = useMemo(
    () => results?.runs?.find((run) => run.key === selectedKey) || results?.runs?.[0] || null,
    [results, selectedKey],
  )

  useEffect(() => {
    async function bootstrap() {
      try {
        const health = await apiFetch(`${API}/health`)
        setApiVersion(health.api_version || 'unknown')
        setComputeStatus(health.compute || null)
      } catch {
        setApiVersion('unavailable')
        setComputeStatus(null)
      }

      try {
        const integration = await apiFetch(`${API}/integrations/alpaca`)
        setAlpacaIntegration(integration)
      } catch {
        setAlpacaIntegration({ configured: false, api_key_id_masked: null })
      }

      try {
        const config = await apiFetch(`${API}/config`)
        const configuredAssets = Array.isArray(config.assets)
          ? config.assets
          : defaultForm.assets
        const initialSelectedAsset = configuredAssets.length === 1
          ? configuredAssets[0]
          : ALL_ASSETS_VALUE
        const storedAssetOverride = initialSelectedAsset !== ALL_ASSETS_VALUE
          ? config.asset_overrides?.[initialSelectedAsset]
          : null
        const assetDefault = initialSelectedAsset !== ALL_ASSETS_VALUE
          ? ASSET_DEFAULT_SETUPS[initialSelectedAsset]
          : null

        const loadedStrategy = (
          config.strategy_mode || defaultForm.strategy_mode
        )
        const loadedStrategyMetadata = STRATEGY_CATALOG.find(
          (item) => item.mode === loadedStrategy,
        )
        const promotedStrategy = loadedStrategyMetadata
          ? loadedStrategy
          : ACTIVE_STRATEGY_MODE
        const promotedPreset = STRATEGY_PRESETS[promotedStrategy] || {}

        const normalized = {
          ...defaultForm,
          ...promotedPreset,
          ...config,
          ...(assetDefault || {}),
          ...(storedAssetOverride || {}),
          strategy_mode: promotedStrategy,
          assets: configuredAssets,
          end_date: (
            storedAssetOverride?.end_date
            ?? config.end_date
            ?? ''
          ),
          fibonacci_target_ratio: normalizeFibonacciRatio(
            storedAssetOverride?.fibonacci_target_ratio
            ?? config.fibonacci_target_ratio
            ?? assetDefault?.fibonacci_target_ratio,
          ),
        }
        delete normalized.setup_name

        setForm(normalized)
        setAssetsText(configuredAssets.join(', '))
        setSelectedAsset(initialSelectedAsset)
        setSelectedStrategy(
          normalized.strategy_mode || defaultForm.strategy_mode,
        )

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

  function buildPayload() {
    const assets = selectedAsset === ALL_ASSETS_VALUE
      ? [...AVAILABLE_ASSETS]
      : [selectedAsset]

    const strategyPreset = STRATEGY_PRESETS[selectedStrategy] || {}

    // Strategy selection is authoritative. Remove configuration-only and
    // backend-only fields that may have been returned by a previous save.
    const {
      setup_name: _setupName,
      parameter_mode: _parameterMode,
      asset_overrides: _assetOverrides,
      mongo_status: _mongoStatus,
      fractional_shares: _fractionalShares,
      ...cleanBaseParameters
    } = {
      ...strategyPreset,
      ...form,
      strategy_mode: selectedStrategy,
    }

    const assetOverrides = {}
    if (selectedAsset !== ALL_ASSETS_VALUE) {
      assetOverrides[selectedAsset] = {
        ...cleanBaseParameters,
        assets: [selectedAsset],
        model_backends: [...cleanBaseParameters.model_backends],
        rotation_models: [...cleanBaseParameters.rotation_models],
        strategy_mode: selectedStrategy,
      }
    }

    const payload = {
      ...cleanBaseParameters,
      assets,
      strategy_mode: selectedStrategy,
      parameter_mode: Object.keys(assetOverrides).length
        ? 'asset_profiles'
        : 'general',
      asset_overrides: assetOverrides,
      end_date: cleanBaseParameters.end_date || null,
    }

    numericFields.forEach((field) => {
      payload[field] = Number(payload[field])
      if (
        selectedAsset !== ALL_ASSETS_VALUE
        && assetOverrides[selectedAsset]
      ) {
        assetOverrides[selectedAsset][field] = Number(
          assetOverrides[selectedAsset][field],
        )
      }
    })

    return payload
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
      const savedAssetOverride = selectedAsset !== ALL_ASSETS_VALUE
        ? saved.asset_overrides?.[selectedAsset]
        : null
      const normalized = {
        ...defaultForm,
        ...saved,
        ...(savedAssetOverride || {}),
        end_date: (
          savedAssetOverride?.end_date
          ?? saved.end_date
          ?? ''
        ),
        fibonacci_target_ratio: normalizeFibonacciRatio(
          savedAssetOverride?.fibonacci_target_ratio
          ?? saved.fibonacci_target_ratio,
        ),
      }
      setForm(normalized)
      setAssetsText(normalized.assets.join(', '))
      setSelectedStrategy(
        normalized.strategy_mode || defaultForm.strategy_mode,
      )
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
      const restored = await apiFetch(`${API}/config/reset`, {
        method: 'POST',
      })
      const normalized = {
        ...defaultForm,
        ...restored,
        end_date: restored.end_date || '',
        fibonacci_target_ratio: normalizeFibonacciRatio(
          restored.fibonacci_target_ratio,
        ),
      }
      setForm(normalized)
      setAssetsText(normalized.assets.join(', '))
      setSelectedStrategy(
        normalized.strategy_mode || defaultForm.strategy_mode,
      )
      setSettingsMessage('Default parameters restored.')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSavingSettings(false)
    }
  }

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function updateTimeframe(value) {
    setForm((current) => {
      const profile = swingTimeframeProfiles[value]
      if (!profile) {
        return { ...current, timeframe: value }
      }
      return {
        ...current,
        ...profile,
        timeframe: value,
      }
    })
  }

  function toggleBackend(backend) {
    setForm((current) => {
      const exists = current.model_backends.includes(backend)
      const next = exists
        ? current.model_backends.filter((item) => item !== backend)
        : [...current.model_backends, backend]
      return { ...current, model_backends: next }
    })
  }

  function toggleRotationModel(model) {
    setForm((current) => {
      const models = Array.isArray(current.rotation_models)
        ? current.rotation_models
        : []
      const exists = models.includes(model)
      const next = exists
        ? models.filter((item) => item !== model)
        : [...models, model]
      return next.length
        ? { ...current, rotation_models: next }
        : current
    })
  }

  function toggleExitRiskBackend(backend) {
    setForm((current) => {
      const currentBackends = Array.isArray(current.exit_risk_model_backends)
        ? current.exit_risk_model_backends
        : []
      const exists = currentBackends.includes(backend)
      const next = exists
        ? currentBackends.filter((item) => item !== backend)
        : [...currentBackends, backend]
      return next.length
        ? { ...current, exit_risk_model_backends: next }
        : current
    })
  }

  function parseConfigurationJson() {
    let parsed
    try {
      parsed = JSON.parse(configJsonText)
    } catch (parseError) {
      throw new Error(`Invalid JSON: ${parseError.message}`)
    }
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
      throw new Error('Configuration JSON must be an object.')
    }
    return parsed
  }

  function applyConfigToScreen(config) {
    const configuredAssets = Array.isArray(config.assets) && config.assets.length
      ? config.assets
      : defaultForm.assets
    const normalized = {
      ...defaultForm,
      ...config,
      assets: configuredAssets,
      end_date: config.end_date || '',
      fibonacci_target_ratio: normalizeFibonacciRatio(
        config.fibonacci_target_ratio,
      ),
    }
    setForm(normalized)
    setAssetsText(configuredAssets.join(', '))
    setSelectedAsset(
      configuredAssets.length === 1
        ? configuredAssets[0]
        : ALL_ASSETS_VALUE,
    )
    setSelectedStrategy(
      normalized.strategy_mode || defaultForm.strategy_mode,
    )
  }

  function loadSwingHeadToHeadJson() {
    setConfigJsonText(JSON.stringify(SWING_HEAD_TO_HEAD_CONFIG, null, 2))
    setConfigJsonMessage('Swing XGBoost vs QR-DQN baseline loaded into the editor. Nothing has been saved yet.')
    setShowJsonConfig(true)
  }

  function loadCurrentConfigurationJson() {
    setConfigJsonText(JSON.stringify(buildPayload(), null, 2))
    setConfigJsonMessage('Current screen configuration loaded into the JSON editor.')
    setShowJsonConfig(true)
  }

  async function validateConfigurationJson() {
    setConfigJsonBusy(true)
    setConfigJsonMessage('')
    setError('')
    try {
      const parsed = parseConfigurationJson()
      const result = await apiFetch(`${API}/config/json/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
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
      const parsed = parseConfigurationJson()
      const result = await apiFetch(`${API}/config/json/apply`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      })
      applyConfigToScreen(result.config || {})
      const count = Object.keys(result.changes || {}).length
      setConfigJsonMessage(`Applied ${count} JSON parameter${count === 1 ? '' : 's'} to MongoDB and refreshed the screen.`)
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
        body: JSON.stringify({
          api_key_id: alpacaApiKeyId.trim(),
          secret_key: alpacaSecretKey.trim(),
        }),
      })
      setAlpacaIntegration(saved)
      const tested = await apiFetch(`${API}/integrations/alpaca/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feed: form.alpaca_feed || 'iex' }),
      })
      setAlpacaApiKeyId('')
      setAlpacaSecretKey('')
      setAlpacaMessage(
        `Connected: ${tested.symbol} ${tested.feed.toUpperCase()} · ${tested.bars} recent 15m bars · last ${Number(tested.last_close).toFixed(2)}`,
      )
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
      setAlpacaMessage(
        `Connected: ${tested.symbol} ${tested.feed.toUpperCase()} · ${tested.bars} recent 15m bars · last ${Number(tested.last_close).toFixed(2)}`,
      )
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

    // Immutable snapshot of exactly what is currently shown on screen.
    const executionPayload = buildPayload()

    try {
      const created = await apiFetch(`${API}/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(executionPayload),
      })

      setSettingsMessage(
        'Current screen parameters were saved and queued as one execution snapshot.',
      )
      setJob(created)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  const comparisonData = useMemo(
    () => (results?.comparison || []).map((row) => ({
      ...row,
      label: row.portfolio_rotation
        ? row.strategy_label
        : (row.exit_risk_backend
          ? `${row.symbol} · EXIT ${row.exit_risk_backend}`
          : `${row.symbol} · ${row.backend}`),
      modelLabel: row.portfolio_rotation
        ? row.strategy_label
        : (row.exit_risk_backend
          ? `BOTTOM ${row.structural_backend || 'histgb'} / EXIT ${row.exit_risk_backend}`
          : row.backend),
      strategyPct: Number(row.strategy_return) * 100,
      buyHoldPct: Number(row.buy_hold_return) * 100,
      excessPct: Number(row.excess_return) * 100,
    })),
    [results],
  )

  const robustnessSummary = results?.robustnessSummary || []

  const bestRun = useMemo(() => {
    if (!comparisonData.length) return null
    return [...comparisonData].sort((a, b) => b.excessPct - a.excessPct)[0]
  }, [comparisonData])

  const selectedMetrics = selectedRun?.metrics || {}
  const selectedStrategyMetadata = STRATEGY_CATALOG.find(
    (item) => item.mode === selectedStrategy,
  )
  const selectedStrategyExecutable = selectedStrategyMetadata?.executable !== false
  const bottomThreshold = selectedMetrics.bottom_calibration?.threshold
  const topThreshold = selectedMetrics.top_calibration?.threshold
  const buys = selectedRun?.series?.filter((row) => row.buyPrice !== null) || []
  const sells = selectedRun?.series?.filter((row) => row.sellPrice !== null) || []
  return {
    form,
    setForm,
    assetsText,
    setAssetsText,
    selectedAsset,
    setSelectedAsset,
    selectedStrategy,
    setSelectedStrategy,
    job,
    setJob,
    results,
    setResults,
    selectedKey,
    setSelectedKey,
    error,
    setError,
    loadingResults,
    setLoadingResults,
    savingSettings,
    setSavingSettings,
    settingsMessage,
    setSettingsMessage,
    apiVersion,
    setApiVersion,
    computeStatus,
    setComputeStatus,
    activeWorkspaceTab,
    setActiveWorkspaceTab,
    alpacaIntegration,
    setAlpacaIntegration,
    alpacaApiKeyId,
    setAlpacaApiKeyId,
    alpacaSecretKey,
    setAlpacaSecretKey,
    alpacaMessage,
    setAlpacaMessage,
    alpacaBusy,
    setAlpacaBusy,
    showJsonConfig,
    setShowJsonConfig,
    configJsonText,
    setConfigJsonText,
    configJsonBusy,
    setConfigJsonBusy,
    configJsonMessage,
    setConfigJsonMessage,
    running,
    jobRotationModels,
    rotationSelectionText,
    jobRotationModelText,
    currentRotationModelText,
    screenDiffersFromJob,
    selectedRun,
    loadResults,
    buildPayload,
    saveSettings,
    resetSettings,
    update,
    updateTimeframe,
    toggleBackend,
    toggleRotationModel,
    toggleExitRiskBackend,
    parseConfigurationJson,
    applyConfigToScreen,
    loadSwingHeadToHeadJson,
    loadCurrentConfigurationJson,
    validateConfigurationJson,
    applyConfigurationJson,
    saveAndTestAlpaca,
    testStoredAlpaca,
    removeAlpaca,
    runBacktest,
    comparisonData,
    robustnessSummary,
    bestRun,
    selectedMetrics,
    selectedStrategyMetadata,
    selectedStrategyExecutable,
    bottomThreshold,
    topThreshold,
    buys,
    sells,
  }
}
