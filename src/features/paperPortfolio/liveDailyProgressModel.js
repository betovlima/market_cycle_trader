// Pure presentation of states returned by the canonical Live daily-signal API.
// These are workflow stages, never an estimated percentage of completed work.
export const DAILY_STEPS = Object.freeze([
  'Fechamento da NYSE',
  'Histórico diário liberado',
  'Sinal Winner preparado',
])

const PHASES = Object.freeze({
  post_close_winner_training: 'Treinando a Winner com o histórico diário',
  post_close_signal_ready_for_execution: 'Sinal diário validado e registrado',
  post_close_signal_retry_wait: 'Aguardando nova tentativa do agendador',
  session_armed_without_model_decision: 'Sessão preparada, aguardando cálculo',
  daily_signal_recovered_at_open: 'Sinal diário recuperado na abertura',
  signal_waiting_for_daily_bar: 'Aguardando liberação dos dados diários',
})

export function liveDailyProgressModel(state, error = '') {
  if (error || !state) {
    return {
      stage: -1, kind: 'unavailable', active: false,
      title: 'Verificação indisponível',
      detail: error || 'Consultando a Alpaca e o estado da Winner…',
      eventAt: null, eventLabel: null,
    }
  }
  const phase = PHASES[state.run_phase] || 'Calculando o sinal diário'
  switch (state.status) {
    case 'market_open':
      return {
        stage: 0, kind: 'waiting', active: false,
        title: 'Aguardando fechamento da NYSE',
        detail: 'O mercado está aberto. O cálculo diário ainda não começou.',
        eventAt: state.expected_daily_bar_check_at,
        eventLabel: 'Verificação dos dados a partir de',
      }
    case 'waiting_daily_bar':
      return {
        stage: 1, kind: 'waiting', active: false,
        title: 'Aguardando liberação do histórico diário',
        detail: 'O pregão fechou; o sistema aguarda a janela de segurança dos candles.',
        eventAt: state.expected_daily_bar_check_at,
        eventLabel: 'Próxima verificação a partir de',
      }
    case 'queued':
    case 'already_claimed':
      return {
        stage: 2, kind: 'queued', active: false,
        title: 'Sinal solicitado ao agendador Live',
        detail: 'A solicitação foi registrada. Aguardando o início da preparação.',
        eventAt: null, eventLabel: null,
      }
    case 'processing':
      return {
        stage: 2, kind: 'processing', active: true,
        title: 'Winner em processamento',
        detail: phase,
        eventAt: null, eventLabel: null,
      }
    case 'ready':
      return {
        stage: 2, kind: 'ready', active: false,
        title: 'Dados liberados para o recálculo',
        detail: 'O sinal está pendente e pode ser solicitado.',
        eventAt: null, eventLabel: null,
      }
    case 'already_prepared':
      return {
        stage: 3, kind: 'completed', active: false,
        title: 'Sinal diário preparado',
        detail: 'A decisão D−1 foi validada e registrada para o próximo pregão.',
        eventAt: null, eventLabel: null,
      }
    case 'blocked':
      return {
        stage: -1, kind: 'blocked', active: false,
        title: 'Sessão já possui um estado operacional',
        detail: 'Este controle não substitui uma decisão validada ou uma execução.',
        eventAt: null, eventLabel: null,
      }
    case 'inactive':
      return {
        stage: -1, kind: 'paused', active: false,
        title: 'Live pausado ou parado',
        detail: 'A preparação automática está suspensa pelo controle operacional.',
        eventAt: null, eventLabel: null,
      }
    case 'outside_window':
      return {
        stage: -1, kind: 'waiting', active: false,
        title: 'Fora da janela de preparação',
        detail: 'O sinal só pode ser preparado com o fechamento diário disponível.',
        eventAt: state.expected_daily_bar_check_at,
        eventLabel: 'Próxima referência de horário',
      }
    default:
      return {
        stage: -1, kind: 'unavailable', active: false,
        title: 'Estado do sinal diário indisponível',
        detail: 'Não há confirmação suficiente para mostrar a etapa atual.',
        eventAt: null, eventLabel: null,
      }
  }
}
