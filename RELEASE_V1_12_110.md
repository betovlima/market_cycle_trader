# Frontend v1.12.110 — Model Parameters inside Selected Strategy

- Moves the model-parameter selector into the `SELECTED STRATEGY` editor.
- Removes the separate Model Research settings section from the System Settings page.
- XGBoost, LightGBM and IQN each display their own independent parameter profile.
- Strategy/experiment fields remain separate from model-owned hyperparameters.
- The UI continues to render model fields dynamically from the Administrator API; no model defaults are hard-coded in React.
- Requires Market Cycle Trader API v1.13.41.
