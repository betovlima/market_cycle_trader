// Stages recorded by the Live analysis worker in MongoDB. These are real
// checkpoints, NOT a fabricated percentage or ETA for model computation.
export const LIVE_INTRADAY_STEPS = Object.freeze([
  { id: 'validating', label: 'Validando conta e posição Live' },
  { id: 'downloading_daily_history', label: 'Carregando histórico diário concluído' },
  { id: 'collecting_current_session', label: 'Consultando movimento do pregão atual' },
  { id: 'model_calibration', label: 'Calculando recomendação da Winner' },
  { id: 'finished', label: 'Resultado preparado para revisão' },
])

const STEP_INDEX = Object.fromEntries(LIVE_INTRADAY_STEPS.map((step, index) => [step.id, index]))

export function liveIntradayProgressModel(result, error = '') {
  if (error) return {
    kind: 'error', stage: -1, spinning: false,
    headline: 'Não foi possível consultar o andamento',
    description: 'Verifique a conexão Live e tente atualizar a consulta.',
  }
  if (!result) return {
    kind: 'checking', stage: -1, spinning: true,
    headline: 'Consultando estado da contingência',
    description: 'Aguardando resposta da Alpaca e do serviço Live.',
  }
  if (result.status === 'running') {
    const stage = STEP_INDEX[result.phase] ?? 0
    return {
      kind: 'running', stage, spinning: true,
      headline: LIVE_INTRADAY_STEPS[stage].label,
      description: 'Reanálise em andamento. Etapa confirmada pelo backend; sem estimativa percentual.',
    }
  }
  if (result.status === 'prepared') return {
    kind: 'completed', stage: LIVE_INTRADAY_STEPS.length,
    spinning: false, headline: 'Reanálise concluída',
    description: 'Recomendação disponível para comparação. Nenhuma ordem foi enviada.',
  }
  if (result.status === 'failed') return {
    kind: 'error', stage: -1, spinning: false,
    headline: 'Reanálise interrompida',
    description: 'O cálculo não foi concluído. Nenhuma ordem foi enviada.',
  }
  if (result.status === 'idle' && result.can_analyze) return {
    kind: 'ready', stage: -1, spinning: false,
    headline: 'Contingência disponível agora',
    description: 'Mercado aberto. O recálculo pode começar sem aguardar o fechamento da NYSE.',
  }
  return {
    kind: 'waiting', stage: -1, spinning: false,
    headline: 'Sem processamento intradiário em andamento',
    description: 'A reanálise da sessão atual requer um pregão regular aberto.',
  }
}
