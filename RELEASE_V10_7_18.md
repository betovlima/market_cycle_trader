# Front v10.7.18 — current-session intraday Trader plan

## Change

The Manual Recovery panel now reflects the v10.8.89 same-session semantics.

- **Reanalyze Winner now** prepares a plan from completed daily history plus
  the currently open market session.
- **Execute current plan on Alpaca** is the explicit Paper-order action.
- A prepared intraday plan shows its current session, analysis timestamp,
  live feed and live timeframe.
- The response from the prepare call updates the local panel state immediately.
- Trader status/history refreshes use `cache: no-store` so the execution
  button does not require a browser refresh after preparation.

## Safety

The frontend still cannot submit an order from the reanalysis button.
Execution remains a separate confirmed action and is available only when the API
reports `manual_recovery.can_execute=true`.

## Compatibility

Requires API v10.8.89 for the intraday provenance fields. Older API responses
remain displayable through the existing completed-daily fallback text.

## Version

- Front: `10.7.18`
- Branch: `feature/v10.7.18-current-session-intraday-plan`
