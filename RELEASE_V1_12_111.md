# Frontend v1.12.111 — Model-aware Candidate and Winner

## Scope

This release completes the UI side of the model-aware lifecycle introduced by API v1.13.42.

## Changes

- Model selector remains inside `SELECTED STRATEGY`.
- `Mark as candidate` sends the currently selected model family to the API.
- The API chooses the latest completed job for that exact Strategy revision and model; the frontend does not contain or reconstruct model parameters.
- Candidate and Trader Winner summary cards display the certified model label returned by the API.
- IQN cannot be marked Candidate because it has no protected live engine yet.
- No Strategy values or model hyperparameters were added to React source.
