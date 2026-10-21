## 2026-10-21 — Front v10.7.31.1 | faixa de sessão no Portfólio Live

**Base explícita do ambiente em uso:** Front v10.7.31, commit `4351ac5078c29559e8f623b8cda657ca924d0f9f`; API v10.8.124, sem alteração. Alteração isolada na branch `fix/v10.7.31.1-live-session-strip` — não integrar automaticamente a `main` mais nova para evitar trazer mudanças de layout e comandos v10.7.32–v10.7.35.

**Objetivo:** no Portfólio → Live, exibir a mesma faixa de sessão disponível em Trading, preservando os oito indicadores financeiros compartilhados. As fontes continuam segregadas: `GET /api/live-market/portfolio` e `GET /api/live-market/robot/status` no Live; as rotas Paper não são chamadas pela tela Live. Estado do robô = `control_mode` real do Live; conexão = leitura do portfólio da conta Live; mercado = `market_clock` Live.

**Limites da API v10.8.124:** o backend Live fornece `realized_pnl=null`, `total_pnl=null`, `total_return=null`, `audit.summary.distance_to_peak=null` e `maximum_drawdown=null`. A interface exibe `—` nesses campos; não substitui por zeros, valores Paper ou estimativas baseadas em depósitos. Horários reais de pós-fechamento, recalibração e execução também podem não estar disponíveis na resposta Live; exibir `Indisponível` quando a API não fornece timestamps. Não usar `next_open` como horário garantido de execução de ordens. O horário de próximo fechamento vem do relógio da Alpaca Live; atualização automática só é indicada quando `monitoring_enabled=true`; caso contrário é manual.

**Proteções:** não modificar backend, posições, ordens, estado do robô, autenticação ou endpoints; nenhuma chamada mutável nova. Mudança somente de UI. Testar `node --test tests/live-session-model.test.mjs` e `pnpm build`. Não afirmar implantação em produção antes do deploy.

---

# Market Cycle Trader — contexto de interface Live (Front v10.7.31)

## Entrega
- Repositório frontend: `betovlima/market_cycle_trader`, versão `10.7.31`, baseada na `10.7.30`.
- Na aba **Portfolio**, administradores entram por padrão no ambiente **Live**, que aparece antes de **Trading (Paper)**. A troca de ambientes mantém os respectivos dados isolados; usuários sem permissão `admin.manage` continuam exclusivamente no Paper. Revogação de acesso Live força retorno à aba Trading (Paper).
- O monitor de workflow está **dentro da mesma tela de Portfólio Live**, entre os controles operacionais e os logs da Winner Live. Ele utiliza o endpoint GET `/api/live-market/winner/monitor` da **API v10.8.118**, autenticado e limitado à conta Live.
- Mostra sessão, estado/etapa, classificação de recuperação, total de tentativas de preparação pós-fechamento e abertura, ordens para reconciliação, erros recentes e histórico de até 30 tentativas por consulta.
- Atualização automática de 15 segundos, botão Atualizar e filtro de data; mantém os logs de evento já existentes em seção separada.
- Frontend somente de leitura: nenhuma operação de compra, venda, reinício de pipeline ou mudança de configuração é chamada pela nova interface. Não há estimativas artificiais de percentual do fluxo.
- Traduções EN/PT/ES adicionadas em módulo dedicado, usando o mecanismo `tr()` já existente; CSS responsivo e tema existente.
- Sem mudança na API, no executor de ordens, nas regras de retry nem nas estratégias. CI frontend continua usando workflow preexistente `.github/workflows/frontend-build.yml` com `pnpm install --frozen-lockfile` e `pnpm build`.

## Limitações
- Os registros de tentativas anteriores à implantação da API v10.8.118 não podem ser reconstruídos retroativamente.
- A interface pode indicar sessão em processamento mesmo após término abrupto sem registro de falha; não infere falha pelo tempo transcorrido.
- A implantação do frontend é uma etapa separada do merge GitHub.
