# market_cycle_trader

React + Vite frontend for Market Cycle Trader v1.9.19.

## Local

```powershell
.\run_local.ps1
```

or:

```powershell
npm install
npm run dev
```

During local development Vite proxies `/api` to `http://127.0.0.1:8000`.

## Structure

- `features/backtest/components`: feature UI sections.
- `features/backtest/hooks`: stateful workspace orchestration.
- `features/backtest/model`: constants, defaults and experiment presets.
- `shared/components`: reusable presentation primitives.
- `api`: HTTP transport helper.
- `config`: environment configuration.
- `App.jsx`: composition root only.

## Railway

Use root directory `/market_cycle_trader` and config path `/market_cycle_trader/railway.toml`.

Set at build time:

```text
VITE_API_BASE_URL=https://<public-api-domain>
```
