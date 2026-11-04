# Frontend MCT | Etapa 2 de integração Alpaca OAuth à Winner

**Data:** 03/11/2026. **Branch de trabalho:** `feature/alpaca-oauth-winner-trading-v1` · [PR draft #43](https://github.com/betovlima/market_cycle_trader/pull/43). **Base:** `main`, versão `10.7.50`. **Branch da API:** `feature/alpaca-oauth-winner-trading-v1`, base `10.8.133`. **Estado:** experimental, sem merge na `main` ou tag de release.

## Regra operacional: uma única Winner, contas Alpaca individuais

Todos os usuários usarão a **mesma estratégia Winner**, os mesmos parâmetros e o mesmo sinal de mercado quando sua separação da posição atual estiver concluída. A conta OAuth define apenas de quem são os recursos e as ordens, não qual Winner utilizar.

O patrimônio, caixa, poder de compra, posição e P/L apresentados no Portfolio Live são consultados na Alpaca vinculada à sessão do usuário; não criar saldo financeiro interno no MCT, nem apresentar valores de outra conta. O MCT atual registra observações históricas do patrimônio para o gráfico/auditoria; esse histórico não substitui a corretora como fonte de saldo. A ação `buy/hold/rotate/cash` pode diferir por conta porque as posições e quantias disponíveis diferem, mesmo com o mesmo alvo Winner.

**Ambientes:** os bancos local e produção são diferentes. O Live local permanece PARADO, e a Winner de produção permanece ATIVA. Não acrescentar novas travas de operação nem usar a configuração do consentimento como controle de execução.

## O que a tela permite

Em **Live → Conexão OAuth com a Alpaca**, a conexão de leitura atual permanece como antes. O botão adicional **Autorizar permissão de negociação** só aparece quando a API retorna `trading_consent_available=true` e há uma conta Live já vinculada e ainda sem escopo de negociação.

A interface pede confirmação antes de encaminhar o navegador para o consentimento oficial da Alpaca (`scope=trading`). A API controla o callback, o estado de dez minutos, a cifragem do token e a associação com a sessão do administrador do MCT.

Quando a Alpaca concede a autorização, o painel distingue claramente o **escopo autorizado** do **estado operacional da Winner**: a permissão pode ter sido concedida, mas **a execução de ordens OAuth permanece desativada**. O usuário pode clicar em **Verificar vínculo OAuth com a Winner** para consultar o novo endpoint read-only `GET /api/alpaca-oauth/winner/readiness`, que identifica a conta Alpaca e a **Winner compartilhada** sem inferir um sinal particular por usuário nem enviar ordens. A tela identifica o nome da Winner global, quando disponível.

## Segurança e limites

- Nenhum token, Client Secret ou ID integral da conta aparece na tela.
- O botão e o fluxo de `trading` ficam invisíveis quando `ALPACA_OAUTH_TRADING_CONSENT_ENABLED` não é `1` no backend.
- A conexão de leitura, o Portfolio Live e a exportação já existentes continuam funcionando.
- Nenhum botão permite iniciar, cancelar ou modificar ordens por OAuth nesta versão.
- O Live segue visível apenas para o administrador. **A Winner não foi migrada para operação multiusuário.**
- Sem alterações em Paper, TCC, indicadores, treinamento, ordens ou controles operacionais.
- A próxima etapa exige **um sinal de Winner compartilhado**, com ações, quantidade, sessões de execução e ledger separados por conta Alpaca; não duplicar estratégia, parâmetros nem treinamento por usuário. Ver a especificação na API em `docs/changes/alpaca-oauth-winner-trading-stage2.md`.

## Testes

Build com `pnpm build` e teste de regressão `frontend-build`. A API inclui testes específicos de consentimento e pré-validação em `tests/test_alpaca_oauth_winner_consent.py`. Não confundir testes unitários com autorização efetiva concedida pela Alpaca.

**Rastreabilidade:** branch `feature/alpaca-oauth-winner-trading-v1` de cada repositório. Versões base: frontend `v10.7.50`, API `v10.8.133`. **Sem novas tags ou alteração da `main` nesta fase.**
