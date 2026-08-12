# Market Cycle Trader Frontend v1.12.108 — Model Research Challengers

## Scope

This release adds an Administrator-only research-model selector to the Backtest workspace.

Available execution choices:

- XGBoost Utility — baseline
- LightGBM Utility — challenger
- IQN — challenger

The selector contains model identity only. No strategy parameters, model hyperparameters, thresholds, features, seeds, protected settings or internal configuration are embedded in the frontend.

## Safety boundary

- Viewer and Trader behavior remains unchanged; their Backtest action continues to start the protected XGBoost baseline.
- Only Administrators can start LightGBM or IQN challenger jobs.
- Selecting a challenger does not edit, clone, certify or promote a Strategy.
- Trader Winner selection remains unchanged and server-side.
- Administrator Backtest history shows the sanitized model label so runs can be compared without exposing protected configuration; Viewer/Trader history remains model-neutral.

## API compatibility

Requires Market Cycle Trader API v1.13.39 for LightGBM/IQN execution. The XGBoost baseline remains compatible through the existing `/api/jobs` contract.
