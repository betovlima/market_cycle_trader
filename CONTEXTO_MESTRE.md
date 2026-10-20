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
