# Frontend v1.12.112 deployment

Deploy only after API v1.13.43. No environment-variable changes are required.

After deployment verify:
- `SELECTED STRATEGY` contains the algorithm selector and model parameters.
- Backtest contains no model selector.
- Backtest displays the model already saved with the selected Strategy.
- Starting a Backtest does not ask for or send a model override.
