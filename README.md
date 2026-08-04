# Market Cycle Trader Frontend v1.12.44

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
GET  /api/paper-market/public-portfolio  # Administrator only
GET  /api/admin/jobs/{job_id}/rotations  # Administrator only
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

## v1.12.41 — private sessions and manual Viewer links

- Adds administrator and temporary Viewer login.
- Adds an administrator-only access-control page.
- Generates one-time-display access links that can be copied and shared manually.
- Hides simulation execution controls from Viewer sessions.
- Uses HttpOnly cookies and stores no password or access token in browser storage.

## v1.12.42

- Rebuilds the Administration page with the same structured layout used by Market Cycle Monitor.
- Adds access summary cards, consistent panels, responsive forms, styled tables, status colors and a one-time access-link dialog.
- Preserves the manual temporary-link authentication flow and all API contracts from frontend v1.12.41.
- Requires Market Cycle Trader API v1.13.7 or newer.



## v1.12.44 — Administrator capital rotations

- Adds an administrator-only capital-rotation summary and detailed execution table to completed Backtest results.
- Shows rotation counts in Dashboard and Backtest history for administrators.
- Keeps Viewer access limited to Dashboard and Backtest without the detailed rotation panel.
- Displays only sanitized execution outputs: date, asset transition, holding period, return, realized P/L and fees.
- Keeps model scores, seeds, decision rules and every strategy parameter server-side.
- Requires Market Cycle Trader API v1.13.9 or newer.

## v1.12.43 — Viewer Dashboard and Backtest access

- Allows temporary Viewer sessions to open Dashboard and Backtest.
- Shows the Start Backtest controls to both Administrator and Viewer sessions.
- Keeps Portfolio and Administration visible only to the Administrator.
- Adds a defensive content guard so a Viewer cannot render restricted tabs through stale client state.
- Requires Market Cycle Trader API v1.13.8 or newer.
