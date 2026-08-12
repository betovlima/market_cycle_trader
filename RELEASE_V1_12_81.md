# Frontend v1.12.81 — Reliable contextual hints

## Scope

This release fixes contextual help cards that could be clipped or hidden inside the compact System Settings / Strategy workspace introduced in v1.12.80.

## What changed

- Contextual hints are now rendered through a React portal at document level.
- Hints are no longer constrained by `overflow: hidden` on parameter groups, field headings, catalog panels, or compact workspace sections.
- The hint automatically chooses above/below placement according to available viewport space.
- Horizontal placement is clamped to the visible viewport.
- Hover, keyboard focus, click/touch and Escape are supported.
- Moving the pointer from the `?` trigger into the hint no longer closes it immediately.
- Long hints use an internal vertical scroll only when necessary.
- Reduced-motion preferences disable the opening animation.

## Unchanged

- API remains v1.13.26.
- Parameter descriptions remain supplied by the authenticated API schema.
- Winner, Candidate, strategy parameters, backtests and Trader execution logic are unchanged.
