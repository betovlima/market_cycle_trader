# Frontend MCT | Etapa 2 de integração Alpaca OAuth à Winner

**Data:** 03/11/2026. **Branch de trabalho:** `feature/alpaca-oauth-winner-trading-v1` · [PR draft #43](https://github.com/betovlima/market_cycle_trader/pull/43). **Base:** `main`, versão `10.7.50`. **Branch da API:** `feature/alpaca-oauth-winner-trading-v1`, base `10.8.133`. **Estado:** experimental, sem merge na `main` ou tag de release.

## Regra operacional: uma única Winner, contas Alpaca individuais

Todos os usuários usarão a **mesma estratégia Winner**, os mesmos parâmetros e o mesmo sinal de mercado quando sua separação da posição atual estiver concluída. A conta OAuth define apenas de quem são os recursos e as ordens, não qual Winner utilizar.

O patrimônio, caixa, poder de compra, posição e P/L apresentados no Portfolio Live são consultados na Alpaca vinculada à sessão do usuário; não criar saldo financeiro interno no MCT, nem apresentar valores de outra conta. O MCT atual registra observações históricas do patrimônio para o gráfico/auditoria; esse histórico não substitui a corretora como fonte de saldo. A ação `buy/hold/rotate/cash` pode diferir por conta porque as posições e quantias disponíveis diferem, mesmo com o mesmo alvo Winner.

**Ambientes:** os bancos local e produção são diferentes. O Live local permanece PARADO, e a Winner de produção permanece ATIVA. Não acrescentar novas travas de operação nem usar a configuração do consentimento como controle de execução.

## Entrada por convite e autorização direta (04/11/2026)

O fluxo aprovado para novos usuários é **convite Trader → login Google → Live individual → autorização OAuth Alpaca `trading` → aguardar próximo ciclo elegível da Winner**.

- O convite já é gerado em **Administração** e identifica previamente o e-mail Google autorizado.
- Ao autenticar como `trader`, o MCT abre a aba Live individual, sem apresentar a carteira do administrador.
- Para um Trader ainda sem conexão, o botão único **Conectar e autorizar operações na Alpaca** solicita `scope=trading`, sem exigir antes a etapa de somente leitura. O titular autoriza explicitamente no site oficial da Alpaca e retorna ao MCT.
- A interface informa que a conta participará do próximo ciclo de negociação elegível. Nenhuma compra, venda ou cancelamento de ordem é disparado pelo botão ou pelo callback. A partir da autorização concedida, o scheduler Live existente poderá atuar de forma independente do navegador quando Live estiver ATIVO.
- O fluxo da conta principal do administrador permanece com leitura verificada e permissão `trading` opcional separada, sem mudar a Winner principal que executa por API Keys.
- A UI não guarda nem inventa saldos. Caixa, patrimônio, posição e ordens são consultados na Alpaca do usuário.

Este fluxo ainda está na branch experimental, sem merge ou deploy na produção. `ALPACA_OAUTH_TRADING_CONSENT_ENABLED=1` é a configuração **já existente** necessária para exibir a autorização; não é uma nova trava de execução.

## Implementação atual na branch (04/11/2026)

A aba **Live** distingue agora duas situações:

- **Administrador da conta principal:** mantém o painel Live completo e a leitura OAuth validada na etapa 1. As operações da Winner principal continuam com as API Keys já existentes.
- **Usuário com `portfolio.view` sem `admin.manage`:** a aba Live monta `AlpacaPersonalPortfolio.jsx`, com `AlpacaOAuthConnection isAdmin={false}`. O componente consulta `GET /api/alpaca-oauth/portfolio` e exibe somente o patrimônio, saldo, poder de compra, P/L, posições e ordens da Alpaca **daquele usuário**. Não utiliza `/api/live-market/portfolio` nem dados financeiros da conta principal. Sem OAuth, mostra mensagem para conectar; ao desconectar ou se a leitura falhar, limpa os valores anteriores.
- **Uma única Winner:** a decisão D−1 da conta principal é reutilizada como sinal canônico para todas as contas. A posição e o caixa usados para converter o alvo em ordem pertencem à Alpaca de cada usuário. A estratégia/modelo não é duplicada.
- **Controle operacional:** o OAuth `trading` é uma permissão da corretora, e **o modo Live existente** determina se o agendador pode enviar ordens para contas diferentes da principal. Portanto, ao conceder essa autorização em um MCT cujo Live já está ATIVO, essa conta poderá participar das operações reais, sem precisar de um segundo botão de ativação. A interface de confirmação avisa isso. No ambiente local o Live permanece PARADO.
- O endpoint **Verificar vínculo OAuth com a Winner** é somente leitura e **não envia ordens**. O botão `Autorizar permissão de negociação` é para consentimento da Alpaca; a configuração `ALPACA_OAUTH_TRADING_CONSENT_ENABLED` controla apenas a exibição/início desse consentimento.
- Nenhuma soma de saldos de usuários é feita no frontend; não existe capital operacional próprio do MCT. O histórico registrado anteriormente para auditoria da conta administrativa não é saldo de negociação.

**Status:** alterações apenas na `feature/alpaca-oauth-winner-trading-v1`; PR draft #43 do frontend e #90 da API; ainda sem merge, tag nova ou publicação no Railway. Testes com mocks e build não substituem homologação de operação real.

---

## O que a tela permite

Em **Live → Conexão OAuth com a Alpaca**, a conexão de leitura atual permanece como antes. O botão adicional **Autorizar permissão de negociação** só aparece quando a API retorna `trading_consent_available=true` e há uma conta Live já vinculada e ainda sem escopo de negociação.

A interface pede confirmação antes de encaminhar o navegador para o consentimento oficial da Alpaca (`scope=trading`). A API controla o callback, o estado de dez minutos, a cifragem do token e a associação com a sessão do administrador do MCT.

Quando a Alpaca concede a autorização, o painel distingue o **escopo autorizado** do **estado operacional da Winner**: a permissão permite operar quando o modo Live existente está ATIVO e a conta não é a principal. Na configuração local com Live PARADO, a execução continua desativada. O usuário pode clicar em **Verificar vínculo OAuth com a Winner** para consultar o novo endpoint read-only `GET /api/alpaca-oauth/winner/readiness`, que identifica a conta Alpaca e a **Winner compartilhada** sem inferir um sinal particular por usuário nem enviar ordens. A tela identifica o nome da Winner global, quando disponível.

## Segurança e limites

- Nenhum token, Client Secret ou ID integral da conta aparece na tela.
- O botão e o fluxo de `trading` ficam invisíveis quando `ALPACA_OAUTH_TRADING_CONSENT_ENABLED` não é `1` no backend.
- A conexão de leitura, o Portfolio Live e a exportação já existentes continuam funcionando.
- Nenhum botão permite iniciar, cancelar ou modificar ordens por OAuth nesta versão.
- O Live completo de auditoria administrativa permanece restrito ao administrador; usuários com `portfolio.view` passam a visualizar exclusivamente sua carteira Alpaca OAuth pela tela pessoal.
- Sem alterações em Paper, TCC, indicadores, treinamento, ordens ou controles operacionais.
- A branch já reutiliza um **sinal Winner canônico da conta principal** e distribui operações pelas contas OAuth com valores da Alpaca e ledger por conta. Os testes de homologação ainda são necessários antes da publicação. Não duplicar estratégia, parâmetros ou treinamento por usuário. Ver a especificação na API em `docs/changes/alpaca-oauth-winner-trading-stage2.md`.

## Testes

Build com `pnpm build` e teste de regressão `frontend-build`. A API inclui testes específicos de consentimento e pré-validação em `tests/test_alpaca_oauth_winner_consent.py`. Não confundir testes unitários com autorização efetiva concedida pela Alpaca.

**Rastreabilidade:** branch `feature/alpaca-oauth-winner-trading-v1` de cada repositório. Versões base: frontend `v10.7.50`, API `v10.8.133`. **Sem novas tags ou alteração da `main` nesta fase.**
