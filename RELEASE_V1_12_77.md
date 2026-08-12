# Frontend v1.12.77 — Single-box Portfolio workspace and trade markers

## Scope

This release is a frontend-only Portfolio layout refinement. The API remains `v1.13.25` and no backend contract, trading logic, model configuration, strategy parameter, scheduler decision, broker order flow, or database schema is changed.

## Portfolio layout

- Consolidates the loaded Portfolio screen into one main workspace box.
- Moves the Portfolio title, last-update timestamp, and Refresh action into the workspace header.
- Compresses Starting Capital, Portfolio Value, Total P/L, Cash, and Position into one summary strip.
- Compresses Alpaca connection, robot status, market status, Analysis, Execution, Daily Close, and Portfolio Update into a thin session strip.
- Gives the Portfolio Evolution chart the dominant width of the primary row.
- Keeps Current Position beside the chart on desktop and directly below it on smaller screens.
- Places Recent Paper Orders inside the same workspace, immediately below the chart/position row, with a compact scroll area so it remains visible earlier in the viewport.

## Executed-trade markers

The Portfolio Evolution chart now derives visual execution markers from the already-sanitized `recent_orders` and `history` fields returned by `/api/paper-market/public-portfolio`.

- Buy executions use a green marker.
- Sell executions use a red marker.
- Markers are positioned on the nearest portfolio-history snapshot to the order execution timestamp.
- Hovering a trade marker shows only execution information already authorized for the Portfolio screen: side, asset, execution time, quantity, average fill, and portfolio value at the mapped snapshot.
- Hovering the portfolio line continues to show portfolio timestamp and value.
- No strategy rules, features, thresholds, predictions, model parameters, seeds, or protected decision metadata are exposed.

## Version

Frontend badge: `v1.12.77`

Backend remains: `v1.13.25`
