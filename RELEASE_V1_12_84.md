# Market Cycle Trader Frontend v1.12.84

## Analytics workspace redesign

- Unifies Backtest Analytics and Portfolio Analytics under the same compact single-workspace visual language used by Portfolio, System Settings and Backtest.
- Keeps the API at v1.13.26 with no endpoint or schema change.
- Replaces independent metric cards with compact metric strips and inline contextual hints.
- Consolidates Backtest performance charts into one internal performance region.
- Consolidates asset attribution and rotation quality into one switchable Trade Analysis region to reduce vertical scrolling.
- Adds column sorting and pagination to asset attribution and rotation tables.
- Consolidates holding-period, robustness and drawdown diagnostics into one resilience region.
- Reshapes Portfolio Analytics so portfolio history remains dominant while drawdown, current position and execution quality share the same workspace.
- Adds search, BUY/SELL filters, status filtering, per-column sorting and pagination to Paper orders.
- Does not add a HOLD filter because Paper order records only represent actual BUY/SELL order activity; HOLD is not an order row in the existing analytics contract.
- No strategy logic, model parameters, predictions, thresholds or private execution decisions are exposed.
