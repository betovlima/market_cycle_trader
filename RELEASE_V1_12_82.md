# Market Cycle Trader Frontend v1.12.82

## Backtest workspace optimization

- Rebuilds the Backtest tab as one unified workspace with internal dividers instead of independent cards.
- Compacts the header, strategy context, primary metrics, performance chart and result comparison to reduce unused vertical space.
- Keeps the execution progress panel inside the same Backtest workspace when a simulation is active.
- Converts the six result metrics and four capital-rotation metrics into compact metric strips.
- Keeps Simulation Comparison and Backtest Results side by side on wide screens.

## Capital Rotations list

- Search by sold/bought asset.
- Filter by All, Profit, Loss and Flat outcomes.
- Sort by every visible column.
- Client-side pagination with 12 rows per page.
- Column hints explain sold/bought semantics, holding period, return, realized P/L and fees.

## Backtest History list

- Requests up to 50 recent jobs using the existing dashboard summary API contract.
- Search by test name.
- Filter by All, Completed, Failed and Interrupted status.
- Sort by every visible column.
- Client-side pagination with 10 rows per page.
- Column hints explain each displayed field.

## Contextual hints

- Adds descriptive hints to the main result metrics, result-comparison metrics, rotation summary and sortable table headers.
- Uses the existing portal-based hint component from v1.12.81, so hints are not clipped by compact panels or table containers.

## Scope and safety

- Frontend-only release.
- API remains v1.13.26.
- No strategy parameters, model scores, feature names, thresholds or private decision rules are exposed.
- No MongoDB migration or environment-variable change is required.
