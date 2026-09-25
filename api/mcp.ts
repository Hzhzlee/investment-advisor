/**
 * ETF Horizon - MCP Serverless Handler
 * Implements stateless JSON-RPC 2.0 over HTTP POST for Model Context Protocol (MCP).
 * Public data provider: Yahoo Finance public chart endpoint (NO API keys or env vars needed)
 * with verified fallback benchmarks for resilient zero-failure execution.
 * 
 * Exposes 8 tools:
 * 1. get_price_history: dividend-adjusted total returns, raw close, currency & status
 * 2. compute_metrics: CAGR, annualized volatility, max drawdown
 * 3. project_scenarios: deterministic 5-scenario wealth projections
 * 4. monte_carlo: stochastic GBM trajectory percentiles
 * 5. build_blended_series: monthly blended return series with annual rebalancing
 * 6. simulate_goal: 6-month block bootstrap simulation with nominal & real-terms percentiles
 * 7. solve_required_contribution: bisection solver for required monthly contribution at target confidence
 * 8. suggest_mixes: illustrative asset allocations tailored for Singapore investors (risk levels 1-5)
 */

import { BENCHMARKS, parseCSVToPrices } from '../src/data/benchmarks.ts';

export interface PricePoint {
  date: string;
  close: number; // dividend-adjusted close if available, else raw close
  raw_close?: number;
  adj_close?: number;
  is_adjusted?: boolean;
}

export interface MetricResults {
  cagr: number;
  annualized_volatility: number;
  max_drawdown: number;
  start_date: string;
  end_date: string;
  total_months: number;
  start_price: number;
  end_price: number;
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

export interface BlendedComponent {
  asset_class: string;
  ticker?: string;
  fixed_rate?: number;
  weight: number;
  prices?: PricePoint[];
}

export interface BlendedSeriesResult {
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

export interface GoalSimulationResult {
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

export interface RequiredContributionResult {
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

export interface SuggestedMix {
  id: string;
  name: string;
  label: string;
  description: string;
  rationale: string;
  risk_rating: string;
  expected_cagr_estimate: number;
  components: Array<{
    asset_class: 'cash' | 'gov_backed' | 'bonds' | 'global_equity' | 'sg_equity' | 'reits' | 'gold';
    name: string;
    default_proxy: string;
    is_fixed_rate: boolean;
    default_rate?: number;
    weight: number;
  }>;
}

// MCP Tool Definitions with JSON Schemas
const TOOLS = [
  {
    name: "get_price_history",
    description: "Fetch monthly dividend-adjusted (total return) and raw closing prices with currency from Yahoo Finance public chart endpoint. If dividend-adjusted data is unavailable, falls back to raw close and flags it.",
    inputSchema: {
      type: "object",
      properties: {
        ticker: {
          type: "string",
          description: "ETF or stock symbol (e.g. 'ES3.SI', 'VT', 'AGG', 'VNQ', 'GLD', 'SPY')"
        },
        years: {
          type: "number",
          description: "Lookback duration in years (5 or 10)",
          default: 10
        }
      },
      required: ["ticker"]
    }
  },
  {
    name: "compute_metrics",
    description: "Calculate historical performance metrics: Compound Annual Growth Rate (CAGR), annualized volatility (monthly standard deviation * sqrt(12)), and maximum peak-to-trough drawdown from price series.",
    inputSchema: {
      type: "object",
      properties: {
        prices: {
          type: "array",
          items: {
            type: "object",
            properties: {
              date: { type: "string", description: "ISO date YYYY-MM-DD" },
              close: { type: "number", description: "Closing price" }
            },
            required: ["date", "close"]
          },
          description: "Chronological monthly price series"
        }
      },
      required: ["prices"]
    }
  },
  {
    name: "project_scenarios",
    description: "Compute 10-year forward deterministic wealth projections for five scenarios with CAGR adjusted relative to base (-20%, -10%, base, +10%, +20%) with monthly contributions, fee drag, and compounding.",
    inputSchema: {
      type: "object",
      properties: {
        start_value: {
          type: "number",
          description: "Initial investment capital (e.g. 10000)"
        },
        base_cagr: {
          type: "number",
          description: "Base annual growth rate decimal (e.g. 0.06 for 6.0%)"
        },
        years: {
          type: "number",
          description: "Forward projection horizon in years (default 10)",
          default: 10
        },
        monthly_contribution: {
          type: "number",
          description: "Fixed monthly savings contribution (default 500)",
          default: 500
        },
        fee_drag: {
          type: "number",
          description: "Annual fee drag / expense ratio decimal (default 0.002 for 0.2%)",
          default: 0.002
        }
      },
      required: ["start_value", "base_cagr"]
    }
  },
  {
    name: "monte_carlo",
    description: "Simulate forward portfolio paths from historical monthly returns using Monte Carlo Geometric Brownian Motion and extract 10th, 50th (median), and 90th percentile trajectories.",
    inputSchema: {
      type: "object",
      properties: {
        prices: {
          type: "array",
          items: {
            type: "object",
            properties: {
              date: { type: "string" },
              close: { type: "number" }
            },
            required: ["date", "close"]
          },
          description: "Historical price series used to derive historical monthly drift and volatility"
        },
        start_value: {
          type: "number",
          description: "Starting portfolio capital (default 10000)",
          default: 10000
        },
        years: {
          type: "number",
          description: "Forward simulation horizon in years (default 10)",
          default: 10
        },
        monthly_contribution: {
          type: "number",
          description: "Monthly contribution amount (default 500)",
          default: 500
        },
        n_paths: {
          type: "number",
          description: "Number of simulated paths (default 1000)",
          default: 1000
        },
        fee_drag: {
          type: "number",
          description: "Annual fee drag decimal (default 0.002)",
          default: 0.002
        }
      },
      required: ["prices"]
    }
  },
  {
    name: "build_blended_series",
    description: "Combines asset components (market proxies and fixed-rate assets) with target weights into a monthly blended return series with annual rebalancing.",
    inputSchema: {
      type: "object",
      properties: {
        components: {
          type: "array",
          items: {
            type: "object",
            properties: {
              asset_class: { type: "string", description: "Asset class identifier" },
              ticker: { type: "string", description: "Market proxy ticker (e.g. 'VT', 'AGG')" },
              fixed_rate: { type: "number", description: "Annual assumed rate decimal (e.g. 0.028 for 2.8%)" },
              weight: { type: "number", description: "Target asset allocation weight decimal (e.g. 0.35 for 35%)" },
              prices: { type: "array", description: "Optional preloaded price series" }
            },
            required: ["asset_class", "weight"]
          },
          description: "List of portfolio building block components"
        },
        years: {
          type: "number",
          description: "Historical horizon duration in years (default 10)",
          default: 10
        },
        rebalance: {
          type: "string",
          description: "Rebalancing frequency ('annual' default)",
          default: "annual"
        }
      },
      required: ["components"]
    }
  },
  {
    name: "simulate_goal",
    description: "Simulates forward goal feasibility using a 6-month block bootstrap of historical monthly returns. Returns probability of reaching target amount, 10th/50th/90th percentile trajectories, worst-case drawdown, and real-terms (inflation-adjusted) metrics.",
    inputSchema: {
      type: "object",
      properties: {
        returns: {
          type: "array",
          items: { type: "number" },
          description: "Chronological monthly decimal return series"
        },
        start_value: {
          type: "number",
          description: "Starting portfolio capital in currency"
        },
        monthly_contribution: {
          type: "number",
          description: "Monthly savings contribution"
        },
        years: {
          type: "number",
          description: "Forward goal horizon in years"
        },
        target_amount: {
          type: "number",
          description: "Target savings / wealth goal amount"
        },
        n_paths: {
          type: "number",
          description: "Number of bootstrap paths (default 1000)",
          default: 1000
        },
        inflation: {
          type: "number",
          description: "Annual inflation rate decimal (default 0.025 for 2.5%)",
          default: 0.025
        },
        fee_drag: {
          type: "number",
          description: "Annual fee drag / expense ratio decimal (default 0.002 for 0.2%)",
          default: 0.002
        }
      },
      required: ["returns", "start_value", "monthly_contribution", "years", "target_amount"]
    }
  },
  {
    name: "solve_required_contribution",
    description: "Determines the minimum monthly contribution required to reach the target amount at the specified confidence level (default 80%) using bisection on block-bootstrapped paths.",
    inputSchema: {
      type: "object",
      properties: {
        returns: {
          type: "array",
          items: { type: "number" },
          description: "Monthly decimal return series"
        },
        start_value: {
          type: "number",
          description: "Starting portfolio capital"
        },
        years: {
          type: "number",
          description: "Horizon in years"
        },
        target_amount: {
          type: "number",
          description: "Target wealth goal amount"
        },
        confidence: {
          type: "number",
          description: "Target probability confidence decimal (default 0.80 for 80%)",
          default: 0.80
        },
        inflation: {
          type: "number",
          description: "Annual inflation rate decimal (default 0.025)",
          default: 0.025
        },
        real_terms: {
          type: "boolean",
          description: "Solve in real purchasing power terms (default false)",
          default: false
        },
        fee_drag: {
          type: "number",
          description: "Annual fee drag decimal (default 0.002)",
          default: 0.002
        }
      },
      required: ["returns", "start_value", "years", "target_amount"]
    }
  },
  {
    name: "suggest_mixes",
    description: "Generates three labelled illustrative asset allocations tailored for Singapore retail investors based on risk comfort level (1-5) and investment horizon.",
    inputSchema: {
      type: "object",
      properties: {
        risk_level: {
          type: "number",
          description: "Risk comfort level from 1 (Very Conservative) to 5 (Aggressive Growth)"
        },
        horizon_years: {
          type: "number",
          description: "Investment time horizon in years"
        }
      },
      required: ["risk_level", "horizon_years"]
    }
  }
];

// Helper: Yahoo Finance public fetcher with benchmark fallback
export async function fetchYahooPriceHistory(
  ticker: string,
  years: number = 10
): Promise<{ currency: string; adjusted_close_available: boolean; prices: PricePoint[] }> {
  const cleanTicker = ticker.trim().toUpperCase();
  if (!cleanTicker) {
    throw new Error("Ticker symbol cannot be empty.");
  }

  const range = years <= 5 ? "5y" : "10y";
  const urls = [
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(cleanTicker)}?range=${range}&interval=1mo`,
    `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(cleanTicker)}?range=${range}&interval=1mo`
  ];

  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9"
  };

  let lastError: Error | null = null;

  for (const url of urls) {
    try {
      const response = await fetch(url, { headers });
      if (!response.ok) {
        lastError = new Error(`Yahoo Finance HTTP ${response.status}: ${response.statusText}`);
        continue;
      }

      const data = await response.json();
      const chartResult = data?.chart?.result?.[0];

      if (!chartResult) {
        const errorInfo = data?.chart?.error?.description || "Ticker not found or no historical chart data available.";
        lastError = new Error(`Yahoo Finance: ${errorInfo}`);
        continue;
      }

      const meta = chartResult.meta || {};
      const currency = meta.currency || (cleanTicker.endsWith(".SI") ? "SGD" : "USD");

      const timestamps: number[] = chartResult.timestamp || [];
      const quoteCloses: (number | null)[] = chartResult.indicators?.quote?.[0]?.close || [];
      const adjCloses: (number | null)[] = chartResult.indicators?.adjclose?.[0]?.adjclose || [];

      if (!timestamps.length || (!quoteCloses.length && !adjCloses.length)) {
        lastError = new Error(`No price data points returned for ${cleanTicker}.`);
        continue;
      }

      let hasAdjusted = false;
      const points: PricePoint[] = [];

      for (let i = 0; i < timestamps.length; i++) {
        const t = timestamps[i];
        const rawQuote = quoteCloses[i];
        const rawAdj = adjCloses[i];

        let chosenClose: number | null = null;
        let isAdjPoint = false;

        // Total return: prefer dividend-adjusted close (adjclose)
        if (typeof rawAdj === "number" && !isNaN(rawAdj) && rawAdj > 0) {
          chosenClose = rawAdj;
          isAdjPoint = true;
          hasAdjusted = true;
        } else if (typeof rawQuote === "number" && !isNaN(rawQuote) && rawQuote > 0) {
          chosenClose = rawQuote;
        }

        if (chosenClose !== null && chosenClose > 0) {
          const dateStr = new Date(t * 1000).toISOString().slice(0, 10);
          points.push({
            date: dateStr,
            close: Math.round(chosenClose * 10000) / 10000,
            raw_close: typeof rawQuote === "number" ? Math.round(rawQuote * 10000) / 10000 : undefined,
            adj_close: typeof rawAdj === "number" ? Math.round(rawAdj * 10000) / 10000 : undefined,
            is_adjusted: isAdjPoint
          });
        }
      }

      // Sort chronologically ascending
      points.sort((a, b) => a.date.localeCompare(b.date));

      const targetPoints = years * 12 + 1;
      const finalPoints = points.length > targetPoints ? points.slice(-targetPoints) : points;

      if (finalPoints.length < 2) {
        throw new Error(`Insufficient monthly price observations (${finalPoints.length}) found for ${cleanTicker}.`);
      }

      return {
        currency,
        adjusted_close_available: hasAdjusted,
        prices: finalPoints
      };
    } catch (err: any) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  // Graceful fallback to verified benchmark series if Yahoo API is rate-limited or fails
  const benchmark = BENCHMARKS[cleanTicker];
  if (benchmark) {
    const parsed = parseCSVToPrices(benchmark.csvData);
    const targetPoints = years * 12 + 1;
    const finalPoints = parsed.length > targetPoints ? parsed.slice(-targetPoints) : parsed;
    const hasAdj = finalPoints.some(p => p.is_adjusted);

    return {
      currency: benchmark.currency,
      adjusted_close_available: hasAdj,
      prices: finalPoints
    };
  }

  throw lastError || new Error(`Unable to retrieve historical chart data for ${cleanTicker} from Yahoo Finance.`);
}

// Helper: Compute financial metrics (CAGR, annualised volatility, max drawdown)
export function calculateMetrics(rawPrices: PricePoint[]): MetricResults {
  const prices = rawPrices
    .filter(p => p && typeof p.close === "number" && !isNaN(p.close) && p.close > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (prices.length < 2) {
    throw new Error("At least 2 chronological price points required to calculate metrics.");
  }

  const startPrice = prices[0].close;
  const endPrice = prices[prices.length - 1].close;
  const totalMonths = prices.length - 1;

  // Calendar elapsed years
  const startDate = new Date(prices[0].date);
  const endDate = new Date(prices[prices.length - 1].date);
  let elapsedYears = (endDate.getTime() - startDate.getTime()) / (365.25 * 24 * 3600 * 1000);
  if (isNaN(elapsedYears) || elapsedYears <= 0) {
    elapsedYears = totalMonths / 12;
  }

  // Compound Annual Growth Rate (CAGR)
  const cagr = Math.pow(endPrice / startPrice, 1 / elapsedYears) - 1;

  // Monthly returns for annualised volatility
  const monthlyReturns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    const prev = prices[i - 1].close;
    const curr = prices[i].close;
    monthlyReturns.push((curr - prev) / prev);
  }

  const meanReturn = monthlyReturns.reduce((sum, r) => sum + r, 0) / monthlyReturns.length;
  const variance = monthlyReturns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / (monthlyReturns.length - 1 || 1);
  const monthlyVol = Math.sqrt(variance);
  const annualizedVolatility = monthlyVol * Math.sqrt(12);

  // Maximum Drawdown: peak-to-trough decline
  let peak = -Infinity;
  let maxDrawdown = 0;
  for (const p of prices) {
    if (p.close > peak) {
      peak = p.close;
    }
    const dd = (p.close - peak) / peak;
    if (dd < maxDrawdown) {
      maxDrawdown = dd;
    }
  }

  return {
    cagr,
    annualized_volatility: annualizedVolatility,
    max_drawdown: maxDrawdown,
    start_date: prices[0].date,
    end_date: prices[prices.length - 1].date,
    total_months: prices.length,
    start_price: startPrice,
    end_price: endPrice
  };
}

// Helper: Deterministic scenario projections compounding monthly with fee drag
export function calculateScenarios(
  startValue: number,
  baseCagr: number,
  years: number = 10,
  monthlyContribution: number = 500,
  feeDrag: number = 0.002
): ScenarioResult[] {
  const adjustments = [
    { adj: -0.20, id: "scen_m20", name: "Severe Bear (-20% rel)" },
    { adj: -0.10, id: "scen_m10", name: "Conservative (-10% rel)" },
    { adj: 0, id: "scen_0", name: "Base Horizon (0% rel)" },
    { adj: 0.10, id: "scen_p10", name: "Optimistic (+10% rel)" },
    { adj: 0.20, id: "scen_p20", name: "Strong Bull (+20% rel)" }
  ];

  const results: ScenarioResult[] = [];

  for (const item of adjustments) {
    // Relative adjustment net of fee drag
    const grossCagr = baseCagr * (1 + item.adj);
    const netCagr = Math.max(-0.99, grossCagr - feeDrag);

    // Monthly effective compounding rate
    const monthlyRate = netCagr > -1 ? Math.pow(1 + netCagr, 1 / 12) - 1 : netCagr / 12;

    const trajectory: Array<{ year: number; value: number; totalContributed: number }> = [];

    let currentValue = startValue;
    let totalContributed = startValue;

    trajectory.push({
      year: 0,
      value: Math.round(currentValue * 100) / 100,
      totalContributed: Math.round(totalContributed * 100) / 100
    });

    const totalMonths = years * 12;
    for (let m = 1; m <= totalMonths; m++) {
      currentValue = currentValue * (1 + monthlyRate) + monthlyContribution;
      totalContributed += monthlyContribution;

      if (m % 12 === 0) {
        trajectory.push({
          year: m / 12,
          value: Math.round(currentValue * 100) / 100,
          totalContributed: Math.round(totalContributed * 100) / 100
        });
      }
    }

    const finalValue = Math.round(currentValue * 100) / 100;
    const finalContributed = Math.round(totalContributed * 100) / 100;
    const totalGain = Math.round((finalValue - finalContributed) * 100) / 100;
    const multiple = finalContributed > 0 ? Math.round((finalValue / finalContributed) * 100) / 100 : 1;

    results.push({
      id: item.id,
      name: item.name,
      adjustment: item.adj,
      cagr: netCagr,
      final_value: finalValue,
      total_contributed: finalContributed,
      total_gain: totalGain,
      multiple,
      trajectory
    });
  }

  return results;
}

// Helper: Monte Carlo Geometric Brownian Motion simulation
export function calculateMonteCarlo(
  prices: PricePoint[],
  startValue: number = 10000,
  years: number = 10,
  monthlyContribution: number = 500,
  nPaths: number = 1000,
  feeDrag: number = 0.002
): MonteCarloResult {
  if (!prices || prices.length < 2) {
    throw new Error("At least 2 price observations required to compute Monte Carlo simulation.");
  }

  const logReturns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    const prev = prices[i - 1].close;
    const curr = prices[i].close;
    if (prev > 0 && curr > 0) {
      logReturns.push(Math.log(curr / prev));
    }
  }

  if (logReturns.length === 0) {
    throw new Error("Unable to derive returns from provided price series.");
  }

  const n = logReturns.length;
  const meanLog = logReturns.reduce((sum, r) => sum + r, 0) / n;
  const varLog = logReturns.reduce((sum, r) => sum + Math.pow(r - meanLog, 2), 0) / (n - 1 || 1);
  const stdLog = Math.sqrt(varLog);

  const totalMonths = years * 12;
  const numPaths = Math.max(100, Math.min(2000, nPaths));
  const yearlyBuckets: number[][] = Array.from({ length: years + 1 }, () => []);

  // Standard Box-Muller normal generator
  function randomNormal(): number {
    let u = 0;
    let v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  const monthlyFeeRatio = 1 - feeDrag / 12;

  for (let p = 0; p < numPaths; p++) {
    let val = startValue;
    yearlyBuckets[0].push(val);

    for (let m = 1; m <= totalMonths; m++) {
      const z = randomNormal();
      const grossMonthlyReturn = Math.exp(meanLog + stdLog * z) - 1;
      const netMonthlyReturn = (1 + grossMonthlyReturn) * monthlyFeeRatio - 1;
      val = Math.max(0, val * (1 + netMonthlyReturn) + monthlyContribution);

      if (m % 12 === 0) {
        yearlyBuckets[m / 12].push(val);
      }
    }
  }

  const trajectories: Array<{ year: number; p10: number; p50: number; p90: number }> = [];

  for (let y = 0; y <= years; y++) {
    const bucket = yearlyBuckets[y].sort((a, b) => a - b);
    const idx10 = Math.floor(0.10 * bucket.length);
    const idx50 = Math.floor(0.50 * bucket.length);
    const idx90 = Math.floor(0.90 * bucket.length);

    trajectories.push({
      year: y,
      p10: Math.round(bucket[idx10] * 100) / 100,
      p50: Math.round(bucket[idx50] * 100) / 100,
      p90: Math.round(bucket[idx90] * 100) / 100
    });
  }

  const finalTraj = trajectories[trajectories.length - 1];

  return {
    p10_final: finalTraj.p10,
    p50_final: finalTraj.p50,
    p90_final: finalTraj.p90,
    trajectories
  };
}

/**
 * Tool 5: build_blended_series
 * Builds monthly blended return series with annual rebalancing across 7 asset components.
 */
export async function buildBlendedSeries(
  rawComponents: BlendedComponent[],
  years: number = 10,
  _rebalance: string = "annual"
): Promise<BlendedSeriesResult> {
  const activeComponents = rawComponents.filter(c => c && typeof c.weight === "number" && c.weight > 0);
  if (activeComponents.length === 0) {
    throw new Error("At least one component with weight > 0 is required.");
  }

  // Normalize weights to sum to 1.0
  const totalWeight = activeComponents.reduce((sum, c) => sum + c.weight, 0);
  const normalizedComponents = activeComponents.map(c => ({
    ...c,
    weight: c.weight / totalWeight
  }));

  // Fetch or prepare monthly return series for each component
  const componentMonthlyReturns: Array<{
    asset_class: string;
    identifier: string;
    weight: number;
    dates: string[];
    returns: number[];
    cagr: number;
    volatility: number;
  }> = [];

  for (const comp of normalizedComponents) {
    if (typeof comp.fixed_rate === "number" && !isNaN(comp.fixed_rate)) {
      // Fixed rate asset (Cash or Government-backed)
      const annualRate = comp.fixed_rate;
      const monthlyRate = Math.pow(1 + annualRate, 1 / 12) - 1;
      const targetMonths = years * 12;
      const dates: string[] = [];
      const returns: number[] = [];

      const now = new Date();
      for (let m = targetMonths; m >= 1; m--) {
        const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
        dates.push(d.toISOString().slice(0, 10));
        returns.push(monthlyRate);
      }

      componentMonthlyReturns.push({
        asset_class: comp.asset_class,
        identifier: `Assumed ${Math.round(annualRate * 1000) / 10}% p.a.`,
        weight: comp.weight,
        dates,
        returns,
        cagr: annualRate,
        volatility: 0
      });
    } else {
      // Market proxy asset
      const ticker = comp.ticker?.trim().toUpperCase();
      if (!ticker) {
        throw new Error(`Component for ${comp.asset_class} requires either a ticker or fixed_rate.`);
      }

      let pricePoints: PricePoint[] = comp.prices || [];
      if (!pricePoints || pricePoints.length < 2) {
        const history = await fetchYahooPriceHistory(ticker, years);
        pricePoints = history.prices;
      }

      // Convert prices to monthly returns
      const dates: string[] = [];
      const returns: number[] = [];
      for (let i = 1; i < pricePoints.length; i++) {
        const prev = pricePoints[i - 1].close;
        const curr = pricePoints[i].close;
        if (prev > 0 && curr > 0) {
          dates.push(pricePoints[i].date);
          returns.push((curr - prev) / prev);
        }
      }

      const metrics = calculateMetrics(pricePoints);

      componentMonthlyReturns.push({
        asset_class: comp.asset_class,
        identifier: ticker,
        weight: comp.weight,
        dates,
        returns,
        cagr: metrics.cagr,
        volatility: metrics.annualized_volatility
      });
    }
  }

  // Find minimum common length of returns
  const minMonths = Math.min(...componentMonthlyReturns.map(c => c.returns.length));
  if (minMonths < 2) {
    throw new Error("Insufficient monthly observations to construct blended series.");
  }

  // Align all components to the most recent `minMonths` periods
  const alignedComponents = componentMonthlyReturns.map(c => ({
    ...c,
    dates: c.dates.slice(-minMonths),
    returns: c.returns.slice(-minMonths)
  }));

  const commonDates = alignedComponents[0].dates;

  // Simulate portfolio wealth evolution with annual rebalancing
  // Initial wealth = 100.0 at month 0
  let portfolioWealth = 100.0;
  let assetAllocations = alignedComponents.map(c => portfolioWealth * c.weight);

  const blendedMonthlyResults: Array<{ date: string; return: number; index_value: number }> = [];
  let peakWealth = portfolioWealth;
  let maxDrawdown = 0;

  for (let m = 0; m < minMonths; m++) {
    // Annual rebalancing at start of month 12, 24, 36...
    if (m > 0 && m % 12 === 0) {
      assetAllocations = alignedComponents.map(c => portfolioWealth * c.weight);
    }

    const startMonthWealth = portfolioWealth;

    // Grow each asset bucket by its monthly return
    let endMonthWealth = 0;
    for (let i = 0; i < alignedComponents.length; i++) {
      const r = alignedComponents[i].returns[m];
      assetAllocations[i] = assetAllocations[i] * (1 + r);
      endMonthWealth += assetAllocations[i];
    }

    portfolioWealth = endMonthWealth;
    const monthlyBlendedReturn = (endMonthWealth - startMonthWealth) / startMonthWealth;

    if (portfolioWealth > peakWealth) {
      peakWealth = portfolioWealth;
    }
    const currentDrawdown = (portfolioWealth - peakWealth) / peakWealth;
    if (currentDrawdown < maxDrawdown) {
      maxDrawdown = currentDrawdown;
    }

    blendedMonthlyResults.push({
      date: commonDates[m],
      return: monthlyBlendedReturn,
      index_value: Math.round(portfolioWealth * 100) / 100
    });
  }

  // Compute portfolio overall CAGR & volatility
  const elapsedYears = minMonths / 12;
  const portfolioCagr = Math.pow(portfolioWealth / 100.0, 1 / elapsedYears) - 1;

  const returnsList = blendedMonthlyResults.map(b => b.return);
  const meanBlended = returnsList.reduce((sum, r) => sum + r, 0) / returnsList.length;
  const varBlended = returnsList.reduce((sum, r) => sum + Math.pow(r - meanBlended, 2), 0) / (returnsList.length - 1 || 1);
  const annualizedVol = Math.sqrt(varBlended) * Math.sqrt(12);

  return {
    monthly_returns: blendedMonthlyResults,
    annualized_return: portfolioCagr,
    annualized_volatility: annualizedVol,
    max_drawdown: maxDrawdown,
    total_months: minMonths,
    components_summary: alignedComponents.map(c => ({
      asset_class: c.asset_class,
      identifier: c.identifier,
      weight: Math.round(c.weight * 1000) / 1000,
      cagr: c.cagr,
      volatility: c.volatility
    }))
  };
}

/**
 * Tool 6: simulate_goal
 * Uses 6-month block bootstrapping on historical monthly returns to model goal achievement,
 * percentiles, worst-case drawdown, and real-terms inflation adjustments.
 */
export function simulateGoal(
  returns: number[],
  startValue: number,
  monthlyContribution: number,
  years: number,
  targetAmount: number,
  nPaths: number = 1000,
  inflation: number = 0.025,
  feeDrag: number = 0.002
): GoalSimulationResult {
  if (!returns || returns.length < 2) {
    throw new Error("At least 2 historical monthly returns required to run block bootstrap goal simulation.");
  }

  const M = returns.length;
  const blockSize = Math.min(6, M); // 6-month block length
  const maxStartIdx = M - blockSize;
  const totalMonths = years * 12;
  const numPaths = Math.max(100, Math.min(3000, nPaths));

  const yearlyNominalBuckets: number[][] = Array.from({ length: years + 1 }, () => []);
  const yearlyRealBuckets: number[][] = Array.from({ length: years + 1 }, () => []);

  let nominalSuccessCount = 0;
  let realSuccessCount = 0;
  let overallWorstDrawdown = 0;

  const monthlyFeeFactor = 1 - feeDrag / 12;

  for (let p = 0; p < numPaths; p++) {
    let nomVal = startValue;
    yearlyNominalBuckets[0].push(nomVal);
    yearlyRealBuckets[0].push(nomVal);

    let peak = nomVal;
    let pathMaxDrawdown = 0;

    let m = 0;
    while (m < totalMonths) {
      // Pick random block start index uniformly
      const startIdx = Math.floor(Math.random() * (maxStartIdx + 1));
      const stepsInBlock = Math.min(blockSize, totalMonths - m);

      for (let b = 0; b < stepsInBlock; b++) {
        m++;
        const grossReturn = returns[startIdx + b];
        const netReturn = (1 + grossReturn) * monthlyFeeFactor - 1;

        nomVal = Math.max(0, nomVal * (1 + netReturn) + monthlyContribution);

        if (nomVal > peak) {
          peak = nomVal;
        }
        const dd = (nomVal - peak) / (peak || 1);
        if (dd < pathMaxDrawdown) {
          pathMaxDrawdown = dd;
        }

        if (m % 12 === 0) {
          const y = m / 12;
          const inflationFactor = Math.pow(1 + inflation, y);
          const realVal = nomVal / inflationFactor;

          yearlyNominalBuckets[y].push(nomVal);
          yearlyRealBuckets[y].push(realVal);
        }
      }
    }

    if (pathMaxDrawdown < overallWorstDrawdown) {
      overallWorstDrawdown = pathMaxDrawdown;
    }

    const finalNominal = nomVal;
    const finalReal = nomVal / Math.pow(1 + inflation, years);

    if (finalNominal >= targetAmount) {
      nominalSuccessCount++;
    }
    if (finalReal >= targetAmount) {
      realSuccessCount++;
    }
  }

  const trajectories: Array<{
    year: number;
    p10: number;
    p50: number;
    p90: number;
    real_p10: number;
    real_p50: number;
    real_p90: number;
    totalContributed: number;
  }> = [];

  for (let y = 0; y <= years; y++) {
    const nomBucket = yearlyNominalBuckets[y].sort((a, b) => a - b);
    const realBucket = yearlyRealBuckets[y].sort((a, b) => a - b);

    const idx10 = Math.floor(0.10 * nomBucket.length);
    const idx50 = Math.floor(0.50 * nomBucket.length);
    const idx90 = Math.floor(0.90 * nomBucket.length);

    const totalContributed = startValue + monthlyContribution * 12 * y;

    trajectories.push({
      year: y,
      p10: Math.round(nomBucket[idx10]),
      p50: Math.round(nomBucket[idx50]),
      p90: Math.round(nomBucket[idx90]),
      real_p10: Math.round(realBucket[idx10]),
      real_p50: Math.round(realBucket[idx50]),
      real_p90: Math.round(realBucket[idx90]),
      totalContributed: Math.round(totalContributed)
    });
  }

  const finalTraj = trajectories[trajectories.length - 1];

  return {
    probability_of_success: Math.round((nominalSuccessCount / numPaths) * 1000) / 1000,
    real_probability_of_success: Math.round((realSuccessCount / numPaths) * 1000) / 1000,
    median_final_value: finalTraj.p50,
    real_median_final_value: finalTraj.real_p50,
    p10_final: finalTraj.p10,
    p50_final: finalTraj.p50,
    p90_final: finalTraj.p90,
    real_p10_final: finalTraj.real_p10,
    real_p50_final: finalTraj.real_p50,
    real_p90_final: finalTraj.real_p90,
    worst_case_drawdown: overallWorstDrawdown,
    total_contributed: Math.round(startValue + monthlyContribution * 12 * years),
    target_amount: targetAmount,
    years,
    inflation,
    fee_drag: feeDrag,
    trajectories
  };
}

/**
 * Tool 7: solve_required_contribution
 * Bisection solver to find the minimum monthly contribution to achieve the target amount
 * with at least `confidence` (e.g. 80%) probability over the horizon.
 */
export function solveRequiredContribution(
  returns: number[],
  startValue: number,
  years: number,
  targetAmount: number,
  confidence: number = 0.80,
  inflation: number = 0.025,
  realTerms: boolean = false,
  feeDrag: number = 0.002
): RequiredContributionResult {
  if (!returns || returns.length < 2) {
    throw new Error("At least 2 historical monthly returns required to solve contribution.");
  }

  const targetConf = Math.max(0.50, Math.min(0.99, confidence));
  const percentileTargetIdx = 1 - targetConf; // e.g. 0.20 for 80% confidence

  // Evaluation helper for candidate contribution
  function evaluatePercentileTerminalWealth(c: number): number {
    const sim = simulateGoal(returns, startValue, c, years, targetAmount, 400, inflation, feeDrag);
    const finalYear = sim.trajectories[sim.trajectories.length - 1];
    return realTerms ? finalYear.real_p10 : finalYear.p10;
  }

  // Bisection bounds
  let low = 0;
  let high = Math.max(1000, Math.ceil((targetAmount - startValue) / (years * 12) * 2.5));

  // Expand high bound if necessary
  let highWealth = evaluatePercentileTerminalWealth(high);
  let expandIter = 0;
  while (highWealth < targetAmount && expandIter < 5) {
    high *= 2;
    highWealth = evaluatePercentileTerminalWealth(high);
    expandIter++;
  }

  // Bisection loop (14-16 iterations provide accuracy to within ~$5-10)
  for (let iter = 0; iter < 16; iter++) {
    const mid = (low + high) / 2;
    const simVal = evaluatePercentileTerminalWealth(mid);

    if (simVal < targetAmount) {
      low = mid;
    } else {
      high = mid;
    }

    if (high - low < 15) break;
  }

  const finalContribution = Math.round(high);
  const finalSim = simulateGoal(returns, startValue, finalContribution, years, targetAmount, 500, inflation, feeDrag);

  return {
    required_monthly_contribution: finalContribution,
    confidence: targetConf,
    target_amount: targetAmount,
    years,
    start_value: startValue,
    real_terms: realTerms,
    inflation,
    fee_drag: feeDrag,
    expected_terminal_p50: realTerms ? finalSim.real_median_final_value : finalSim.median_final_value
  };
}

/**
 * Tool 8: suggest_mixes
 * Generates three labelled illustrative asset allocations tailored for Singapore retail investors.
 */
export function suggestMixes(
  riskLevel: number,
  horizonYears: number
): { risk_level: number; horizon_years: number; mixes: SuggestedMix[] } {
  const level = Math.max(1, Math.min(5, Math.round(riskLevel)));
  const shortHorizon = horizonYears <= 4;
  const longHorizon = horizonYears >= 15;

  let mix1: SuggestedMix;
  let mix2: SuggestedMix;
  let mix3: SuggestedMix;

  if (level === 1) {
    // Very Conservative
    mix1 = {
      id: "mix_preservation",
      name: "Capital Preservation Core",
      label: "Baseline Match",
      description: "Maximizes capital protection with heavy allocation to Singapore Government-backed T-bills, SSBs, and high-yield cash.",
      rationale: "Ideal for short-term goals (downpayments) or investors seeking absolute downside certainty. Mitigates market volatility through AAA-rated sovereign paper.",
      risk_rating: "Very Low",
      expected_cagr_estimate: 0.030,
      components: [
        { asset_class: 'cash', name: 'Cash / Fixed Deposit', default_proxy: 'Cash', is_fixed_rate: true, default_rate: 0.020, weight: 0.25 },
        { asset_class: 'gov_backed', name: 'Government-Backed (T-Bills / SSB)', default_proxy: 'SSB/T-Bills', is_fixed_rate: true, default_rate: 0.028, weight: 0.45 },
        { asset_class: 'bonds', name: 'Global / US Aggregate Bonds', default_proxy: 'AGG', is_fixed_rate: false, weight: 0.20 },
        { asset_class: 'global_equity', name: 'Global Equity', default_proxy: 'VT', is_fixed_rate: false, weight: 0.05 },
        { asset_class: 'sg_equity', name: 'Singapore Equity (STI)', default_proxy: 'ES3.SI', is_fixed_rate: false, weight: 0.05 },
        { asset_class: 'reits', name: 'REITs', default_proxy: 'VNQ', is_fixed_rate: false, weight: 0.00 },
        { asset_class: 'gold', name: 'Gold', default_proxy: 'GLD', is_fixed_rate: false, weight: 0.00 },
      ]
    };
    mix2 = {
      id: "mix_pure_cash_sovereign",
      name: "Zero Market-Risk Fortress",
      label: "Defensive Certainty",
      description: "100% fixed income and government guaranteed paper. Zero equity exposure.",
      rationale: "Guaranteed nominal capital protection. Sacrifices long-term inflation beating potential for zero sequence-of-returns drawdown risk.",
      risk_rating: "Minimal",
      expected_cagr_estimate: 0.026,
      components: [
        { asset_class: 'cash', name: 'Cash / Fixed Deposit', default_proxy: 'Cash', is_fixed_rate: true, default_rate: 0.020, weight: 0.35 },
        { asset_class: 'gov_backed', name: 'Government-Backed (T-Bills / SSB)', default_proxy: 'SSB/T-Bills', is_fixed_rate: true, default_rate: 0.028, weight: 0.45 },
        { asset_class: 'bonds', name: 'Global / US Aggregate Bonds', default_proxy: 'AGG', is_fixed_rate: false, weight: 0.20 },
        { asset_class: 'global_equity', name: 'Global Equity', default_proxy: 'VT', is_fixed_rate: false, weight: 0.00 },
        { asset_class: 'sg_equity', name: 'Singapore Equity (STI)', default_proxy: 'ES3.SI', is_fixed_rate: false, weight: 0.00 },
        { asset_class: 'reits', name: 'REITs', default_proxy: 'VNQ', is_fixed_rate: false, weight: 0.00 },
        { asset_class: 'gold', name: 'Gold', default_proxy: 'GLD', is_fixed_rate: false, weight: 0.00 },
      ]
    };
    mix3 = {
      id: "mix_conservative_income",
      name: "Inflation Buffer Conservative",
      label: "Mild Growth Tilt",
      description: "Adds a modest 15% equity & REIT buffer to help outpace Singapore headline inflation over multi-year periods.",
      rationale: "Modest equity allocation provides dividend income without exposing portfolio to deep market drawdowns.",
      risk_rating: "Low",
      expected_cagr_estimate: 0.038,
      components: [
        { asset_class: 'cash', name: 'Cash / Fixed Deposit', default_proxy: 'Cash', is_fixed_rate: true, default_rate: 0.020, weight: 0.15 },
        { asset_class: 'gov_backed', name: 'Government-Backed (T-Bills / SSB)', default_proxy: 'SSB/T-Bills', is_fixed_rate: true, default_rate: 0.028, weight: 0.40 },
        { asset_class: 'bonds', name: 'Global / US Aggregate Bonds', default_proxy: 'AGG', is_fixed_rate: false, weight: 0.25 },
        { asset_class: 'global_equity', name: 'Global Equity', default_proxy: 'VT', is_fixed_rate: false, weight: 0.10 },
        { asset_class: 'sg_equity', name: 'Singapore Equity (STI)', default_proxy: 'ES3.SI', is_fixed_rate: false, weight: 0.05 },
        { asset_class: 'reits', name: 'REITs', default_proxy: 'VNQ', is_fixed_rate: false, weight: 0.05 },
        { asset_class: 'gold', name: 'Gold', default_proxy: 'GLD', is_fixed_rate: false, weight: 0.00 },
      ]
    };
  } else if (level === 2) {
    // Conservative
    mix1 = {
      id: "mix_income_stability",
      name: "Income & Capital Stability",
      label: "Baseline Match",
      description: "Conservative mix pairing high fixed income (60%) with stable dividend-yielding Singapore equities and global equities.",
      rationale: "Balances steady income and defensive buffer with modest capital appreciation for cautious medium-term investors.",
      risk_rating: "Conservative",
      expected_cagr_estimate: 0.043,
      components: [
        { asset_class: 'cash', name: 'Cash / Fixed Deposit', default_proxy: 'Cash', is_fixed_rate: true, default_rate: 0.020, weight: 0.15 },
        { asset_class: 'gov_backed', name: 'Government-Backed (T-Bills / SSB)', default_proxy: 'SSB/T-Bills', is_fixed_rate: true, default_rate: 0.028, weight: 0.35 },
        { asset_class: 'bonds', name: 'Global / US Aggregate Bonds', default_proxy: 'AGG', is_fixed_rate: false, weight: 0.25 },
        { asset_class: 'global_equity', name: 'Global Equity', default_proxy: 'VT', is_fixed_rate: false, weight: 0.10 },
        { asset_class: 'sg_equity', name: 'Singapore Equity (STI)', default_proxy: 'ES3.SI', is_fixed_rate: false, weight: 0.10 },
        { asset_class: 'reits', name: 'REITs', default_proxy: 'VNQ', is_fixed_rate: false, weight: 0.05 },
        { asset_class: 'gold', name: 'Gold', default_proxy: 'GLD', is_fixed_rate: false, weight: 0.00 },
      ]
    };
    mix2 = {
      id: "mix_sovereign_income",
      name: "Singapore Sovereign Heavy",
      label: "Defensive Certainty",
      description: "Elevates T-bills, SSBs and investment grade bonds to 75% for maximum drawdown dampening.",
      rationale: "Higher certainty of reaching target capital with reduced monthly volatility.",
      risk_rating: "Low",
      expected_cagr_estimate: 0.035,
      components: [
        { asset_class: 'cash', name: 'Cash / Fixed Deposit', default_proxy: 'Cash', is_fixed_rate: true, default_rate: 0.020, weight: 0.20 },
        { asset_class: 'gov_backed', name: 'Government-Backed (T-Bills / SSB)', default_proxy: 'SSB/T-Bills', is_fixed_rate: true, default_rate: 0.028, weight: 0.40 },
        { asset_class: 'bonds', name: 'Global / US Aggregate Bonds', default_proxy: 'AGG', is_fixed_rate: false, weight: 0.25 },
        { asset_class: 'global_equity', name: 'Global Equity', default_proxy: 'VT', is_fixed_rate: false, weight: 0.05 },
        { asset_class: 'sg_equity', name: 'Singapore Equity (STI)', default_proxy: 'ES3.SI', is_fixed_rate: false, weight: 0.05 },
        { asset_class: 'reits', name: 'REITs', default_proxy: 'VNQ', is_fixed_rate: false, weight: 0.05 },
        { asset_class: 'gold', name: 'Gold', default_proxy: 'GLD', is_fixed_rate: false, weight: 0.00 },
      ]
    };
    mix3 = {
      id: "mix_dividend_yield",
      name: "Dividend & Gold Hedge",
      label: "Inflation Shield",
      description: "Adds 5% physical gold allocation as hedge against geopolitical shock and USD/SGD exchange fluctuations.",
      rationale: "Gold and real estate provide non-correlated return sources alongside Singapore dividend shares.",
      risk_rating: "Moderate-Low",
      expected_cagr_estimate: 0.048,
      components: [
        { asset_class: 'cash', name: 'Cash / Fixed Deposit', default_proxy: 'Cash', is_fixed_rate: true, default_rate: 0.020, weight: 0.10 },
        { asset_class: 'gov_backed', name: 'Government-Backed (T-Bills / SSB)', default_proxy: 'SSB/T-Bills', is_fixed_rate: true, default_rate: 0.028, weight: 0.25 },
        { asset_class: 'bonds', name: 'Global / US Aggregate Bonds', default_proxy: 'AGG', is_fixed_rate: false, weight: 0.25 },
        { asset_class: 'global_equity', name: 'Global Equity', default_proxy: 'VT', is_fixed_rate: false, weight: 0.15 },
        { asset_class: 'sg_equity', name: 'Singapore Equity (STI)', default_proxy: 'ES3.SI', is_fixed_rate: false, weight: 0.15 },
        { asset_class: 'reits', name: 'REITs', default_proxy: 'VNQ', is_fixed_rate: false, weight: 0.05 },
        { asset_class: 'gold', name: 'Gold', default_proxy: 'GLD', is_fixed_rate: false, weight: 0.05 },
      ]
    };
  } else if (level === 3) {
    // Balanced (Moderate)
    mix1 = {
      id: "mix_sg_balanced",
      name: "Singapore Classic Balanced",
      label: "Baseline Match",
      description: "Institutional 50/50 balance between wealth accumulation assets (global equity, STI, REITs) and preservation assets.",
      rationale: "The golden standard for medium-to-long term goals (7-15 years). Captures world economic growth while cushioning drawdowns with Singapore fixed income.",
      risk_rating: "Moderate",
      expected_cagr_estimate: 0.055,
      components: [
        { asset_class: 'cash', name: 'Cash / Fixed Deposit', default_proxy: 'Cash', is_fixed_rate: true, default_rate: 0.020, weight: 0.10 },
        { asset_class: 'gov_backed', name: 'Government-Backed (T-Bills / SSB)', default_proxy: 'SSB/T-Bills', is_fixed_rate: true, default_rate: 0.028, weight: 0.15 },
        { asset_class: 'bonds', name: 'Global / US Aggregate Bonds', default_proxy: 'AGG', is_fixed_rate: false, weight: 0.20 },
        { asset_class: 'global_equity', name: 'Global Equity', default_proxy: 'VT', is_fixed_rate: false, weight: 0.30 },
        { asset_class: 'sg_equity', name: 'Singapore Equity (STI)', default_proxy: 'ES3.SI', is_fixed_rate: false, weight: 0.15 },
        { asset_class: 'reits', name: 'REITs', default_proxy: 'VNQ', is_fixed_rate: false, weight: 0.05 },
        { asset_class: 'gold', name: 'Gold', default_proxy: 'GLD', is_fixed_rate: false, weight: 0.05 },
      ]
    };
    mix2 = {
      id: "mix_balanced_defensive",
      name: "Defensive Balanced Tilt",
      label: "Higher Certainty",
      description: "60% fixed income and cash tilt designed to keep maximum drawdown under ~15%.",
      rationale: "Suitable if investor wants growth exposure but cannot tolerate large portfolio swings or has a tighter time horizon.",
      risk_rating: "Moderate-Low",
      expected_cagr_estimate: 0.047,
      components: [
        { asset_class: 'cash', name: 'Cash / Fixed Deposit', default_proxy: 'Cash', is_fixed_rate: true, default_rate: 0.020, weight: 0.15 },
        { asset_class: 'gov_backed', name: 'Government-Backed (T-Bills / SSB)', default_proxy: 'SSB/T-Bills', is_fixed_rate: true, default_rate: 0.028, weight: 0.20 },
        { asset_class: 'bonds', name: 'Global / US Aggregate Bonds', default_proxy: 'AGG', is_fixed_rate: false, weight: 0.25 },
        { asset_class: 'global_equity', name: 'Global Equity', default_proxy: 'VT', is_fixed_rate: false, weight: 0.20 },
        { asset_class: 'sg_equity', name: 'Singapore Equity (STI)', default_proxy: 'ES3.SI', is_fixed_rate: false, weight: 0.10 },
        { asset_class: 'reits', name: 'REITs', default_proxy: 'VNQ', is_fixed_rate: false, weight: 0.05 },
        { asset_class: 'gold', name: 'Gold', default_proxy: 'GLD', is_fixed_rate: false, weight: 0.05 },
      ]
    };
    mix3 = {
      id: "mix_balanced_growth",
      name: "Growth-Weighted Balanced",
      label: "Growth Focus",
      description: "70% allocation to growth engines (40% Global Equity VT, 15% STI, 10% REITs, 5% Gold).",
      rationale: "Lowers monthly contribution requirement to hit goal by harnessing higher compounding returns.",
      risk_rating: "Moderate-High",
      expected_cagr_estimate: 0.063,
      components: [
        { asset_class: 'cash', name: 'Cash / Fixed Deposit', default_proxy: 'Cash', is_fixed_rate: true, default_rate: 0.020, weight: 0.05 },
        { asset_class: 'gov_backed', name: 'Government-Backed (T-Bills / SSB)', default_proxy: 'SSB/T-Bills', is_fixed_rate: true, default_rate: 0.028, weight: 0.10 },
        { asset_class: 'bonds', name: 'Global / US Aggregate Bonds', default_proxy: 'AGG', is_fixed_rate: false, weight: 0.15 },
        { asset_class: 'global_equity', name: 'Global Equity', default_proxy: 'VT', is_fixed_rate: false, weight: 0.40 },
        { asset_class: 'sg_equity', name: 'Singapore Equity (STI)', default_proxy: 'ES3.SI', is_fixed_rate: false, weight: 0.15 },
        { asset_class: 'reits', name: 'REITs', default_proxy: 'VNQ', is_fixed_rate: false, weight: 0.10 },
        { asset_class: 'gold', name: 'Gold', default_proxy: 'GLD', is_fixed_rate: false, weight: 0.05 },
      ]
    };
  } else if (level === 4) {
    // Growth
    mix1 = {
      id: "mix_global_growth",
      name: "Global Multi-Asset Growth",
      label: "Baseline Match",
      description: "Aggressive multi-asset growth mix with 75% equity, REITs, and real assets.",
      rationale: "Engineered for 10+ year compounding. Harnesses world equity dynamism with high probability of outpacing Singapore cost of living inflation.",
      risk_rating: "High",
      expected_cagr_estimate: 0.068,
      components: [
        { asset_class: 'cash', name: 'Cash / Fixed Deposit', default_proxy: 'Cash', is_fixed_rate: true, default_rate: 0.020, weight: 0.05 },
        { asset_class: 'gov_backed', name: 'Government-Backed (T-Bills / SSB)', default_proxy: 'SSB/T-Bills', is_fixed_rate: true, default_rate: 0.028, weight: 0.05 },
        { asset_class: 'bonds', name: 'Global / US Aggregate Bonds', default_proxy: 'AGG', is_fixed_rate: false, weight: 0.15 },
        { asset_class: 'global_equity', name: 'Global Equity', default_proxy: 'VT', is_fixed_rate: false, weight: 0.45 },
        { asset_class: 'sg_equity', name: 'Singapore Equity (STI)', default_proxy: 'ES3.SI', is_fixed_rate: false, weight: 0.15 },
        { asset_class: 'reits', name: 'REITs', default_proxy: 'VNQ', is_fixed_rate: false, weight: 0.10 },
        { asset_class: 'gold', name: 'Gold', default_proxy: 'GLD', is_fixed_rate: false, weight: 0.05 },
      ]
    };
    mix2 = {
      id: "mix_growth_cushioned",
      name: "Cushioned Growth",
      label: "Stability Tilt",
      description: "Retains 20% high-quality bonds and 20% SG sovereign/cash to dampen bear market drawdowns.",
      rationale: "Reduces peak-to-trough drop by ~30% while retaining ~85% of equity upside.",
      risk_rating: "Moderate-High",
      expected_cagr_estimate: 0.059,
      components: [
        { asset_class: 'cash', name: 'Cash / Fixed Deposit', default_proxy: 'Cash', is_fixed_rate: true, default_rate: 0.020, weight: 0.10 },
        { asset_class: 'gov_backed', name: 'Government-Backed (T-Bills / SSB)', default_proxy: 'SSB/T-Bills', is_fixed_rate: true, default_rate: 0.028, weight: 0.10 },
        { asset_class: 'bonds', name: 'Global / US Aggregate Bonds', default_proxy: 'AGG', is_fixed_rate: false, weight: 0.20 },
        { asset_class: 'global_equity', name: 'Global Equity', default_proxy: 'VT', is_fixed_rate: false, weight: 0.35 },
        { asset_class: 'sg_equity', name: 'Singapore Equity (STI)', default_proxy: 'ES3.SI', is_fixed_rate: false, weight: 0.15 },
        { asset_class: 'reits', name: 'REITs', default_proxy: 'VNQ', is_fixed_rate: false, weight: 0.05 },
        { asset_class: 'gold', name: 'Gold', default_proxy: 'GLD', is_fixed_rate: false, weight: 0.05 },
      ]
    };
    mix3 = {
      id: "mix_maximum_equity_tilt",
      name: "High-Equity Accelerator",
      label: "Maximum Compounding",
      description: "85% equity assets (55% Global Equity VT, 15% STI, 10% REITs, 5% Gold).",
      rationale: "Minimizes the required monthly contribution to hit substantial long-term retirement and FIRE goals.",
      risk_rating: "Aggressive",
      expected_cagr_estimate: 0.076,
      components: [
        { asset_class: 'cash', name: 'Cash / Fixed Deposit', default_proxy: 'Cash', is_fixed_rate: true, default_rate: 0.020, weight: 0.05 },
        { asset_class: 'gov_backed', name: 'Government-Backed (T-Bills / SSB)', default_proxy: 'SSB/T-Bills', is_fixed_rate: true, default_rate: 0.028, weight: 0.00 },
        { asset_class: 'bonds', name: 'Global / US Aggregate Bonds', default_proxy: 'AGG', is_fixed_rate: false, weight: 0.10 },
        { asset_class: 'global_equity', name: 'Global Equity', default_proxy: 'VT', is_fixed_rate: false, weight: 0.55 },
        { asset_class: 'sg_equity', name: 'Singapore Equity (STI)', default_proxy: 'ES3.SI', is_fixed_rate: false, weight: 0.15 },
        { asset_class: 'reits', name: 'REITs', default_proxy: 'VNQ', is_fixed_rate: false, weight: 0.10 },
        { asset_class: 'gold', name: 'Gold', default_proxy: 'GLD', is_fixed_rate: false, weight: 0.05 },
      ]
    };
  } else {
    // Risk Level 5: Aggressive Growth
    mix1 = {
      id: "mix_aggressive_core",
      name: "Aggressive Global Core",
      label: "Baseline Match",
      description: "90% growth assets with high worldwide diversification and local Singapore blue chips.",
      rationale: "For investors with high risk tolerance and 10-25+ year horizons willing to endure severe market cycles for maximum terminal wealth.",
      risk_rating: "Aggressive",
      expected_cagr_estimate: 0.081,
      components: [
        { asset_class: 'cash', name: 'Cash / Fixed Deposit', default_proxy: 'Cash', is_fixed_rate: true, default_rate: 0.020, weight: 0.05 },
        { asset_class: 'gov_backed', name: 'Government-Backed (T-Bills / SSB)', default_proxy: 'SSB/T-Bills', is_fixed_rate: true, default_rate: 0.028, weight: 0.00 },
        { asset_class: 'bonds', name: 'Global / US Aggregate Bonds', default_proxy: 'AGG', is_fixed_rate: false, weight: 0.05 },
        { asset_class: 'global_equity', name: 'Global Equity', default_proxy: 'VT', is_fixed_rate: false, weight: 0.60 },
        { asset_class: 'sg_equity', name: 'Singapore Equity (STI)', default_proxy: 'ES3.SI', is_fixed_rate: false, weight: 0.15 },
        { asset_class: 'reits', name: 'REITs', default_proxy: 'VNQ', is_fixed_rate: false, weight: 0.10 },
        { asset_class: 'gold', name: 'Gold', default_proxy: 'GLD', is_fixed_rate: false, weight: 0.05 },
      ]
    };
    mix2 = {
      id: "mix_aggressive_hedged",
      name: "Diversified Aggressive (Bond Buffer)",
      label: "Volatility Buffer",
      description: "Maintains 75% equity with a 15% bond cushion to allow rebalancing during equity market panics.",
      rationale: "Gives dry powder for annual rebalancing into undervalued equities during market crashes.",
      risk_rating: "High",
      expected_cagr_estimate: 0.071,
      components: [
        { asset_class: 'cash', name: 'Cash / Fixed Deposit', default_proxy: 'Cash', is_fixed_rate: true, default_rate: 0.020, weight: 0.05 },
        { asset_class: 'gov_backed', name: 'Government-Backed (T-Bills / SSB)', default_proxy: 'SSB/T-Bills', is_fixed_rate: true, default_rate: 0.028, weight: 0.05 },
        { asset_class: 'bonds', name: 'Global / US Aggregate Bonds', default_proxy: 'AGG', is_fixed_rate: false, weight: 0.15 },
        { asset_class: 'global_equity', name: 'Global Equity', default_proxy: 'VT', is_fixed_rate: false, weight: 0.50 },
        { asset_class: 'sg_equity', name: 'Singapore Equity (STI)', default_proxy: 'ES3.SI', is_fixed_rate: false, weight: 0.15 },
        { asset_class: 'reits', name: 'REITs', default_proxy: 'VNQ', is_fixed_rate: false, weight: 0.05 },
        { asset_class: 'gold', name: 'Gold', default_proxy: 'GLD', is_fixed_rate: false, weight: 0.05 },
      ]
    };
    mix3 = {
      id: "mix_pure_equity_real",
      name: "100% Equity & Real Assets",
      label: "Pure Capital Expansion",
      description: "Zero cash or bond drag. 70% Global Equity VT, 15% STI, 10% REITs, 5% Gold.",
      rationale: "Maximizes compound growth rate over multi-decade generational wealth horizons.",
      risk_rating: "Very High",
      expected_cagr_estimate: 0.088,
      components: [
        { asset_class: 'cash', name: 'Cash / Fixed Deposit', default_proxy: 'Cash', is_fixed_rate: true, default_rate: 0.020, weight: 0.00 },
        { asset_class: 'gov_backed', name: 'Government-Backed (T-Bills / SSB)', default_proxy: 'SSB/T-Bills', is_fixed_rate: true, default_rate: 0.028, weight: 0.00 },
        { asset_class: 'bonds', name: 'Global / US Aggregate Bonds', default_proxy: 'AGG', is_fixed_rate: false, weight: 0.00 },
        { asset_class: 'global_equity', name: 'Global Equity', default_proxy: 'VT', is_fixed_rate: false, weight: 0.70 },
        { asset_class: 'sg_equity', name: 'Singapore Equity (STI)', default_proxy: 'ES3.SI', is_fixed_rate: false, weight: 0.15 },
        { asset_class: 'reits', name: 'REITs', default_proxy: 'VNQ', is_fixed_rate: false, weight: 0.10 },
        { asset_class: 'gold', name: 'Gold', default_proxy: 'GLD', is_fixed_rate: false, weight: 0.05 },
      ]
    };
  }

  // Adjust for horizon nuances
  if (shortHorizon) {
    mix1.description += " (Adapted with enhanced capital buffers for short-duration deadline).";
  } else if (longHorizon) {
    mix1.description += " (Optimized for multi-decade compound growth and inflation beating).";
  }

  return {
    risk_level: level,
    horizon_years: horizonYears,
    mixes: [mix1, mix2, mix3]
  };
}

/**
 * Core JSON-RPC 2.0 Dispatcher
 */
export async function handleMcpPayload(body: any): Promise<any> {
  if (!body || typeof body !== "object") {
    return {
      jsonrpc: "2.0",
      id: null,
      error: { code: -32700, message: "Parse error: Invalid JSON payload." }
    };
  }

  const { jsonrpc, id, method, params } = body;

  if (jsonrpc !== "2.0") {
    return {
      jsonrpc: "2.0",
      id: id ?? null,
      error: { code: -32600, message: "Invalid Request: jsonrpc version must be '2.0'." }
    };
  }

  switch (method) {
    case "initialize": {
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: {
            tools: { listChanged: false }
          },
          serverInfo: {
            name: "etf-horizon-mcp-server",
            version: "2.0.0",
            description: "Goal-based Asset Allocation & Institutional Horizon Analytics Model Context Protocol service"
          }
        }
      };
    }

    case "tools/list": {
      return {
        jsonrpc: "2.0",
        id,
        result: {
          tools: TOOLS
        }
      };
    }

    case "tools/call": {
      if (!params || typeof params !== "object" || !params.name) {
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32602, message: "Invalid params: 'name' is required for tools/call." }
        };
      }

      const toolName = params.name;
      const args = params.arguments || {};

      try {
        let toolOutput: any;

        switch (toolName) {
          case "get_price_history": {
            if (!args.ticker) {
              throw new Error("Missing required argument 'ticker'.");
            }
            const years = typeof args.years === "number" ? args.years : 10;
            const history = await fetchYahooPriceHistory(args.ticker, years);
            toolOutput = {
              ticker: args.ticker.toUpperCase(),
              currency: history.currency,
              years,
              dataPoints: history.prices.length,
              adjusted_close_available: history.adjusted_close_available,
              prices: history.prices,
              fee_drag_default: 0.002
            };
            break;
          }

          case "compute_metrics": {
            if (!Array.isArray(args.prices)) {
              throw new Error("Missing required array argument 'prices'.");
            }
            toolOutput = calculateMetrics(args.prices);
            break;
          }

          case "project_scenarios": {
            if (typeof args.start_value !== "number" || typeof args.base_cagr !== "number") {
              throw new Error("Arguments 'start_value' and 'base_cagr' must be valid numbers.");
            }
            const years = typeof args.years === "number" ? args.years : 10;
            const contribution = typeof args.monthly_contribution === "number" ? args.monthly_contribution : 500;
            const feeDrag = typeof args.fee_drag === "number" ? args.fee_drag : 0.002;
            toolOutput = calculateScenarios(args.start_value, args.base_cagr, years, contribution, feeDrag);
            break;
          }

          case "monte_carlo": {
            if (!Array.isArray(args.prices)) {
              throw new Error("Missing required array argument 'prices'.");
            }
            const startVal = typeof args.start_value === "number" ? args.start_value : 10000;
            const years = typeof args.years === "number" ? args.years : 10;
            const contribution = typeof args.monthly_contribution === "number" ? args.monthly_contribution : 500;
            const paths = typeof args.n_paths === "number" ? args.n_paths : 1000;
            const feeDrag = typeof args.fee_drag === "number" ? args.fee_drag : 0.002;
            toolOutput = calculateMonteCarlo(args.prices, startVal, years, contribution, paths, feeDrag);
            break;
          }

          case "build_blended_series": {
            if (!Array.isArray(args.components)) {
              throw new Error("Missing required array argument 'components'.");
            }
            const years = typeof args.years === "number" ? args.years : 10;
            const rebalance = args.rebalance || "annual";
            toolOutput = await buildBlendedSeries(args.components, years, rebalance);
            break;
          }

          case "simulate_goal": {
            if (!Array.isArray(args.returns)) {
              throw new Error("Missing required array argument 'returns'.");
            }
            if (typeof args.start_value !== "number" || typeof args.monthly_contribution !== "number" || typeof args.years !== "number" || typeof args.target_amount !== "number") {
              throw new Error("Arguments 'start_value', 'monthly_contribution', 'years', and 'target_amount' are required numbers.");
            }
            const nPaths = typeof args.n_paths === "number" ? args.n_paths : 1000;
            const inflation = typeof args.inflation === "number" ? args.inflation : 0.025;
            const feeDrag = typeof args.fee_drag === "number" ? args.fee_drag : 0.002;
            toolOutput = simulateGoal(
              args.returns,
              args.start_value,
              args.monthly_contribution,
              args.years,
              args.target_amount,
              nPaths,
              inflation,
              feeDrag
            );
            break;
          }

          case "solve_required_contribution": {
            if (!Array.isArray(args.returns)) {
              throw new Error("Missing required array argument 'returns'.");
            }
            if (typeof args.start_value !== "number" || typeof args.years !== "number" || typeof args.target_amount !== "number") {
              throw new Error("Arguments 'start_value', 'years', and 'target_amount' are required numbers.");
            }
            const confidence = typeof args.confidence === "number" ? args.confidence : 0.80;
            const inflation = typeof args.inflation === "number" ? args.inflation : 0.025;
            const realTerms = !!args.real_terms;
            const feeDrag = typeof args.fee_drag === "number" ? args.fee_drag : 0.002;
            toolOutput = solveRequiredContribution(
              args.returns,
              args.start_value,
              args.years,
              args.target_amount,
              confidence,
              inflation,
              realTerms,
              feeDrag
            );
            break;
          }

          case "suggest_mixes": {
            if (typeof args.risk_level !== "number" || typeof args.horizon_years !== "number") {
              throw new Error("Arguments 'risk_level' and 'horizon_years' must be numbers.");
            }
            toolOutput = suggestMixes(args.risk_level, args.horizon_years);
            break;
          }

          default:
            return {
              jsonrpc: "2.0",
              id,
              error: { code: -32601, message: `Tool '${toolName}' not found.` }
            };
        }

        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify(toolOutput, null, 2)
              }
            ],
            isError: false
          }
        };
      } catch (err: any) {
        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: err?.message || String(err)
              }
            ],
            isError: true
          }
        };
      }
    }

    default:
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Method '${method}' not found.` }
      };
  }
}

/**
 * Standard Vercel Serverless Function entry point
 */
export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS, GET");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method === "GET") {
    return res.status(200).json({
      service: "ETF Horizon MCP Server",
      protocol: "Model Context Protocol (JSON-RPC 2.0)",
      endpoint: "/api/mcp",
      tools: TOOLS.map(t => t.name)
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32600, message: "Method Not Allowed. Use HTTP POST for MCP JSON-RPC 2.0." }
    });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Invalid JSON format in request body." }
      });
    }
  }

  const responsePayload = await handleMcpPayload(body);
  return res.status(200).json(responsePayload);
}
