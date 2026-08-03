# Market Cycle Trader Frontend v1.12.27

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
