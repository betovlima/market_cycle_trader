# Frontend v1.12.112 — Strategy-owned Backtest Model

- Keeps algorithm and model-parameter editing inside `SELECTED STRATEGY`.
- Removes algorithm choice from Backtest; the saved model is displayed read-only.
- Backtest execution uses the model already persisted with the selected Strategy.
- Shows Candidate availability only after the exact saved model has a completed Backtest.
- Requires API v1.13.43.
