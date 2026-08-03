# Market Cycle Trader Frontend v1.12.40

React + Vite frontend with a compact three-area workspace aligned with the original frontend scale:

- Dashboard
- Backtest
- Portfolio

The frontend consumes only sanitized dashboard payloads for historical summaries. Private configuration and implementation details remain exclusively on the server.

## API contracts

```http
GET  /api/health
GET  /api/dashboard/summary?limit=12
GET  /api/dashboard/jobs/{job_id}
POST /api/jobs
GET  /api/jobs/{job_id}
GET  /api/paper-market/portfolio
```

## Local execution

Set `VITE_API_BASE_URL` in the environment and run:

```bash
pnpm install
pnpm dev
```


## v1.12.34

- Restores an active queued or running backtest after a browser refresh.
- Keeps every Start Backtest button disabled while the server reports an active execution.
- Rechecks the latest server job immediately before creating a new backtest.
- Automatically returns to the Backtest area when an active execution is recovered.
- Restores polling, progress, stage, counters and the public execution log.
- Loads the sanitized results and performance chart automatically when execution completes.
- Keeps the compact dashboard layout and removes no existing behavior.


## v1.12.34 Railway logo asset fix

The application header logo is imported from `src/assets` so Vite fingerprints and bundles it during production builds. This removes the runtime dependency on the absolute `/icons/...` path used by the header.


## v1.12.40

- Replaces the animated spinner with a circular countdown clock.
- Places the market update clock as the third summary card, between Best Performance and Last Backtest.
- Preserves the existing Dashboard, Backtest and Portfolio layout and behavior.
- Keeps protected credentials out of the frontend.


## v1.12.40

Restores the complete read-only Portfolio page without placing the protected Paper Market token in the browser.
