# Frontend v1.12.79 — Interactive Portfolio zoom

## Scope

Frontend-only Portfolio usability release. The API remains `v1.13.25`. No strategy logic, model configuration, scheduler decision, broker order flow, API contract, or database schema is changed.

## Portfolio Evolution zoom

- Mouse wheel over the Portfolio Evolution chart now controls time-window zoom.
- Wheel up zooms in; wheel down zooms out.
- Zoom is centered around the horizontal position of the mouse pointer, so the user can focus on a specific trade or period without losing context.
- The minimum zoom window is bounded using the observed history cadence and a minimum point count so the chart cannot collapse into an unusable single-point view.
- The Y axis is recalculated from the visible portfolio values, making small changes in the selected period easier to inspect.
- Executed Buy/Sell markers remain attached to their actual portfolio-history points and continue to show execution details through the existing tooltip.
- A compact zoom indicator appears in the chart header. While zoom is active, `Reset zoom` restores the complete history immediately.
- The chart captures wheel scrolling only while the pointer is over the chart; page scrolling remains unchanged elsewhere.
- Automatic portfolio refresh preserves an active zoom window when that period still exists. When no zoom is active, new history automatically expands the full view.

## Existing marker invariant retained

`Recent Paper Orders = 0` implies `Buy/Sell markers = 0`.

## Version

Frontend badge: `v1.12.79`

Backend remains: `v1.13.25`
