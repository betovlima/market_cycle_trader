import { useEffect, useState } from 'react'
import { apiFetch } from '../../../api/http'
import { API } from '../../../config/env'

export function LiveBrokerSettings({ oauthConnected, onUpdated }) {
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let active = true
    apiFetch(`${API}/live-market/broker/settings`, { cache: 'no-store' })
      .then(value => { if (active) setSettings(value) })
      .catch(() => { if (active) setError('Não foi possível consultar as configurações do broker Live.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  async function change(enableOrders, confirmation) {
    if (!settings || busy) return
    const prompt = confirmation === 'BIND_VERIFIED_OAUTH_NO_ORDERS'
      ? 'Vincular sua conta Alpaca OAuth à Winner? Nenhuma ordem será habilitada.'
      : enableOrders
        ? 'Autorizar ordens REAIS na conta Live vinculada? Isso não inicia o robô, mas permite ordens quando ele for ativado. Confirme somente após validar o dry-run.'
        : 'Bloquear novos envios de ordens reais pela Winner?'
    if (!window.confirm(prompt)) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const next = await apiFetch(`${API}/live-market/broker/settings`, {
        method: 'POST',
        body: {
          expected_revision: settings.revision,
          enable_orders: enableOrders,
          confirmation: confirmation,
        },
      })
      setSettings(next)
      setNotice(enableOrders
        ? 'Autorização salva. O robô continua sujeito ao controle Live e às regras de execução.'
        : confirmation === 'BIND_VERIFIED_OAUTH_NO_ORDERS'
          ? 'Conta OAuth vinculada à Winner. Ordens reais continuam bloqueadas.'
          : 'Bloqueio de novas ordens registrado.')
      window.dispatchEvent(new Event('mct:alpaca-oauth-updated'))
      onUpdated?.()
    } catch (e) {
      setError(e.message || 'Não foi possível salvar a alteração.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="live-broker-settings" aria-label="Configuração administrativa do broker da Winner">
      <h4>Broker da Winner · Configuração Live</h4>
      {loading ? <p role="status">Consultando a configuração salva…</p> : null}
      {settings ? (
        <>
          <p>
            Autenticação: <strong>{settings.mode === 'oauth' ? 'OAuth da Alpaca' : 'API Keys (legado)'}</strong>
            {' · '}Robô: <strong>{settings.control_mode}</strong>
            {' · '}Ordens reais: <strong>{settings.order_submission_enabled ? 'habilitadas' : 'bloqueadas'}</strong>
            {settings.oauth_account_suffix ? ` · Conta vinculada: ...${settings.oauth_account_suffix}` : ''}
          </p>
          <p>As alterações são salvas com histórico no controle Live. Vincular OAuth não inicia o robô nem envia ordens.</p>
          <div className="portfolio-workspace-actions">
            {settings.mode !== 'oauth' ? (
              <button type="button" className="secondary-action compact"
                disabled={busy || !oauthConnected || !settings.can_bind}
                title={!settings.can_bind ? 'Pare o robô Live antes de alterar o broker.' : ''}
                onClick={() => change(false, 'BIND_VERIFIED_OAUTH_NO_ORDERS')}>
                Usar minha conta OAuth na Winner
              </button>
            ) : settings.oauth_orders_allowed ? (
              <button type="button" className="secondary-action compact" disabled={busy}
                onClick={() => change(false, 'DISABLE_LIVE_REAL_ORDERS')}>
                Bloquear novas ordens
              </button>
            ) : (
              <button type="button" className="secondary-action compact"
                disabled={busy || !settings.can_enable_orders || !oauthConnected}
                title={!settings.can_enable_orders ? 'Pare o robô Live antes de autorizar ordens.' : ''}
                onClick={() => change(true, 'ENABLE_LIVE_REAL_ORDERS')}>
                Autorizar ordens reais
              </button>
            )}
          </div>
          {settings.mode === 'oauth' && !settings.oauth_orders_allowed ? (
            <p role="status">Modo de consulta e validação. Ordens reais permanecem bloqueadas até autorização explícita.</p>
          ) : null}
        </>
      ) : null}
      {notice ? <p role="status">{notice}</p> : null}
      {error ? <p role="alert" className="global-error">{error}</p> : null}
    </section>
  )
}
