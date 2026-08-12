## v2.0.2 — Model Tuning controls

- Replaces the ambiguous generic `Start tuning` action with a method-specific action label: `Start Latin Hypercube` or `Start CARO Probability`.
- When Stop is requested, the UI now states that the active candidate is being cancelled instead of implying that it will continue to completion.
- Shows `Stopping…`, the candidate being cancelled and the cancelled-candidate count.
- Requires API v2.0.6 for immediate cancellation semantics.

## v2.0.0 — Winner Lifecycle Governance

- Shows the three protected lifecycle roles separately: Current Candidate, Promoted Candidate and Trader Winner.
- Updates the lifecycle rule to `One Candidate · one Promoted Candidate · one Winner`.
- Shows only the active promoted Strategy with the `PROMOTED` marker; older promoted Strategies are displayed as historical/superseded candidates.
- Clarifies promotion confirmation and success messaging: the previous Winner and Promoted Candidate are preserved as immutable history.
- Keeps existing protected snapshots cloneable for research while preventing direct mutation.

## v1.12.120 — CARO Prior Source Safety

- When CARO Probability is selected and completed Latin Hypercube sources are available, the newest prior campaign is selected by default.
- Standalone CARO remains available by explicitly choosing `None — start CARO independently`.
- Makes prior reuse behavior explicit so a completed LHS campaign is not accidentally ignored.

## v1.12.119 — Model Tuning Diagnostic Logs

- Adds a campaign log action and a per-candidate Log button to Model Tuning.
- Failed rows show the captured failure type when available.
- Diagnostic modal supports copy and .txt download for troubleshooting while keeping the normal tuning table compact.

## v1.12.118 — CARO Prior Exploration + Champion Anchor

- Model Tuning remains inside the main Backtest research workspace; no dedicated compute application is required.
- CARO Probability can reuse a completed Latin Hypercube campaign without rerunning its observations.
- The source campaign's best eligible candidate is selected by default as the Champion anchor; another eligible source candidate can be chosen explicitly.
- Candidate count means new adaptive trials when prior exploration is reused.
- The UI shows imported observation count, Champion metrics, frozen market-data cutoff, P(beat Champion), expected improvement and the actual Champion-gate result.
- CARO candidate details show predicted capital/risk metrics and the current promising hyperparameter region.
- A candidate can be adopted into the selected editable Strategy for confirmation, but a normal final Backtest remains mandatory before Candidate/Trader promotion.
