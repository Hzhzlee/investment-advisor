export interface PricePoint {
  date: string;
  close: number; // dividend-adjusted total return price if available, else raw close
  raw_close?: number;
  adj_close?: number;
  is_adjusted?: boolean;
}

export interface MetricResults {
  cagr: number;
  annualized_volatility: number;
  max_drawdown: number;
  best_rolling_10yr_cagr?: number | null;
  worst_rolling_10yr_cagr?: number | null;
  start_date: string;
  end_date: string;
  total_months: number;
  start_price: number;
  end_price: number;
  ten_yr_rolling_note?: string;
}

export interface ScenarioResult {
  id: string;
  name: string;
  adjustment: number;
  cagr: number;
  final_value: number;
  total_contributed: number;
  total_gain: number;
  multiple: number;
  trajectory: Array<{
    year: number;
    value: number;
    totalContributed: number;
  }>;
}

export interface MonteCarloResult {
  p10_final: number;
  p50_final: number;
  p90_final: number;
  trajectories: Array<{
    year: number;
    p10: number;
    p50: number;
    p90: number;
  }>;
}

export interface TickerHistoryState {
  ticker: string;
  prices: PricePoint[];
  metrics: MetricResults | null;
  scenarios: ScenarioResult[];
  monteCarlo: MonteCarloResult | null;
  isLoading: boolean;
  error: string | null;
  dataSource: 'api' | 'csv' | 'benchmark';
}

export type AssetClassKey =
  | 'cash'
  | 'gov_backed'
  | 'bonds'
  | 'global_equity'
  | 'sg_equity'
  | 'reits'
  | 'gold';

export interface AssetClassConfig {
  key: AssetClassKey;
  name: string;
  shortName: string;
  isFixedRate: boolean;
  defaultFixedRate?: number;
  fixedRate?: number;
  defaultProxy: string;
  currentProxy: string;
  assumptionNote?: string;
  description: string;
  color: string;
  category: 'Cash & Sovereign' | 'Fixed Income' | 'Equities' | 'Real Assets';
}

export interface PortfolioComponentInput {
  asset_class: AssetClassKey;
  ticker?: string;
  fixed_rate?: number;
  weight: number;
}

export interface BlendedSeriesResponse {
  monthly_returns: Array<{ date: string; return: number; index_value: number }>;
  annualized_return: number;
  annualized_volatility: number;
  max_drawdown: number;
  total_months: number;
  components_summary: Array<{
    asset_class: string;
    identifier: string;
    weight: number;
    cagr: number;
    volatility: number;
  }>;
}

export interface GoalSimulationResponse {
  probability_of_success: number;
  real_probability_of_success: number;
  median_final_value: number;
  real_median_final_value: number;
  p10_final: number;
  p50_final: number;
  p90_final: number;
  real_p10_final: number;
  real_p50_final: number;
  real_p90_final: number;
  worst_case_drawdown: number;
  total_contributed: number;
  target_amount: number;
  years: number;
  inflation: number;
  fee_drag: number;
  trajectories: Array<{
    year: number;
    p10: number;
    p50: number;
    p90: number;
    real_p10: number;
    real_p50: number;
    real_p90: number;
    totalContributed: number;
  }>;
}

export interface RequiredContributionResponse {
  required_monthly_contribution: number;
  confidence: number;
  target_amount: number;
  years: number;
  start_value: number;
  real_terms: boolean;
  inflation: number;
  fee_drag: number;
  expected_terminal_p50: number;
}

export interface SuggestedMixDefinition {
  id: string;
  name: string;
  label: string;
  description: string;
  rationale: string;
  risk_rating: string;
  expected_cagr_estimate: number;
  components: Array<{
    asset_class: AssetClassKey;
    name: string;
    default_proxy: string;
    is_fixed_rate: boolean;
    default_rate?: number;
    weight: number;
  }>;
}

export interface MixAnalyticsState {
  mixId: string;
  mixName: string;
  mixLabel: string;
  description: string;
  rationale: string;
  riskRating: string;
  weights: Record<AssetClassKey, number>;
  blendedSeries?: BlendedSeriesResponse;
  simulation?: GoalSimulationResponse;
  requiredContribution?: RequiredContributionResponse;
  isLoading: boolean;
  error?: string | null;
}
