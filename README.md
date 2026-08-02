# market_cycle_trader

React + Vite frontend for Market Cycle Trader v1.12.22.

## Local

```powershell
.\run_local.ps1
```

Alternative:

```powershell
npm install
npm run dev
```

During local development Vite proxies `/api` to `http://127.0.0.1:8000`.

## Structure

- `features/backtest/components` — active Compound Capital Rotation UI.
- `features/backtest/hooks` — workspace orchestration.
- `shared/components` — reusable presentation components.
- `api` — HTTP helper.
- `config` — environment configuration.
- `App.jsx` — composition root.

The public form contains only the start and end dates. Strategy parameters are not bundled into the frontend.

## Railway

Use root directory `/market_cycle_trader` and config path `/market_cycle_trader/railway.toml`.

Set at build time:

```text
VITE_API_BASE_URL=https://<public-api-domain>
```

## v1.12.22

- Fixes the full-results export URL when the API is hosted on a separate Railway domain.
- Keeps the Portfolio dashboard mounted while switching tabs.
- Aligns automatic portfolio queries to the next whole hour and preserves that schedule across reloads.
- Renames the Alpaca portfolio tab to Portfolio.
