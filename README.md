# Market Cycle Trader Frontend v1.12.49

React + Vite frontend for protected historical simulations and Paper portfolio monitoring.

## Navigation and roles

| Area | Viewer | Trader | Administrator |
|---|---:|---:|---:|
| Dashboard | Yes | Yes | Yes |
| Backtest and Run Backtest | Yes | Yes | Yes |
| Backtest Analytics | Yes | Yes | Yes |
| Portfolio | No | Yes | Yes |
| Portfolio Analytics | No | Yes | Yes |
| Administration | No | No | Yes |

Temporary access links can be created as `viewer` or `trader`. Existing links without a stored role remain `viewer`.

## Analytical dashboards

### Backtest Analytics

- capital curve against the reference;
- drawdown through time and largest drawdown episodes;
- monthly consistency;
- attribution of realized result by asset;
- origin-to-destination rotation matrix;
- performance by holding-period range;
- dependence on the best closed positions;
- sanitized rotation history.

### Portfolio Analytics

- Paper portfolio value and drawdown history;
- current value, cash, exposure, realized and unrealized P/L;
- 1-day, 7-day and 30-day returns from stored snapshots;
- order fill and rejection statistics;
- current position and recent Paper executions;
- controlled connection status when Alpaca is unavailable.

The frontend receives execution results and analytical aggregates only. Model scores, seeds, rules, protected configuration and strategy parameters remain server-side.

## API contracts

```http
GET  /api/health
GET  /api/dashboard/summary?limit=12
GET  /api/dashboard/jobs/{job_id}
POST /api/jobs
GET  /api/jobs/{job_id}
GET  /api/analytics/backtests?limit=200
GET  /api/analytics/backtests/{job_id}
GET  /api/analytics/portfolio               # Trader or Administrator
GET  /api/paper-market/public-portfolio     # Trader or Administrator
GET  /api/paper-market/public-robot-status  # Trader or Administrator
GET  /api/admin/invitations                 # Administrator only
```

## Local execution

Set `VITE_API_BASE_URL` in the process environment and run:

```bash
pnpm install
pnpm dev
```

## v1.12.47

- Adds a visible Paper Market connection indicator at the top of Portfolio.
- Shows connected, checking and unavailable states independently from market open or closed.
- Confirms the last successful connection check and keeps the market clock visible.
- Marks the connection unavailable when a refresh fails, including silent background checks.
- Uses the existing sanitized Portfolio response.
- Requires Market Cycle Trader API v1.13.10 or newer.

## v1.12.46

- Places Realized Result by Asset above Rotation Quality as two full-width horizontal tables.
- Adds compact icon filters for all, profitable and losing results.
- Adds asset and transition search fields without changing the API contract.
- Adds ascending and descending realized P/L sorting.
- Adds client-side pagination to Rotation Quality with eight transitions per page.
- Preserves Viewer access to Backtest Analytics and the existing role protections.
- Requires Market Cycle Trader API v1.13.10 or newer.

## v1.12.45

- Adds a dedicated Analytics area with Backtest and Portfolio dashboards.
- Adds the temporary `Trader` role.
- Makes all sanitized Backtest analytics and capital rotations available to Viewer, Trader and Administrator sessions.
- Keeps Portfolio and Portfolio Analytics restricted to Trader and Administrator sessions.
- Keeps Administration restricted to the Administrator.
- Adds role selection when generating a temporary access link.
- Requires Market Cycle Trader API v1.13.10 or newer.

### v1.12.46 final — Holding-period table fit

- Removes the unnecessary horizontal scrollbar from the Holding Period table.
- Uses a dedicated fixed-layout table that fits the available analytical panel width.
- Preserves the responsive layout and all v1.12.46 filters and pagination.



## v1.12.48 — continuous Paper robot status

- Portfolio now displays the Paper-account connection and the continuous trading robot as separate health indicators.
- The robot indicator polls the sanitized status every 30 seconds.
- It shows active/stopped/degraded/review-required state, current phase, next regular market open and scheduler heartbeat.
- Starting and stopping remain protected administrator operations performed through the API documentation.
- Requires Market Cycle Trader API v1.13.11 or newer.

## v1.12.49 — Portfolio market status card

- Adds Market Status as the first Portfolio metric card.
- Shows Open, Closed or Checking with a dedicated icon and status color.
- Shows the next regular open while closed and the next close while open.
- Reuses the sanitized Alpaca market clock already returned by the Portfolio endpoint.
- Keeps all strategy configuration and protected execution details server-side.

