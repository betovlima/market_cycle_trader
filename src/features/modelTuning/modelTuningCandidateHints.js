export const CANDIDATE_RANKING_HINTS = {
  Rank: {
    description: 'Position among completed eligible candidates. Eligibility requires every walk-forward fold to have a positive return. Rank is not ordered by Capital: the primary key is Score, then Capital, then Sharpe as tie-breakers.',
    relationship: 'Rank order = Score descending → Capital descending → Sharpe descending. Eligible = completed AND every fold return > 0.',
    example: 'A candidate with Score -2.50 ranks above one with Score -2.60 even if its Capital is lower, because -2.50 is the higher Score.',
  },
  Candidate: {
    description: 'Identifies which configuration was evaluated and how it entered the campaign. Control is the reference Strategy, Startup candidates come from the Latin Hypercube warm-up, and CARO candidates are proposed adaptively from completed observations.',
    relationship: 'No financial formula. Candidate = campaign-local identifier + proposal type + exact model settings stored for that evaluation.',
    example: 'Control #0 is the reference; Startup #3 is a warm-up sample; CARO #10 is an adaptive proposal created after learning from earlier completed candidates.',
  },
  Status: {
    description: 'Execution state of the candidate Backtest. Metrics should be considered final only when the candidate is completed.',
    relationship: 'Typical flow: queued → running → completed. A candidate may instead finish as failed or cancelled.',
    example: 'A running candidate can show progress but does not yet have a final Capital, CAGR, Sharpe, drawdown or fold result.',
  },
  Capital: {
    description: 'Final simulated portfolio value at the end of the out-of-sample walk-forward execution. The strategy reinvests the shared capital through the sequence of positions and transaction costs are reflected in the equity curve.',
    relationship: 'Capital = V_final, where the portfolio curve evolves from the configured initial capital through each net portfolio return. Total return = V_final / V_initial - 1.',
    example: 'If the simulation starts with $10,000 and the final equity value is $601,137, Capital is $601,137 and total return is 5,911.37%.',
  },
  CAGR: {
    description: 'Compound Annual Growth Rate: the constant annualized growth rate that would transform the initial portfolio value into the ending value over the actual elapsed calendar time.',
    relationship: 'CAGR = (V_final / V_initial)^(1 / years) - 1, with years = elapsed calendar days / 365.25.',
    example: 'If $10,000 becomes $20,000 in 5 years, CAGR ≈ 14.87% per year.',
  },
  Sharpe: {
    description: 'Annualized return-to-volatility ratio of the daily strategy equity returns. Higher values indicate more average return per unit of daily variability. The current implementation does not subtract a risk-free rate.',
    relationship: 'Sharpe = √252 × mean(daily portfolio return) / standard deviation(daily portfolio return).',
    example: 'If mean daily return is 0.10% and daily standard deviation is 1.00%, Sharpe ≈ √252 × 0.001 / 0.01 ≈ 1.59.',
  },
  'Max DD': {
    description: 'Maximum Drawdown: the worst peak-to-trough loss observed in the portfolio equity curve. Values are negative; a value closer to zero is better because the portfolio lost less from its previous high.',
    relationship: 'DD_t = V_t / max(V_0…V_t) - 1. Max DD = minimum DD_t over the complete evaluated curve.',
    example: 'If equity reaches $100,000 and later falls to $70,000 before making a new high, that episode produces a -30% drawdown.',
  },
  'Worst fold': {
    description: 'The lowest strategy return among the walk-forward test folds. It measures how the configuration performed in its weakest out-of-sample period rather than only looking at the complete compounded result.',
    relationship: 'Worst fold = min(return_fold_1, return_fold_2, …, return_fold_n). Candidate ranking eligibility currently requires every fold return > 0.',
    example: 'For fold returns +58%, +120% and +24%, Worst fold = +24%. If one fold is -5%, Worst fold = -5% and the candidate receives no Rank.',
  },
  'Champion gate': {
    description: 'Research robustness comparison against the current Champion anchor. It reports whether the completed candidate simultaneously satisfies the configured capital, Sharpe, drawdown and worst-fold thresholds. It is informational for manual Backtest use and is not a Winner decision.',
    relationship: 'Beat = Capital ≥ Champion Capital × (1 + minimum capital improvement) AND Sharpe ≥ Champion Sharpe - tolerance AND Max DD ≥ Champion Max DD - drawdown tolerance AND Worst fold > configured minimum.',
    example: 'If the Champion has $600k and minimum capital improvement is 3%, the candidate needs at least $618k, while also satisfying the other three robustness conditions.',
  },
  'P(beat)': {
    description: 'Surrogate-model estimate of the probability that this proposed configuration will satisfy the complete Champion gate when its real Backtest is executed. It is calculated before the candidate result is known and is not the probability of future market profit.',
    relationship: 'P(beat) = simulated surrogate scenarios satisfying all Champion-gate conditions / total simulated scenarios. Scenarios use the probabilistic model predictions and their uncertainty for Capital, Sharpe, Max DD and Worst fold.',
    example: 'If 1,700 of 10,000 simulated surrogate outcomes satisfy all gate conditions, P(beat) = 17%.',
  },
  'Expected improvement': {
    description: 'Risk-constrained expected capital improvement predicted by the surrogate before running the Backtest. It rewards scenarios that exceed the Champion capital threshold only when their simulated Sharpe, drawdown and worst fold also satisfy the robustness conditions.',
    relationship: 'EI = mean[ max(simulated Capital - gate Capital, 0) / Champion Capital × I(risk conditions pass) ]. The displayed value is a relative fraction formatted as a percentage.',
    example: 'A simulated scenario 5% above the required capital contributes about 0.05 only if its risk conditions pass; otherwise that scenario contributes 0. The average across scenarios is Expected improvement.',
  },
  Score: {
    description: 'Strategy risk-adjusted compound score used as the primary Candidate Ranking metric. It accumulates log portfolio growth while penalizing negative daily returns and increases in drawdown. Higher is better, even when values are negative.',
    relationship: 'Score = Σ[ log(V_t/V_t-1) - downside_penalty × max(0, -log(V_t/V_t-1)) - drawdown_penalty × max(0, D_t - D_t-1) ], where D_t = 1 - V_t / peak_t.',
    example: 'Two candidates can finish with similar Capital but receive different Scores if one reached that result through larger downside moves or repeated drawdown deterioration. This is why Rank can differ from Capital order.',
  },
}
