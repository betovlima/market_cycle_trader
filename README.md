# Market Cycle Trader Frontend v1.12.45

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
GET  /api/admin/invitations                 # Administrator only
```

## Local execution

Set `VITE_API_BASE_URL` in the process environment and run:

```bash
pnpm install
pnpm dev
```

## v1.12.45

- Adds a dedicated Analytics area with Backtest and Portfolio dashboards.
- Adds the temporary `Trader` role.
- Makes all sanitized Backtest analytics and capital rotations available to Viewer, Trader and Administrator sessions.
- Keeps Portfolio and Portfolio Analytics restricted to Trader and Administrator sessions.
- Keeps Administration restricted to the Administrator.
- Adds role selection when generating a temporary access link.
- Requires Market Cycle Trader API v1.13.10 or newer.
