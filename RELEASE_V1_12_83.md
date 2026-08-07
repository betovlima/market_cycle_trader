# Market Cycle Trader Frontend v1.12.83

## Backtest interactive chart and inline hints

This frontend-only release keeps API v1.13.26 unchanged.

### Changes

- Backtest metric help (`?`) is kept on the same line as its label.
- Simulation Comparison supports pointer-centered mouse-wheel zoom.
- After zooming, hold the left mouse button and drag to pan through time.
- The chart cursor uses `grab` and switches to `grabbing` while panning.
- BUY and SELL markers are derived only from the existing sanitized capital-rotation analytics payload.
- BUY markers use the positive/green visual token and SELL markers use the negative/red token.
- Trade markers have a larger invisible hit target and use the `pointer` cursor when approached.
- Panning does not start when the pointer is on a trade marker.
- The trade tooltip identifies the executed side/asset, rotation, execution time, realized result/fees when available, plus simulation and reference equity.
- Reset zoom restores the complete test period.
- Y-axis range is recalculated from the currently visible simulation/reference window.

### Strategy boundary

No strategy parameters, scores, predictions, thresholds, feature names, hyperparameters, or private BUY/HOLD/SELL decision stream are exposed by this release. The markers reflect completed sanitized capital rotations already available to the authenticated Backtest analytics screen.
