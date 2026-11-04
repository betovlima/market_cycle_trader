# Front v10.7.52 — Posição atual e rentabilidade acumulada Live

A posição atual permanece no cartão de CAPR, mas o percentual passa a ter o rótulo **Rentabilidade da posição atual (não realizada)**, explicitando que corresponde ao preço médio de entrada da posição atualmente mantida na Alpaca. Não representa o histórico de toda a Winner.

No painel superior Live, o campo anteriormente **P/L Total**, sem valor verificado no Live, é substituído por **Rentabilidade acumulada no Live**, consultando `winner_performance.return_pct` e `winner_performance.profit_loss` da API. Para Trader, a carteira Alpaca individual mostra o mesmo indicador e o retorno percentual de cada posição aberta.

A rentabilidade acumulada é **da conta Alpaca no período em que opera com a Winner**. Inclui eventuais operações manuais. A Alpaca calcula o P/L histórico considerando o seu próprio histórico de fluxos de caixa; **nenhum capital financeiro é armazenado no MCT**. A consulta é apenas de leitura.

Se não houver base histórica verificável, exibir `—` e mensagem explicativa, nunca 0%. Se o histórico começou no primeiro fechamento disponível, sinalizar **Histórico parcial da Alpaca** e não afirmar que cobre o dia inicial. As datas de início e o valor do resultado em US$ aparecem no detalhe.

Admin preserva todos os painéis; Trader somente Live. Sem mudança em OAuth, Winner compartilhada, regras de negociação ou ativação.
