# Market Cycle Trader Frontend v1.12.109 — Model-specific Research Settings

## Scope

This release extends Administrator System Settings with a Model Research workspace. The UI is schema-driven: model identities, profile ownership, field labels, descriptions, validation bounds and current values come from the protected API.

## Behavior

- XGBoost Utility is visible as the baseline but remains Strategy-owned and read-only.
- LightGBM Utility has an independent editable baseline profile.
- IQN has an independent editable baseline profile.
- Saving requires an audit reason and optimistic revision match.
- New challenger jobs freeze the active model profile revision in the immutable execution snapshot.
- A running job is not changed when a profile is edited.

## Strategy boundary

The frontend does not define model defaults or hyperparameter keys. Strategy parameters and the Trader Winner remain under their existing protected lifecycle. Challenger settings cannot certify or promote a Strategy.

## API compatibility

Requires Market Cycle Trader API v1.13.40.
