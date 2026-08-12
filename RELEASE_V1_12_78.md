# Frontend v1.12.78 — Correct Portfolio trade markers

## Scope

This is a frontend-only corrective release for Portfolio trade markers. The API remains `v1.13.25`. No backend contract, trading logic, strategy parameter, model configuration, scheduler decision, broker order flow, or database schema is changed.

## Fix

- Removes the two standalone `Scatter` series that could inherit the parent `ComposedChart` history dataset and render ordinary portfolio snapshots as red Sell markers.
- Trade markers are now attached directly to the corresponding portfolio-history point through a `tradeEvents` array.
- The main Portfolio line uses a custom dot that returns nothing unless that exact history point contains one or more executed Paper orders.
- If `recent_orders` is empty, the graph renders no Buy/Sell execution markers.
- Only Buy/Sell orders with execution evidence (`filled`, positive filled quantity, or filled average price) can create markers.
- Multiple executions mapped to the same history snapshot are stacked instead of overwriting one another.
- Hovering the mapped point shows execution side, asset, execution time, quantity, average fill, and the portfolio value at that history snapshot.

## Expected invariant

`Recent Paper Orders = 0` implies `Buy/Sell markers = 0`.

## Version

Frontend badge: `v1.12.78`

Backend remains: `v1.13.25`
