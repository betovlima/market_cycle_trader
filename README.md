# Market Cycle Trader Frontend v1.12.30

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


## v1.12.30

- Restores an active queued or running backtest after a browser refresh.
- Keeps every Start Backtest button disabled while the server reports an active execution.
- Rechecks the latest server job immediately before creating a new backtest.
- Automatically returns to the Backtest area when an active execution is recovered.
- Restores polling, progress, stage, counters and the public execution log.
- Loads the sanitized results and performance chart automatically when execution completes.
- Keeps the compact dashboard layout and removes no existing behavior.
