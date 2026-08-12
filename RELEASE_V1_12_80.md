# Frontend v1.12.80 — Unified System Settings workspace

## Scope

This release applies the compact single-workspace layout introduced in Portfolio to the Administrator System Settings page.

### Layout

- System Settings now uses one outer workspace instead of several independent large cards.
- Header, revision and Refresh action share one compact top row.
- Training, automatic training, detected CPU and Trader mode are displayed in one metric strip.
- Model execution, strategy research, Trader operation and configuration history are separated by lightweight internal dividers inside the same workspace.
- Strategy lifecycle information uses a compact four-column strip.
- Strategy catalog and editor share one bordered workspace instead of two detached cards.
- Existing responsive behavior is preserved for narrower screens.

### Descriptive hints

- Contextual help is available for every editable system setting.
- Strategy name, description, parameter search and change reason include help hints.
- Every one of the 59 strategy parameters receives a description from the authenticated API parameter schema.
- Numeric limits, enum choices and technical names are shown dynamically from the schema instead of being duplicated in frontend code.
- Trader status, phase, scheduler, next session and protected winner also include contextual explanations.

### Security boundary

The frontend contains only generic tooltip rendering. Strategy-parameter descriptions are supplied by the authenticated Administrator strategy-catalog endpoint in API v1.13.26, so detailed strategy documentation is not hardcoded into the public frontend bundle.

No trading decision, backtest calculation, XGBoost behavior, candidate/winner lifecycle rule or Paper execution behavior is changed.

Frontend badge: `v1.12.80`
Required API for complete parameter descriptions: `v1.13.26`
