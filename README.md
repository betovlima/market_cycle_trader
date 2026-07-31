# market_cycle_trader

React + Vite frontend for Market Cycle Trader v1.10.3.

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
- `features/backtest/model` — current defaults and presets.
- `shared/components` — reusable presentation components.
- `api` — HTTP helper.
- `config` — environment configuration.
- `App.jsx` — composition root.

Legacy bottom/top/Fibonacci controls and configuration were removed.

## Railway

Use root directory `/market_cycle_trader` and config path `/market_cycle_trader/railway.toml`.

Set at build time:

```text
VITE_API_BASE_URL=https://<public-api-domain>
```
