## 2026-10-21 — Front v10.7.36 | faixa de sessão Live

Branch `feature/v10.7.36-live-trading-session-strip` criada a partir da main em v10.7.35; integração da melhoria originalmente preparada para Front v10.7.31.1. API v10.8.124 não modificada.

**Escopo:** adicionar à tela Portfólio Live a faixa de sessão de aparência equivalente ao Trading, mas consultando somente `GET /api/live-market/portfolio` e `GET /api/live-market/robot/status`. Estado do robô Live vem de `control_mode`. Mantido o indicador de autorização de ordens reais (somente informativo). Sem alterar a faixa Paper, os controles reais, autenticação, banco, ordens ou API.

**Ausência de dados:** P/L realizado, P/L total, retorno, distância ao topo e drawdown Live retornados como `null` pela API permanecem `—` e sem cores artificiais. Horários de calibração e execução aparecem como indisponíveis quando a API não fornece as datas; não inferir horário de ordem da abertura da bolsa. Atualização automática só é indicada se o Live estiver com `monitoring_enabled=true`.

**Regressões preservadas:** correção de render inicial `data=null` da v10.7.35, ordem do painel Posição/Decisão Live da v10.7.34, monitores Live após a auditoria e ausência de controles duplicados na tela Portfólio. Testes do modelo, SSR de primeira renderização e build Vite. O deploy não é realizado pelo merge automaticamente.

---

## 2026-10-20 — Front v10.7.35 | hotfix da tela preta no Portfólio

**Problema observado:** após v10.7.34, tanto Portfólio Live quanto Trading deixaram de renderizar na entrada. Console apontou `TypeError: Cannot read properties of null (reading 'strategy_cash')`. `PortfolioMarketView` inicia com `useState(null)`, mas a refatoração v10.7.34 montava prematuramente `portfolioPositionDecision` antes da verificação `!data`; sua expressão JSX acessava `data.strategy_cash` ainda em null. O build Vite não detecta exceções de tempo de execução.

**Correção:** o box Posição Atual + Decisão do dia só é construído quando `data` está disponível. Mantidas a disposição v10.7.34, a ordem da Auditoria e dos monitores Live, os conteúdos da carteira e a lógica Paper sem alteração.

**Prevenção:** adicionado smoke-test de renderização inicial SSR para Live e Trading com API ainda sem resposta, executado no workflow frontend-build antes de Vite build. Nenhum endpoint, estado, posição, mercado financeiro ou ordem foi afetado.

**Branch:** `fix/v10.7.35-portfolio-null-data-render`. CI: smoke-test SSR e build Vite.

---

## 2026-10-20 — Front v10.7.34 | layout Portfólio Live

Pedido: exibir **Posição Atual e Decisão do dia** como primeiro box, imediatamente depois do cabeçalho do Portfólio Live. As seções **Operações Live · Monitoramento somente de leitura** (LiveWorkflowMonitor) e **Diagnóstico operacional · Live** (LiveWinnerEvents) devem aparecer **abaixo de Auditoria / Operações** (OperationAuditTable), nesta ordem.

Alteração restrita à composição visual de `PaperPortfolioDashboard.jsx`. A faixa de métricas, monitor informativo Live, posição, decisão, gráficos, ranking e tabela de operações foram preservados. Para Trading (Paper), mantida a ordem original: WinnerOperationMonitor, métricas, status da sessão e grid de posição/decisão. Ambos os monitores Live permanecem read-only, com mesmas props, polling e exportações. Nenhum botão operacional, estratégia, estado do robô, API, MongoDB ou execução Alpaca é alterado.

Versionamento: Front v10.7.34; branch `feature/v10.7.34-portfolio-live-layout`; CI frontend-build (pnpm build). Publicar Front após validação.

---

## 2026-10-20 — Front v10.7.33 (Portfolio Live sem comandos duplicados)

O box "Operação do Trader · Live" foi removido exclusivamente da tela Portfólio → Live, conforme imagem enviada pelo usuário. Removeu também os callbacks/states e import de LiveReconciliation não utilizados nessa tela. A ocorrência literal de \n exposta pelo box também deixa de aparecer.

O Portfolio Live mantém métricas, posição, auditoria, monitoramento informativo Live, histórico de eventos e monitor de fluxo; não altera a interface Trading (Paper). Os controles Iniciar, Pausar, Somente saída, Parar, botão Reconciliar e execução manual da Winner permanecem íntegros e exclusivos da tela Estratégia → Operação do Trader Live.

Alteração somente no frontend, sem alteração de APIs, dados MongoDB, estratégia, posição CAPR, ordens ou modo ativo do Live. Versão Front 10.7.33, branch feature/v10.7.33-remove-portfolio-live-controls. CI: build Vite, sem alterações funcionais de negociação.

---

## 2026-10-20 — Front v10.7.32 (botao Reconciliar Live)

Adicionado controle Reconciliar nas telas Portfolio Live e Trader Live. Um clique consulta a API read-only e mostra o resultado; em caso de validacao positiva, exige confirmacao separada antes do POST de metadata.

Verifica e exibe a operacao MAN -> CAPR, quantidade, numero de vendas/compras e sessao. Indica quando Paused/Stopped e exigido, quando ja conciliado, ou quando faltam comprovantes; sem executar compra, venda ou cancelamento de ordens.

O backend versionado associado e API v10.8.121, branch fix/v10.8.121-live-manual-reconcile. Implantar a API antes do Front para evitar erro 404. Paper permanece intocado.

Branches e versoes independentes: feature/v10.7.32-live-reconcile-button e API v10.8.121.

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
