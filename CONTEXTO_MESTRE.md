## 2026-10-25 — Front v10.7.46 | Help contextual na Reprodução Anual

O botão (?) em "Cinco maiores utilidades estimadas" abre diálogo quadrado centralizado e acessível por teclado, com explicação de utilidade observada, previsão LightGBM e rotação. O exemplo usa os registros históricos de decisão; backtests sem pontuações mostram exemplo explicitamente didático, sem reconstruir previsões ou contribuições das árvores. Explicações de Control referem-se à política de referência; estratégias podem diferir. Não houve alteração na API, política, dados, Alpaca, MongoDB ou operações. Arquivo: `docs/changes/v10.7.46-annual-replay-selection-help.md`. Branch `feature/v10.7.46-annual-replay-selection-help`.

---

## 2026-10-25 — Front v10.7.45 | Capital final do Backtest na Reprodução Anual

Novo box no cabeçalho da Reprodução Anual com `metrics.ending_capital` do Backtest selecionado, abaixo do selo de histórico e acima do título. A métrica provém do mesmo resumo persistido exibido na tela Backtest, permanecendo fixa quando o usuário muda de ano ou pregão. O gráfico continua mostrando capital até o pregão animado. Quando a métrica falta, mostra `—` sem estimativa ou substituição por equity; tradução PT/ES e teste de contrato. Não alteramos API, acesso do professor, modelos, backtests, Alpaca nem operações. Branch `feature/v10.7.45-replay-backtest-final-capital`; docs `docs/changes/v10.7.45-backtest-final-capital-replay.md`.

---

## 2026-10-25 — Front v10.7.44 | Acesso do professor e navegação

Reprodução Anual com comandos explícitos para última rotação e último pregão; no exemplo 20/10/2026 é a última rotação, com 3 pregões restantes até 23/10/2026. Perfil de professor com shell de navegação exclusivo e formulário de convite por Google em Administração. Retirados aviso interpretativo e texto de fonte do rodapé da Reprodução Anual. Sem mudança de backtest ou operações. Depende da API v10.8.130. Docs `docs/changes/v10.7.44-professor-replay-and-final-navigation.md`.

---

## 2026-10-25 — Front v10.7.43 | ranking e margem históricos na aba Annual Replay

Ranking até cinco ativos só com diagnósticos reais de `decision_scores[]` (API v10.8.128); mostrar ranking parcial dos legados como 3/5, sem fabricar dados. Informações de vantagem, margem e motivo de manter/trocar quando disponíveis; layouts, permissões e operações de Live/Paper preservados. Branch `feature/v10.7.43-backtest-replay-utility-scores`, documentação `docs/changes/v10.7.43-backtest-replay-utility-scores.md`. CI + PR antes de merge.

---

## 2026-10-25 — Front v10.7.42 | paridade visual da reprodução anual

A aba Annual Replay foi reorganizada com a mesma hierarquia do exemplo HTML de 2025: quatro métricas, player e progresso, painel de avaliação de ativos (escores apenas quando gravados), gráfico de capital com meses clicáveis e lista de rotações com navegação por pregão. Testes estendidos para `decision_scores[]` explicitamente fornecidos, sem fabricar previsões ou justificativas de permanência. Nenhuma mudança na API/Alpaca/MongoDB/estratégia, sem ordens. Branch `feature/v10.7.42-annual-replay-visual-parity`; `docs/changes/v10.7.42-annual-replay-visual-parity.md`; main só via PR + CI.

---

## 2026-10-24 — Front v10.7.41 | aba de reprodução anual de Backtest

Nova aba `Annual Replay` para visualizar, sem recalcular operações, um ano de qualquer Backtest concluído disponível em Analytics. Usa somente os endpoints GET existentes de histórico, com seletor de ano, play/pause, velocidades, navegação por pregão, salto para rotação e curva do capital. Os dados de escore diário não são oferecidos pelos endpoints atuais e permanecem **indisponíveis**; nunca inventar valores. Sem Alpaca, Mongo writes ou ordens reais/Paper. Permissão `backtest.view`; API e main não alteradas. Versão Front v10.7.41, branch `feature/v10.7.41-annual-backtest-replay`, documento `docs/changes/v10.7.41-annual-backtest-replay.md`; validar testes Node + build/CI antes de merge e implantação.

---

## 2026-10-23 — Front v10.7.40 | Live e Trading em abas independentes

**Solicitação:** mover as telas Live e Trading para a navegação principal e remover a aba Portfólio. **Implementação:** `src/App.jsx` define duas rotas visuais `live` e `trading`; `src/features/backtest/components/AppHeader.jsx` apresenta as abas Live e Trading (Paper); `src/features/paperPortfolio/PaperPortfolioDashboard.jsx` deixa de gerenciar subabas e recebe `market` diretamente. Títulos agora identificam o ambiente ativo. Estilos da subaba antiga removidos. Sem alterar API, banco, dados, critérios de negociação, ordens, autenticação ou credenciais.

**Segurança:** Live continua condicionado simultaneamente a `portfolio.view` e `admin.manage`, incluindo verificação em menu, roteador e guarda interna da página. Trading (Paper) exige `portfolio.view`. Endpoints `/api/live-market/*` e `/api/paper-market/*` continuam isolados. O frontend mantém renderização condicional, desmontando um ambiente ao alternar ao outro. Não confundir navegação separada com mudança em infraestrutura de segurança ou permissões na API.

**Versão:** Front v10.7.40, branch `feature/v10.7.40-live-trading-top-tabs` a partir da `main`, protegida sem alteração. **Testes:** renderização SSR dos estados de carga e permissão Live, navegação por capacidades e checagens de não regressão; `pnpm build` deve passar em CI antes de qualquer merge. **Manual de mudança:** `docs/changes/v10.7.40-live-trading-top-tabs.md`. PR mantido em Draft até validação, sem promoção automática.

---

## 2026-10-22 — Front v10.7.39 | operação CAPR manual exibida sem atribuição ao robô

**Contexto:** CAPR foi adquirido manualmente na Alpaca em 20/10/2026. O dashboard já mostra posição Live e proveniência `manual_alpaca_fills`, mas não mostrava a última sessão de negociação registrada.

**Alteração:** painel CurrentPosition passa a exibir `last_execution_session` e tradução de `last_execution_origin`, exclusivamente para Live e quando a API v10.8.127 entrega informação validada. Origem não comprovada permanece sem atribuição; a decisão Winner continua independente. Traduções PT/ES e teste de apresentação adicionados. Sem ações financeiras nem integração Paper.

**Rastreabilidade:** branch `audit/v10.7.39-live-winner-observability`, PR #26; dependência de API v10.8.127 (PR #79). Validar build e regressões CI; merge não significa deploy.

---

## 2026-10-22 — Front v10.7.38 | proveniência de ordens Live e risco operacional

A API v10.8.126 distingue ordens comprovadamente manuais, ordens de executor MCT verificadas no ledger e ordens externas de origem desconhecida. O Front traduz e exibe a origem factual no histórico de operações Live. Decisões HOLD concluídas aparecem como "sem ordens", em vez de "execução na corretora"; a decisão diária continua separada da ação efetiva. O fallback Live de justificativa agora menciona sinal D−1, e não Paper. O chip "Ordens reais autorizadas" passa de vermelho de indisponibilidade para âmbar de risco autorizado.

Sem alterações na lógica de execução, permissões, API, banco, modelo, layout base 10.7.37, isolamento Paper/Live ou tempos indisponíveis. Testes adicionais de proveniência + SSR/CI/Vite; merge somente com CI verde. Branch `fix/v10.7.38-live-provenance-audit`.

---

## 2026-10-22 — Front v10.7.37 | paridade visual Portfólio Live e Trading

**Motivação:** o Live da v10.7.36 colocava Posição/Decisão antes do resumo e da faixa da sessão. No Trading, o resumo e a faixa da sessão estavam corretamente acima do corpo. As duas telas compartilhavam os mesmos componentes e classes CSS, mas o JSX usava renderização condicional para alterar a ordem somente no Live.

**Correção:** remover a renderização antecipada e condicional de `portfolioPositionDecision` e utilizar um único ponto de montagem abaixo de `PortfolioMetricsStrip` e de `LiveSessionStrip`/`TradingSessionStrip`, ambos imediatamente depois do cabeçalho (preservando o monitor Paper existente). As duas telas passam a seguir o fluxo: cabeçalho → métricas → sessão → posição/decisão → excursão, gráficos, ranking e operações. Não foram criados grids, espaçamentos ou CSS especiais para Live: mantidos os mesmos estilos e regras responsivas usados pelo Trading.

**Proteções:** manter os dados do Live exclusivamente em `/api/live-market/*`; conservar estados e rótulos próprios do Live, incluindo controles/indicadores de autorização de ordens reais. Preservar os valores financeiros indisponíveis como `—`, os timers somente quando explícitos, a correção SSR de `data=null` e os monitores Live no final. Sem alterações na API v10.8.125, serviços de broker, ordens, modelos ou banco.

**Testes:** regressão `tests/portfolio-layout-order.test.mjs`, SSR inicial, modelo da faixa Live e `pnpm build`, executados no workflow `frontend-build`. Branch `fix/v10.7.37-live-layout-trading-parity` preparada desde main v10.7.36; integração via PR e CI. O merge pode gerar um deploy via integração GitHub/Railway, mas não equivale à confirmação de implantação.

---

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
