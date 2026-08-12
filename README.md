# Market Cycle Trader Frontend v1.12.120

## v1.12.115 — Global parameter search

- `Portfolio Evolution` now includes an explicit **Measure** mode.
- First click anchors point A; second click anchors point B and automatically exits measure mode.
- The ruler shows A/B portfolio values, absolute USD difference, percentage change relative to A, and elapsed time.
- Reference lines, endpoint markers and a highlighted band keep the selected interval visible on the chart.
- Existing mouse-wheel zoom, drag-to-pan and BUY/SELL markers are preserved. Panning is temporarily disabled only while selecting A/B.
- This is a frontend-only feature; API v1.13.43 and all Paper/strategy behavior remain unchanged.


## v1.12.112 — Strategy-owned Backtest model

- The algorithm selector remains only inside `SELECTED STRATEGY`.
- Saving a model binds that algorithm and its parameter snapshot to the Strategy used for research.
- Backtest no longer offers an algorithm selector; it shows the model saved with the selected Strategy as read-only information.
- Starting a Backtest calls the generic `/api/jobs` route, and the API resolves the model exclusively from the selected Strategy.
- Candidate action becomes available only when the saved model has an exact completed Backtest for the current Strategy revision.
- Requires Market Cycle Trader API v1.13.43.

## v1.12.111 — Model-aware Candidate and Winner lifecycle

- Keeps model parameter selection inside `SELECTED STRATEGY`.
- `Mark as candidate` now certifies the latest completed run for the model currently selected in that box.
- Candidate and Trader Winner cards show the certified model identity.
- Promotion feedback identifies the model frozen into the new Winner.
- Requires Market Cycle Trader API v1.13.42.

## v1.12.110 — Model Parameters inside Selected Strategy

- Moves XGBoost / LightGBM / IQN parameter selection into the `SELECTED STRATEGY` box.
- Each model owns a complete independent hyperparameter profile, even when parameter names overlap.
- Removes the separate Model Research settings box to reduce visual ambiguity.
- Strategy and experiment parameters remain shared and separate from model-owned values.
- Requires Market Cycle Trader API v1.13.41.

## v1.12.109 — Model-specific Research Settings

- Adds Model Research inside Administrator System Settings.
- Loads the model list, profile identity, editable fields, validation metadata and current values from the authenticated API.
- LightGBM and IQN parameters are editable independently without changing Strategy or Winner.
- XGBoost is shown as Strategy-owned and read-only to preserve the exact champion baseline.
- Saves create an audited backend revision; each new challenger job freezes that revision into its execution snapshot.
- Running jobs are never mutated by settings edits.
- No LightGBM/IQN hyperparameter names or default values are embedded in the React component.
- Requires Market Cycle Trader API v1.13.40.


## v1.12.108 — LightGBM and IQN research challengers

- Adds an Administrator-only model selector to Backtest: XGBoost baseline, LightGBM challenger and IQN challenger.
- Keeps Viewer/Trader execution on the existing protected XGBoost baseline.
- Shows sanitized model identity only in the Administrator execution status/history; Viewer/Trader history remains model-neutral, and no model settings or Strategy internals are embedded in the frontend.
- Challenger selection never changes the selected Strategy, Candidate lifecycle or Trader Winner.
- Requires Market Cycle Trader API v1.13.39 for challenger execution.

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
| System Settings | No | No | Yes |

Temporary access invitations can be created as `viewer`, `trader`, or `admin`. Every new invitation is bound to an administrator-approved Google email and, after the first successful claim, to the immutable Google account subject.

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

Viewer sessions receive sanitized results only. Trader and Administrator sessions may receive authorized strategy details from protected API responses. Strategic values remain server-owned and are never hard-coded, inferred or duplicated in the frontend source.

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

Set `VITE_API_BASE_URL` and `VITE_GOOGLE_CLIENT_ID` in the process environment and run:

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

## v1.12.50 — Portfolio refresh clock and loading feedback

- Adds a live countdown to the next automatic Portfolio refresh while the Portfolio tab is open.
- Resets the countdown after manual and automatic refreshes.
- Displays an explicit loader when the Portfolio tab first requests its data.
- Shows compact loading feedback in the refresh control during manual and scheduled updates.
- Keeps API contracts, Paper automation, protected configuration and strategy data unchanged.



## v1.12.51 — pre-market robot schedule

- Shows the mandatory pre-market analysis timestamp returned by API v1.13.12.
- Clarifies that completed daily data is refreshed and the next session is prepared during the pre-market window.
- Keeps the Portfolio refresh countdown and loading feedback from v1.12.50.


## v1.12.52 — live Paper automation clocks

- Adds second-by-second clocks for the mandatory pre-market analysis, the next market open or close, and scheduler heartbeat age.
- Shows a live spinner while the API reports that training or plan preparation is running.
- Keeps the existing one-hour Portfolio refresh clock in the page header.
- Updates clocks only while the Portfolio tab is mounted.
- Uses only sanitized operational timestamps returned by API v1.13.12 and does not expose model configuration or strategy rules.


## v1.12.53 — standardized strategy schedule

- Moves Live schedule above Paper Market status.
- Uses the same outer visual language as the Paper Market status block.
- Replaces generic automation indicators with strategy-cycle countdowns only.
- Standardizes all schedule counters with the circular timer layout.
- Keeps Portfolio refresh timing and loading behavior unchanged.


## v1.12.54 — unified operational schedule

- Removes the long explanatory sentence from Live schedule.
- Uses the generic title `Operational timers`.
- Keeps Analysis, Execution and Daily close inside one schedule section.
- Adds a short purpose description beside each circular countdown.
- Keeps exact timestamps available through the timer tooltip and accessibility label.
- Does not change API behavior or expose strategy parameters.


## v1.12.55 — unified Live schedule row

- Moves Portfolio update from the page header into the Live schedule row.
- Displays Analysis, Execution, Daily close and Portfolio update with the same circular timer component.
- Renames `Operational timers` to `Next automated events`.
- Replaces the ambiguous `Scheduled` label with explicit controller states: Trading automation active, Trading activity in progress, Scheduler unavailable, Needs review or Trading automation stopped.
- Keeps the manual Refresh action in the Portfolio header.
- Keeps Viewer payloads sanitized while allowing Trader and Administrator sessions to display authorized strategy details returned by the API.
- Does not hard-code strategic values in the frontend and does not change API v1.13.12.


## v1.12.56 — simplified Live schedule heading

- Removes the redundant automation-status pill from Live schedule.
- Keeps robot health and controller state exclusively in the dedicated Trading robot status box.
- Renames `Next automated events` to the shorter `Upcoming events`.
- Keeps Analysis, Execution, Daily close and Portfolio update in the same row.
- Does not change API v1.13.12, timer calculations, permissions or strategy data exposure.


## v1.12.57 — Google identity-bound temporary access

- Adds the authorized Google email and maximum active-session fields to Administration.
- Replaces token-only Viewer/Trader login with Google Identity Services verification.
- Keeps the invitation token only in React memory, removes it from the browser URL and never writes it to browser storage.
- Shows the masked authorized email before Google verification.
- Requires the complete generated link for the first claim and supports returning sign-in through its non-secret invitation identifier.
- Displays pending, claimed, active, expired, revoked and legacy-unverified access states.
- Shows claimed identity, active session count and session-limit controls in Administration.
- Requires Market Cycle Trader API v1.13.13 and `VITE_GOOGLE_CLIENT_ID`.


## v1.12.58 — simplified verified-access login

- Removes the `Use another invitation` button from the claimed invitation panel.
- Keeps the verified Google identity flow and invitation details unchanged.
- Keeps the Administrator tab and password login unchanged for the next migration step.
- Requires Market Cycle Trader API v1.13.13.


## v1.12.60 — simplified authentication screen

- Removes implementation-oriented authentication explanations from the login screen.
- Keeps only the product identity, Google sign-in action, invitation context when present, and operational feedback.
- Authentication behavior, roles, permissions, invitation handling, and API contracts remain unchanged.

- Replaces the separate Verified access and Administrator tabs with one Google authentication screen.
- Removes the manual complete-invitation-link field. Invitation identifiers and first-claim tokens are read only from the generated URL.
- Supports Viewer, Trader and Administrator identity-bound profiles through the same Google button.
- Allows previously claimed accounts to sign in directly without reopening the original invitation link.
- Adds Administrator as an access profile in Administration.
- Keeps the Administration area inside Market Cycle Trader and leaves the standalone authentication projects on hold.
- Requires Market Cycle Trader API v1.13.14, `VITE_GOOGLE_CLIENT_ID`, and the API variable `TRADER_ADMIN_GOOGLE_EMAIL`.


## v1.12.65 — Administrator result export and winner execution lock

- Restores the complete backtest result export action for Administrator sessions.
- Removes editable model-thread and numeric-thread fields because winner execution settings are immutable.
- Keeps training enablement, automatic scheduling, concurrency, timeout, Trader controls, history, and hints.
- Shows the winner execution profile as locked.
- Requires Market Cycle Trader API v1.13.18.


## v1.12.61 — session expiration and responsive administration

The frontend refreshes the authenticated session periodically, handles expiration, shows a brief warning near timeout, and renders administration invitations as responsive cards on narrower screens to prevent horizontal page scrolling.


## v1.12.62 — administrative Trader control

- Adds the protected Trader operation controls for active, paused, exit-only, and stopped modes.
- Shows sanitized operational status and recent changes to Administrators.

## v1.12.63 — Administrator System Settings

- Adds an Administrator-only `System Settings` navigation tab.
- Moves Trader operation controls out of access administration.
- Adds training enablement, automatic pre-market training, model threads, numeric threads, concurrent-job limit, and backtest-timeout controls.
- Shows detected CPU capacity, current revision, and responsive configuration history.
- Uses cards and responsive grids without horizontal page scrolling.
- Requires Market Cycle Trader API v1.13.17.


## v1.12.64 — contextual parameter hints

- Adds a compact `?` hint beside every configurable System Settings parameter.
- Each hint explains the operational effect, a mathematical relationship, and a concrete numerical example.
- Supports mouse hover, keyboard focus, and touch focus without changing the saved API payload.
- Keeps the explanations generic and does not expose strategy rules, thresholds, features, weights, or model internals.
- Requires Market Cycle Trader API v1.13.17; the API is unchanged in this release.


## v1.12.67 — Winner-safe strategy research workspace

- Adds an Administrator-only strategy catalog inside System Settings.
- Preserves the Railway production winner as an immutable Trader snapshot.
- Clones protected winners into editable test strategies and exposes every server-validated strategy parameter without frontend defaults.
- Keeps the selected backtest strategy separate from the Trader winner.
- Allows cloning and editing drafts while a backtest is running.
- Shows the active backtest lock and disables strategy selection, deletion, promotion and another backtest until completion.
- Shows a fixed single-backtest queue instead of an editable concurrency control.
- Requires explicit promotion after a completed backtest for the exact candidate revision to change Trader.
- Preserves former winners as locked snapshots.
- Requires Market Cycle Trader API v1.13.20.
- Only Administrator sessions receive or edit strategy parameters. Viewer and Trader screens continue to use sanitized payloads.


## v1.12.70 — Candidate strategy status

- Adds a visible `candidate` status between draft and winner.
- Adds `Mark as candidate` after a completed backtest for the exact revision.
- Candidate cards display validated status and the certified job id.
- Editing and saving a candidate returns it to draft and requires a new backtest.
- `Promote to Trader winner` is enabled only for an exact certified candidate revision.
- Candidate operations update only the strategy component and never reload the whole page.
- Requires Market Cycle Trader API v1.13.21.


## v1.12.68 — Component-scoped settings refresh

- Stops the one-minute session heartbeat from recreating settings-page callbacks and reloading editable strategy forms.
- Uses stable authentication callbacks so session metadata refreshes do not reinitialize Administrator components.
- Loads System Settings and the strategy catalog only once when their components mount.
- Refreshes Trader status after a promotion without reloading the complete System Settings page.
- Keeps active-backtest polling scoped to its status banner and action locks.
- Preserves unsaved strategy parameters in local component state until the Administrator saves, selects another strategy or leaves the page.
- Warns before discarding an unsaved strategy draft or reloading the browser.
- Shows an explicit `Unsaved changes` indicator and disables saving when there is no local change.
- Does not change API contracts, strategy parameters, the protected Trader winner or Paper state.
- Requires Market Cycle Trader API v1.13.20.


## v1.12.70 — Single Candidate and Winner lifecycle

- Displays one current Candidate and one current Trader Winner.
- Replaced candidates are labeled `Superseded candidate`.
- Promoted research profiles are labeled `Promoted candidate`.
- Former Trader winners remain labeled `Former winner`.
- Historical candidate and winner snapshots are protected and clone-only.
- Component-scoped refresh and unsaved-draft protection remain unchanged.


## v1.12.71 — Operational-state-preserving Winner promotion

- Updates the promotion confirmation to describe a metadata-only handoff while the market is closed.
- Explicitly confirms that the current position, cash, history, scheduler and armed next-session run must be preserved.
- Sends `confirm_market_closed=true` and `confirm_preserve_operational_state=true` with the promotion request.
- Removes the obsolete instruction to pause, liquidate or reinitialize Paper state.
- After success, confirms that no broker interaction occurred and that the next scheduled pre-market evaluation will load the full promoted Winner asset universe.
- Keeps component-scoped refresh behavior; the complete Settings page is not reloaded.


## v1.12.72 — Strategy priority ordering

- Orders the strategy boundary summary as Trader Winner, Backtest strategy, Current Candidate and lifecycle rule.
- Orders the Strategy catalog with the active Winner first, the selected Backtest strategy second and the active Candidate third.
- Keeps all remaining historical and draft strategies alphabetically ordered after the three operational priorities.
- Does not reload the page or change any strategy, lifecycle pointer, API contract, Paper state or Trader behavior.
- Requires Market Cycle Trader API v1.13.23; the API is unchanged in this release.
