/**
 * ETF Horizon - MCP Serverless Handler
 * Implements stateless JSON-RPC 2.0 over HTTP POST for Model Context Protocol (MCP).
 * Public data provider: Yahoo Finance public chart endpoint (NO API keys or env vars needed)
 * with verified fallback benchmarks for resilient zero-failure execution.
 * 
 * Exposes 9 tools:
 * 1. get_price_history: dividend-adjusted total returns, raw close, currency & status
 * 2. compute_metrics: CAGR, annualized volatility, max drawdown
 * 3. project_scenarios: deterministic 5-scenario wealth projections
 * 4. monte_carlo: stochastic GBM trajectory percentiles with optional seed
 * 5. build_blended_series: monthly blended return series with annual rebalancing and FX conversion
 * 6. simulate_goal: 6-month block bootstrap simulation with nominal & real-terms percentiles and unit return drawdown
 * 7. solve_required_contribution: bisection solver for required monthly contribution at target probability confidence
 * 8. suggest_mixes: illustrative asset allocations with deterministic horizon glide rule
 * 9. plan_goal: consolidated server-side pipeline for goal planning & evaluation
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
  seed: number;
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
  start_date: string;
  end_date: string;
  aligned_months: number;
  base_currency: string;
  warnings?: string[];
  components_summary: Array<{
    asset_class: string;
    identifier: string;
    weight: number;
    cagr: number;
    volatility: number;
    currency?: string;
    fx_applied?: boolean;
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
  drawdown_median: number;
  drawdown_p95: number;
  worst_case_drawdown: number; // Mapped to drawdown_p95 for backwards compatibility
  total_contributed: number;
  target_amount: number;
  years: number;
  inflation: number;
  fee_drag: number;
  seed: number;
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
  achieved_probability: number;
  confidence: number;
  achievable: boolean;
  target_amount: number;
  years: number;
  start_value: number;
  real_terms: boolean;
  inflation: number;
  fee_drag: number;
  seed: number;
  expected_terminal_p50: number;
}

export interface SuggestedMixComponent {
  asset_class: 'cash' | 'gov_backed' | 'bonds' | 'global_equity' | 'sg_equity' | 'reits' | 'gold';
  name: string;
  default_proxy: string;
  is_fixed_rate: boolean;
  default_rate?: number;
  weight: number;
}

export interface SuggestedMix {
  id: string;
  name: string;
  label: string;
  description: string;
  rationale: string;
  risk_rating: string;
  horizon_adjustment: number; // percentage points shifted
  components: SuggestedMixComponent[];
}

export interface PlanGoalMixResult {
  mix_id: string;
  name: string;
  label: string;
  description: string;
  rationale: string;
  risk_rating: string;
  weights: Record<string, number>;
  horizon_adjustment?: number;
  historical_blended_cagr: number;
  historical_annualized_volatility: number;
  data_window: {
    start_date: string;
    end_date: string;
    total_months: number;
  };
  probability_of_success: number;
  real_probability_of_success: number;
  median_final_value: number;
  p10_final: number;
  p90_final: number;
  real_median_final_value: number;
  real_p10_final: number;
  real_p90_final: number;
  yearly_trajectory: Array<{
    year: number;
    p10: number;
    p50: number;
    p90: number;
    real_p10: number;
    real_p50: number;
    real_p90: number;
    totalContributed: number;
  }>;
  drawdown_median: number;
  drawdown_p95: number;
  required_monthly_contribution: number;
  achieved_probability: number;
  achievable: boolean;
}

export interface PlanGoalResult {
  mixes: PlanGoalMixResult[];
  sources: string[];
  as_of: string;
  warnings: string[];
  disclaimer: string;
}

// PRNG: Mulberry32 implementation
export function createMulberry32(seed: number = 42) {
  let s = Math.trunc(seed) >>> 0;
  return function next(): number {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// In-memory cache for Yahoo price and FX queries with 1-hour TTL
interface CacheEntry {
  data: {
    currency: string;
    adjusted_close_available: boolean;
    prices: PricePoint[];
    source: 'yahoo' | 'benchmark_snapshot';
    as_of: string;
    warning?: string;
  };
  timestamp: number;
}
const priceCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// Standard disclaimer text
export const STANDARD_DISCLAIMER =
  "Illustrative scenarios based on past data and stated assumptions. Not personalised financial advice. Past performance does not guarantee future results.";

// Tool Definitions with JSON Schemas & Annotations
export const TOOLS = [
  {
    name: "get_price_history",
    description: "Fetch monthly dividend-adjusted (total return) and raw closing prices with currency from Yahoo Finance public chart endpoint. Decides adjusted vs raw consistently and excludes the incomplete current month.",
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
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: true
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
          description: "Chronological monthly price series (2-600 points)"
        }
      },
      required: ["prices"]
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false
    }
  },
  {
    name: "project_scenarios",
    description: "Compute forward deterministic wealth projections across five scenarios with CAGR adjusted relative to base (-20%, -10%, base, +10%, +20%) with monthly contributions and annual fee drag (default 0.002).",
    inputSchema: {
      type: "object",
      properties: {
        start_value: {
          type: "number",
          description: "Initial investment capital"
        },
        base_cagr: {
          type: "number",
          description: "Base annual growth rate decimal (e.g. 0.06 for 6.0%)"
        },
        years: {
          type: "number",
          description: "Forward projection horizon in years (1-30, default 10)",
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
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false
    }
  },
  {
    name: "monte_carlo",
    description: "Simulate forward portfolio paths from historical monthly returns using Monte Carlo Geometric Brownian Motion and extract 10th, 50th, and 90th percentile trajectories. Accepts an optional integer seed.",
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
          description: "Historical price series (2-600 points)"
        },
        start_value: {
          type: "number",
          description: "Starting portfolio capital (default 10000)",
          default: 10000
        },
        years: {
          type: "number",
          description: "Forward simulation horizon in years (1-30, default 10)",
          default: 10
        },
        monthly_contribution: {
          type: "number",
          description: "Monthly contribution amount (default 500)",
          default: 500
        },
        n_paths: {
          type: "number",
          description: "Number of simulated paths (default 1000, max 3000)",
          default: 1000
        },
        fee_drag: {
          type: "number",
          description: "Annual fee drag decimal (default 0.002)",
          default: 0.002
        },
        seed: {
          type: "number",
          description: "Optional PRNG integer seed (default 42)",
          default: 42
        }
      },
      required: ["prices"]
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false
    }
  },
  {
    name: "build_blended_series",
    description: "Combines asset components (market proxies and fixed-rate assets) with target weights into a monthly blended return series. Aligns market components by calendar month (YYYY-MM intersection), converts foreign currencies to base_currency via monthly FX, and rebalances annually.",
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
              weight: { type: "number", description: "Target asset allocation weight decimal" },
              prices: { type: "array", description: "Optional preloaded price series" }
            },
            required: ["asset_class", "weight"]
          },
          description: "List of portfolio building block components (1-10)"
        },
        years: {
          type: "number",
          description: "Historical horizon duration in years (1-30, default 10)",
          default: 10
        },
        rebalance: {
          type: "string",
          description: "Rebalancing frequency ('annual' default)",
          default: "annual"
        },
        base_currency: {
          type: "string",
          description: "Base currency for valuation and returns (default 'SGD')",
          default: "SGD"
        }
      },
      required: ["components"]
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: true
    }
  },
  {
    name: "simulate_goal",
    description: "Simulates forward goal feasibility using a 6-month block bootstrap with seeded PRNG. Computes drawdown on a unit return index (without contributions), returning drawdown_median, drawdown_p95, and nominal/real success percentiles.",
    inputSchema: {
      type: "object",
      properties: {
        returns: {
          type: "array",
          items: { type: "number" },
          description: "Chronological monthly decimal return series (12-600 numbers > -1)"
        },
        start_value: {
          type: "number",
          description: "Starting portfolio capital"
        },
        monthly_contribution: {
          type: "number",
          description: "Monthly savings contribution"
        },
        years: {
          type: "number",
          description: "Forward goal horizon in years (1-30)"
        },
        target_amount: {
          type: "number",
          description: "Target wealth goal amount (> 0)"
        },
        n_paths: {
          type: "number",
          description: "Number of bootstrap paths (default 1000, 100-3000)",
          default: 1000
        },
        inflation: {
          type: "number",
          description: "Annual inflation rate decimal (default 0.025 for 2.5%)",
          default: 0.025
        },
        fee_drag: {
          type: "number",
          description: "Annual fee drag decimal (default 0.002 for 0.2%)",
          default: 0.002
        },
        seed: {
          type: "number",
          description: "Optional PRNG integer seed (default 42)",
          default: 42
        }
      },
      required: ["returns", "start_value", "monthly_contribution", "years", "target_amount"]
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false
    }
  },
  {
    name: "solve_required_contribution",
    description: "Determines the minimum monthly contribution required to achieve P(final >= target) >= confidence using bisection with common random numbers. Returns achievable=false if confidence is unachievable.",
    inputSchema: {
      type: "object",
      properties: {
        returns: {
          type: "array",
          items: { type: "number" },
          description: "Monthly decimal return series (12-600 numbers > -1)"
        },
        start_value: {
          type: "number",
          description: "Starting portfolio capital (>= 0)"
        },
        years: {
          type: "number",
          description: "Horizon in years (1-30)"
        },
        target_amount: {
          type: "number",
          description: "Target wealth goal amount (> 0)"
        },
        confidence: {
          type: "number",
          description: "Target probability confidence decimal (0.50-0.99, default 0.80)",
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
        },
        seed: {
          type: "number",
          description: "Optional PRNG integer seed (default 42)",
          default: 42
        }
      },
      required: ["returns", "start_value", "years", "target_amount"]
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false
    }
  },
  {
    name: "suggest_mixes",
    description: "Generates three labelled illustrative asset allocations tailored for Singapore retail investors. Applies a deterministic horizon glide rule (horizon <=3 shifts 40% equity/reits/gold into gov/cash; 4-5 shifts 20%). Output percentages are calculated dynamically from weights.",
    inputSchema: {
      type: "object",
      properties: {
        risk_level: {
          type: "number",
          description: "Risk comfort level from 1 (Very Conservative) to 5 (Aggressive Growth)"
        },
        horizon_years: {
          type: "number",
          description: "Investment time horizon in years (1-30)"
        }
      },
      required: ["risk_level", "horizon_years"]
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false
    }
  },
  {
    name: "plan_goal",
    description: "Consolidated server-side planning tool. Evaluates goal feasibility across suggested mixes or custom components in one call: fetches data, converts currencies, builds blended series, simulates paths, and solves required contribution.",
    inputSchema: {
      type: "object",
      properties: {
        start_value: { type: "number", description: "Starting portfolio capital (>= 0)" },
        monthly_contribution: { type: "number", description: "Monthly contribution amount (>= 0)" },
        years: { type: "number", description: "Goal horizon in years (1-30)" },
        target_amount: { type: "number", description: "Target wealth goal amount (> 0)" },
        confidence: { type: "number", description: "Confidence level decimal (0.50-0.99, default 0.80)", default: 0.80 },
        inflation: { type: "number", description: "Annual inflation rate decimal (default 0.025)", default: 0.025 },
        fee_drag: { type: "number", description: "Annual fee drag decimal (default 0.002)", default: 0.002 },
        base_currency: { type: "string", description: "Base currency (default 'SGD')", default: "SGD" },
        seed: { type: "number", description: "PRNG seed (default 42)", default: 42 },
        risk_level: { type: "number", description: "Optional risk level (1-5) to evaluate all 3 suggested mixes" },
        components: {
          type: "array",
          items: {
            type: "object",
            properties: {
              asset_class: { type: "string" },
              ticker: { type: "string" },
              fixed_rate: { type: "number" },
              weight: { type: "number" }
            },
            required: ["asset_class", "weight"]
          },
          description: "Optional custom components to evaluate"
        }
      },
      required: ["start_value", "monthly_contribution", "years", "target_amount"]
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: true
    }
  }
];

// Helper: Yahoo Finance public fetcher with benchmark fallback & timeout
export async function fetchYahooPriceHistory(
  ticker: string,
  years: number = 10
): Promise<{
  currency: string;
  adjusted_close_available: boolean;
  prices: PricePoint[];
  source: 'yahoo' | 'benchmark_snapshot';
  as_of: string;
  warning?: string;
}> {
  const cleanTicker = ticker.trim().toUpperCase();
  if (!cleanTicker) {
    throw new Error("Ticker symbol cannot be empty.");
  }

  const range = years <= 5 ? "5y" : "10y";
  const cacheKey = `${cleanTicker}_${range}`;
  const cached = priceCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

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
  const currentYM = new Date().toISOString().slice(0, 7); // current incomplete month

  for (const url of urls) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout

    try {
      const response = await fetch(url, { headers, signal: controller.signal });
      clearTimeout(timeoutId);

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

      // Check adjusted vs raw once per series:
      // Count valid adjclose points
      let validAdjCount = 0;
      for (const val of adjCloses) {
        if (typeof val === "number" && !isNaN(val) && val > 0) {
          validAdjCount++;
        }
      }

      // If adjclose is present for essentially all points (>= 90%), use adjusted for all points.
      // Otherwise use raw close for all points. Never mix bases within a series.
      const useAdjusted = validAdjCount >= Math.floor(timestamps.length * 0.90) && validAdjCount > 0;

      const rawPoints: PricePoint[] = [];

      for (let i = 0; i < timestamps.length; i++) {
        const t = timestamps[i];
        const rawQuote = quoteCloses[i];
        const rawAdj = adjCloses[i];

        const dateStr = new Date(t * 1000).toISOString().slice(0, 10);
        // Phase 1.6: Drop the last data point if it belongs to current incomplete month
        if (dateStr.slice(0, 7) === currentYM && i === timestamps.length - 1) {
          continue;
        }

        let chosenClose: number | null = null;
        if (useAdjusted) {
          if (typeof rawAdj === "number" && !isNaN(rawAdj) && rawAdj > 0) {
            chosenClose = rawAdj;
          } else if (typeof rawQuote === "number" && !isNaN(rawQuote) && rawQuote > 0) {
            chosenClose = rawQuote;
          }
        } else {
          if (typeof rawQuote === "number" && !isNaN(rawQuote) && rawQuote > 0) {
            chosenClose = rawQuote;
          }
        }

        if (chosenClose !== null && chosenClose > 0) {
          rawPoints.push({
            date: dateStr,
            close: Math.round(chosenClose * 10000) / 10000,
            raw_close: typeof rawQuote === "number" ? Math.round(rawQuote * 10000) / 10000 : undefined,
            adj_close: typeof rawAdj === "number" ? Math.round(rawAdj * 10000) / 10000 : undefined,
            is_adjusted: useAdjusted
          });
        }
      }

      // Sort chronologically ascending
      rawPoints.sort((a, b) => a.date.localeCompare(b.date));

      const targetPoints = years * 12 + 1;
      const finalPoints = rawPoints.length > targetPoints ? rawPoints.slice(-targetPoints) : rawPoints;

      if (finalPoints.length < 2) {
        throw new Error(`Insufficient monthly price observations (${finalPoints.length}) found for ${cleanTicker}.`);
      }

      const result = {
        currency,
        adjusted_close_available: useAdjusted,
        prices: finalPoints,
        source: 'yahoo' as const,
        as_of: finalPoints[finalPoints.length - 1].date
      };

      priceCache.set(cacheKey, { data: result, timestamp: Date.now() });
      return result;
    } catch (err: any) {
      clearTimeout(timeoutId);
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  // Graceful fallback to verified benchmark series if Yahoo API fails or is rate-limited
  const benchmark = BENCHMARKS[cleanTicker];
  if (benchmark) {
    const parsed = parseCSVToPrices(benchmark.csvData);
    // Filter out incomplete current month if any
    const filtered = parsed.filter(p => p.date.slice(0, 7) !== currentYM);
    const targetPoints = years * 12 + 1;
    const finalPoints = filtered.length > targetPoints ? filtered.slice(-targetPoints) : filtered;
    const hasAdj = finalPoints.some(p => p.is_adjusted);

    const fallbackResult = {
      currency: benchmark.currency,
      adjusted_close_available: hasAdj,
      prices: finalPoints,
      source: 'benchmark_snapshot' as const,
      as_of: finalPoints[finalPoints.length - 1].date,
      warning: `Yahoo Finance unavailable for ${cleanTicker}. Using verified historical benchmark snapshot.`
    };

    priceCache.set(cacheKey, { data: fallbackResult, timestamp: Date.now() });
    return fallbackResult;
  }

  throw lastError || new Error(`Unable to retrieve historical chart data for ${cleanTicker} from Yahoo Finance.`);
}

// Helper: Calculate standard financial metrics
export function calculateMetrics(rawPrices: PricePoint[]): MetricResults {
  if (!Array.isArray(rawPrices) || rawPrices.length < 2) {
    throw new Error("At least 2 chronological price points required to calculate metrics.");
  }

  const prices = rawPrices
    .filter(p => p && typeof p.close === "number" && !isNaN(p.close) && p.close > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (prices.length < 2) {
    throw new Error("At least 2 valid price points required to calculate metrics.");
  }

  const startPrice = prices[0].close;
  const endPrice = prices[prices.length - 1].close;
  const totalMonths = prices.length - 1;

  const startDate = new Date(prices[0].date);
  const endDate = new Date(prices[prices.length - 1].date);
  let elapsedYears = (endDate.getTime() - startDate.getTime()) / (365.25 * 24 * 3600 * 1000);
  if (isNaN(elapsedYears) || elapsedYears <= 0) {
    elapsedYears = totalMonths / 12;
  }

  const cagr = Math.pow(endPrice / startPrice, 1 / elapsedYears) - 1;

  const monthlyReturns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    const prev = prices[i - 1].close;
    const curr = prices[i].close;
    monthlyReturns.push((curr - prev) / prev);
  }

  const meanReturn = monthlyReturns.reduce((sum, r) => sum + r, 0) / monthlyReturns.length;
  const variance =
    monthlyReturns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / (monthlyReturns.length - 1 || 1);
  const monthlyVol = Math.sqrt(variance);
  const annualizedVolatility = monthlyVol * Math.sqrt(12);

  let peak = -Infinity;
  let maxDrawdown = 0;
  for (const p of prices) {
    if (p.close > peak) {
      peak = p.close;
    }
    const dd = (p.close - peak) / (peak || 1);
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

// Helper: Deterministic scenario projections with annual fee drag (default 0.002)
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
    const grossCagr = baseCagr * (1 + item.adj);
    const netCagr = Math.max(-0.99, grossCagr - feeDrag);
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

// Helper: Monte Carlo Geometric Brownian Motion simulation with optional seed
export function calculateMonteCarlo(
  prices: PricePoint[],
  startValue: number = 10000,
  years: number = 10,
  monthlyContribution: number = 500,
  nPaths: number = 1000,
  feeDrag: number = 0.002,
  seed: number = 42
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
  const numPaths = Math.max(100, Math.min(3000, nPaths));
  const yearlyBuckets: number[][] = Array.from({ length: years + 1 }, () => []);

  const rng = createMulberry32(seed);

  // Standard Box-Muller normal generator using seeded PRNG
  function randomNormal(): number {
    let u = 0;
    let v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
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
    const len = bucket.length;
    // Percentile indexing: floor(p * (n - 1))
    const idx10 = Math.floor(0.10 * (len - 1));
    const idx50 = Math.floor(0.50 * (len - 1));
    const idx90 = Math.floor(0.90 * (len - 1));

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
    seed,
    trajectories
  };
}

/**
 * Tool 5: build_blended_series
 * Combines asset components into a monthly blended return series.
 * Aligns market components by calendar month (YYYY-MM intersection),
 * converts currencies to base_currency using Yahoo monthly FX,
 * and rebalances annually.
 */
export async function buildBlendedSeries(
  rawComponents: BlendedComponent[],
  years: number = 10,
  _rebalance: string = "annual",
  baseCurrency: string = "SGD"
): Promise<BlendedSeriesResult> {
  const activeComponents = rawComponents.filter(c => c && typeof c.weight === "number" && c.weight > 0);
  if (activeComponents.length === 0) {
    throw new Error("At least one component with weight > 0 is required.");
  }

  const cleanBaseCurrency = (baseCurrency || "SGD").trim().toUpperCase();

  // Normalize weights to sum to 1.0
  const totalWeight = activeComponents.reduce((sum, c) => sum + c.weight, 0);
  const normalizedComponents = activeComponents.map(c => ({
    ...c,
    weight: c.weight / totalWeight
  }));

  const warnings: string[] = [];

  // Parallel fetch of all market component tickers
  const marketComponents = normalizedComponents.filter(
    c => !(typeof c.fixed_rate === "number" && !isNaN(c.fixed_rate))
  );

  // Fetch prices for all market components in parallel
  const fetchedHistories = await Promise.all(
    marketComponents.map(async comp => {
      const ticker = comp.ticker?.trim().toUpperCase() || comp.asset_class;
      let prices = comp.prices;
      let currency = cleanBaseCurrency;
      if (!prices || prices.length < 2) {
        if (!comp.ticker) {
          throw new Error(`Component for ${comp.asset_class} requires either a ticker, fixed_rate, or prices array.`);
        }
        const history = await fetchYahooPriceHistory(ticker, years);
        prices = history.prices;
        currency = history.currency;
        if (history.warning) warnings.push(history.warning);
      }
      return { ticker, prices, currency };
    })
  );

  const historyMap = new Map<string, { prices: PricePoint[]; currency: string }>();
  for (const h of fetchedHistories) {
    historyMap.set(h.ticker, { prices: h.prices, currency: h.currency });
  }

  // Identify distinct non-base currencies needed for FX conversion
  const neededCurrencies = new Set<string>();
  for (const h of fetchedHistories) {
    const cur = h.currency.toUpperCase();
    if (cur !== cleanBaseCurrency) {
      neededCurrencies.add(cur);
    }
  }

  // Fetch FX series in parallel (e.g. USDSGD=X)
  const fxMaps = new Map<string, Map<string, number>>(); // currency -> (YYYY-MM -> rate)
  await Promise.all(
    Array.from(neededCurrencies).map(async foreignCur => {
      const fxTicker = `${foreignCur}${cleanBaseCurrency}=X`;
      try {
        const fxHistory = await fetchYahooPriceHistory(fxTicker, years);
        if (fxHistory.warning) warnings.push(fxHistory.warning);
        const map = new Map<string, number>();
        for (const pt of fxHistory.prices) {
          map.set(pt.date.slice(0, 7), pt.close);
        }
        fxMaps.set(foreignCur, map);
      } catch (err: any) {
        warnings.push(`Could not fetch FX series ${fxTicker}: ${err?.message || String(err)}. Conversion to ${cleanBaseCurrency} may be unavailable.`);
      }
    })
  );

  // Build price series in base currency and compute monthly returns per component keyed by YYYY-MM
  interface ComponentData {
    asset_class: string;
    identifier: string;
    weight: number;
    currency: string;
    fx_applied: boolean;
    cagr: number;
    volatility: number;
    returnsMap?: Map<string, number>; // for market components
    fixed_rate?: number;
  }

  const componentDataList: ComponentData[] = [];

  for (const comp of normalizedComponents) {
    if (typeof comp.fixed_rate === "number" && !isNaN(comp.fixed_rate)) {
      // Fixed rate component is assumed to be in base currency
      componentDataList.push({
        asset_class: comp.asset_class,
        identifier: `Assumed ${Math.round(comp.fixed_rate * 1000) / 10}% p.a.`,
        weight: comp.weight,
        currency: cleanBaseCurrency,
        fx_applied: false,
        cagr: comp.fixed_rate,
        volatility: 0,
        fixed_rate: comp.fixed_rate
      });
    } else {
      const ticker = (comp.ticker?.trim().toUpperCase()) || comp.asset_class;
      const h = historyMap.get(ticker)!;
      const rawPrices = h.prices;
      const compCurrency = h.currency.toUpperCase();

      let fxApplied = false;
      let convertedPrices: PricePoint[] = rawPrices;

      if (compCurrency !== cleanBaseCurrency) {
        const fxMap = fxMaps.get(compCurrency);
        if (fxMap && fxMap.size > 0) {
          convertedPrices = rawPrices.map(pt => {
            const ym = pt.date.slice(0, 7);
            const fx = fxMap.get(ym);
            if (fx && fx > 0) {
              return {
                ...pt,
                close: pt.close * fx
              };
            }
            return pt;
          });
          fxApplied = true;
        } else {
          warnings.push(`FX conversion unavailable for ${ticker} (${compCurrency} -> ${cleanBaseCurrency}). Using unadjusted series.`);
        }
      }

      const metrics = calculateMetrics(convertedPrices);

      // Monthly returns keyed by YYYY-MM of the end point
      const returnsMap = new Map<string, number>();
      for (let i = 1; i < convertedPrices.length; i++) {
        const prev = convertedPrices[i - 1].close;
        const curr = convertedPrices[i].close;
        if (prev > 0 && curr > 0) {
          const ym = convertedPrices[i].date.slice(0, 7);
          returnsMap.set(ym, (curr - prev) / prev);
        }
      }

      componentDataList.push({
        asset_class: comp.asset_class,
        identifier: ticker,
        weight: comp.weight,
        currency: compCurrency,
        fx_applied: fxApplied,
        cagr: metrics.cagr,
        volatility: metrics.annualized_volatility,
        returnsMap
      });
    }
  }

  // Phase 1.5: Align market components by calendar month (YYYY-MM intersection)
  const marketDataList = componentDataList.filter(c => c.returnsMap !== undefined);
  let alignedMonths: string[] = [];

  if (marketDataList.length > 0) {
    const firstMap = marketDataList[0].returnsMap!;
    alignedMonths = Array.from(firstMap.keys()).filter(ym =>
      marketDataList.every(m => m.returnsMap!.has(ym))
    );
  } else {
    // Pure fixed rate portfolio: generate the most recent target months
    const now = new Date();
    const count = years * 12;
    for (let m = count; m >= 1; m--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - m, 1));
      alignedMonths.push(d.toISOString().slice(0, 7));
    }
  }

  alignedMonths.sort(); // ascending order e.g. "2015-02", "2015-03"...

  // Limit to most recent `years * 12` periods if longer
  const targetMonths = years * 12;
  if (alignedMonths.length > targetMonths) {
    alignedMonths = alignedMonths.slice(-targetMonths);
  }

  if (alignedMonths.length < 2) {
    throw new Error("Insufficient common aligned calendar months across market components to construct blended series.");
  }

  if (alignedMonths.length < targetMonths) {
    warnings.push(
      `Common historical data window is ${alignedMonths.length} months (${(alignedMonths.length / 12).toFixed(1)} years), shorter than requested ${years} years.`
    );
  }

  const startDate = `${alignedMonths[0]}-01`;
  const endDate = `${alignedMonths[alignedMonths.length - 1]}-01`;

  // Simulate portfolio wealth evolution with annual rebalancing
  // Initial wealth = 100.0 at month 0
  let portfolioWealth = 100.0;
  let assetAllocations = componentDataList.map(c => portfolioWealth * c.weight);

  const blendedMonthlyResults: Array<{ date: string; return: number; index_value: number }> = [];
  let peakWealth = portfolioWealth;
  let maxDrawdown = 0;

  for (let m = 0; m < alignedMonths.length; m++) {
    const ym = alignedMonths[m];

    // Annual rebalancing based on months since the first aligned month
    if (m > 0 && m % 12 === 0) {
      assetAllocations = componentDataList.map(c => portfolioWealth * c.weight);
    }

    const startMonthWealth = portfolioWealth;
    let endMonthWealth = 0;

    for (let i = 0; i < componentDataList.length; i++) {
      const comp = componentDataList[i];
      let r = 0;
      if (comp.returnsMap) {
        r = comp.returnsMap.get(ym) ?? 0;
      } else if (comp.fixed_rate !== undefined) {
        // Fixed-rate components generate returns for exactly those aligned months
        r = Math.pow(1 + comp.fixed_rate, 1 / 12) - 1;
      }

      assetAllocations[i] = assetAllocations[i] * (1 + r);
      endMonthWealth += assetAllocations[i];
    }

    portfolioWealth = endMonthWealth;
    const monthlyBlendedReturn = (endMonthWealth - startMonthWealth) / startMonthWealth;

    if (portfolioWealth > peakWealth) {
      peakWealth = portfolioWealth;
    }
    const currentDrawdown = (portfolioWealth - peakWealth) / (peakWealth || 1);
    if (currentDrawdown < maxDrawdown) {
      maxDrawdown = currentDrawdown;
    }

    blendedMonthlyResults.push({
      date: `${ym}-01`,
      return: monthlyBlendedReturn,
      index_value: Math.round(portfolioWealth * 100) / 100
    });
  }

  const elapsedYears = alignedMonths.length / 12;
  const portfolioCagr = Math.pow(portfolioWealth / 100.0, 1 / elapsedYears) - 1;

  const returnsList = blendedMonthlyResults.map(b => b.return);
  const meanBlended = returnsList.reduce((sum, r) => sum + r, 0) / returnsList.length;
  const varBlended =
    returnsList.reduce((sum, r) => sum + Math.pow(r - meanBlended, 2), 0) / (returnsList.length - 1 || 1);
  const annualizedVol = Math.sqrt(varBlended) * Math.sqrt(12);

  return {
    monthly_returns: blendedMonthlyResults,
    annualized_return: portfolioCagr,
    annualized_volatility: annualizedVol,
    max_drawdown: maxDrawdown,
    total_months: alignedMonths.length,
    start_date: startDate,
    end_date: endDate,
    aligned_months: alignedMonths.length,
    base_currency: cleanBaseCurrency,
    warnings: warnings.length > 0 ? warnings : undefined,
    components_summary: componentDataList.map(c => ({
      asset_class: c.asset_class,
      identifier: c.identifier,
      weight: Math.round(c.weight * 1000) / 1000,
      cagr: c.cagr,
      volatility: c.volatility,
      currency: c.currency,
      fx_applied: c.fx_applied
    }))
  };
}

/**
 * Tool 6: simulate_goal
 * 6-month block bootstrap simulation using seeded PRNG (Mulberry32).
 * Computes drawdown on a unit return index (without contributions) so savings do not mask declines.
 */
export function simulateGoal(
  returns: number[],
  startValue: number,
  monthlyContribution: number,
  years: number,
  targetAmount: number,
  nPaths: number = 1000,
  inflation: number = 0.025,
  feeDrag: number = 0.002,
  seed: number = 42
): GoalSimulationResult {
  if (!returns || returns.length < 2) {
    throw new Error("At least 2 historical monthly returns required to run block bootstrap goal simulation.");
  }

  const rng = createMulberry32(seed);

  const M = returns.length;
  const blockSize = Math.min(6, M);
  const maxStartIdx = M - blockSize;
  const totalMonths = years * 12;
  const numPaths = Math.max(100, Math.min(3000, nPaths));

  const yearlyNominalBuckets: number[][] = Array.from({ length: years + 1 }, () => []);
  const yearlyRealBuckets: number[][] = Array.from({ length: years + 1 }, () => []);

  let nominalSuccessCount = 0;
  let realSuccessCount = 0;

  const pathUnitDrawdowns: number[] = [];
  const monthlyFeeFactor = 1 - feeDrag / 12;

  for (let p = 0; p < numPaths; p++) {
    let nomVal = startValue;
    yearlyNominalBuckets[0].push(nomVal);
    yearlyRealBuckets[0].push(nomVal);

    // Unit return index (no contributions) to measure true investment drawdown
    let unitWealth = 1.0;
    let unitPeak = 1.0;
    let pathMaxDrawdown = 0;

    let m = 0;
    while (m < totalMonths) {
      const startIdx = Math.floor(rng() * (maxStartIdx + 1));
      const stepsInBlock = Math.min(blockSize, totalMonths - m);

      for (let b = 0; b < stepsInBlock; b++) {
        m++;
        const grossReturn = returns[startIdx + b];
        const netReturn = (1 + grossReturn) * monthlyFeeFactor - 1;

        nomVal = Math.max(0, nomVal * (1 + netReturn) + monthlyContribution);

        unitWealth = unitWealth * (1 + netReturn);
        if (unitWealth > unitPeak) {
          unitPeak = unitWealth;
        }
        const dd = (unitWealth - unitPeak) / (unitPeak || 1);
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

    pathUnitDrawdowns.push(pathMaxDrawdown);

    const finalNominal = nomVal;
    const finalReal = nomVal / Math.pow(1 + inflation, years);

    if (finalNominal >= targetAmount) {
      nominalSuccessCount++;
    }
    if (finalReal >= targetAmount) {
      realSuccessCount++;
    }
  }

  // Drawdowns: sort ascending (most negative first)
  pathUnitDrawdowns.sort((a, b) => a - b);
  const p95Idx = Math.floor(0.05 * (pathUnitDrawdowns.length - 1));
  const p50Idx = Math.floor(0.50 * (pathUnitDrawdowns.length - 1));

  const drawdown_p95 = Math.round(pathUnitDrawdowns[p95Idx] * 10000) / 10000;
  const drawdown_median = Math.round(pathUnitDrawdowns[p50Idx] * 10000) / 10000;

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

    const n = nomBucket.length;
    // Percentile indexing: floor(p * (n - 1))
    const idx10 = Math.floor(0.10 * (n - 1));
    const idx50 = Math.floor(0.50 * (n - 1));
    const idx90 = Math.floor(0.90 * (n - 1));

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
    drawdown_median,
    drawdown_p95,
    worst_case_drawdown: drawdown_p95,
    total_contributed: Math.round(startValue + monthlyContribution * 12 * years),
    target_amount: targetAmount,
    years,
    inflation,
    fee_drag: feeDrag,
    seed,
    trajectories
  };
}

/**
 * Tool 7: solve_required_contribution
 * Bisection solver finding the minimum monthly contribution such that
 * P(final >= target) >= confidence using common random numbers (same seed).
 */
export function solveRequiredContribution(
  returns: number[],
  startValue: number,
  years: number,
  targetAmount: number,
  confidence: number = 0.80,
  inflation: number = 0.025,
  realTerms: boolean = false,
  feeDrag: number = 0.002,
  seed: number = 42
): RequiredContributionResult {
  if (!returns || returns.length < 2) {
    throw new Error("At least 2 historical monthly returns required to solve contribution.");
  }

  const targetConf = Math.max(0.50, Math.min(0.99, confidence));
  const totalMonths = years * 12;

  // Evaluation helper for candidate contribution
  // Must use the SAME seed for every candidate contribution (common random numbers)
  function getSuccessProb(c: number): number {
    const sim = simulateGoal(returns, startValue, c, years, targetAmount, 500, inflation, feeDrag, seed);
    return realTerms ? sim.real_probability_of_success : sim.probability_of_success;
  }

  // Bounds: low = 0; high starts near (target - start_value) / months and doubles up to a sensible cap
  const initialHigh = Math.max(10, Math.ceil(Math.max(0, targetAmount - startValue) / totalMonths));
  const maxCap = Math.max(100_000, Math.min(1_000_000, initialHigh * 4));
  let low = 0;
  let high = Math.min(maxCap, initialHigh);

  // Expand high bound by doubling up to maxCap
  while (getSuccessProb(high) < targetConf && high < maxCap) {
    const nextHigh = high * 2;
    high = nextHigh >= maxCap ? maxCap : nextHigh;
    if (high === maxCap) break;
  }

  const probAtHigh = getSuccessProb(high);
  if (probAtHigh < targetConf) {
    const terminalSim = simulateGoal(returns, startValue, high, years, targetAmount, 500, inflation, feeDrag, seed);
    return {
      required_monthly_contribution: high,
      achieved_probability: probAtHigh,
      confidence: targetConf,
      achievable: false,
      target_amount: targetAmount,
      years,
      start_value: startValue,
      real_terms: realTerms,
      inflation,
      fee_drag: feeDrag,
      seed,
      expected_terminal_p50: realTerms ? terminalSim.real_median_final_value : terminalSim.median_final_value
    };
  }

  if (getSuccessProb(0) >= targetConf) {
    const terminalSim = simulateGoal(returns, startValue, 0, years, targetAmount, 500, inflation, feeDrag, seed);
    return {
      required_monthly_contribution: 0,
      achieved_probability: getSuccessProb(0),
      confidence: targetConf,
      achievable: true,
      target_amount: targetAmount,
      years,
      start_value: startValue,
      real_terms: realTerms,
      inflation,
      fee_drag: feeDrag,
      seed,
      expected_terminal_p50: realTerms ? terminalSim.real_median_final_value : terminalSim.median_final_value
    };
  }

  // Bisection loop down to 1 currency unit
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    const midProb = getSuccessProb(mid);
    if (midProb >= targetConf) {
      high = mid;
    } else {
      low = mid;
    }
  }

  const finalContribution = high;
  const finalProb = getSuccessProb(finalContribution);
  const finalSim = simulateGoal(returns, startValue, finalContribution, years, targetAmount, 500, inflation, feeDrag, seed);

  return {
    required_monthly_contribution: finalContribution,
    achieved_probability: finalProb,
    confidence: targetConf,
    achievable: true,
    target_amount: targetAmount,
    years,
    start_value: startValue,
    real_terms: realTerms,
    inflation,
    fee_drag: feeDrag,
    seed,
    expected_terminal_p50: realTerms ? finalSim.real_median_final_value : finalSim.median_final_value
  };
}

/**
 * Tool 8: suggest_mixes
 * Generates three labelled illustrative asset allocations tailored for Singapore retail investors.
 * Applies a deterministic horizon glide rule:
 * - horizon <= 3: shift 40% of equity/reits/gold into gov_backed (60%) and cash (40%)
 * - horizon 4-5: shift 20%
 * - horizon 6-14: no change
 * - horizon >= 15: no change
 * Renormalises to exactly 1.0.
 * Descriptions derive percentages dynamically from weights without unsupported claims.
 */
export function suggestMixes(
  riskLevel: number,
  horizonYears: number
): { risk_level: number; horizon_years: number; mixes: SuggestedMix[] } {
  const level = Math.max(1, Math.min(5, Math.round(riskLevel)));

  let baseMixes: Array<{
    id: string;
    name: string;
    label: string;
    rationale: string;
    risk_rating: string;
    components: SuggestedMixComponent[];
  }>;

  if (level === 1) {
    baseMixes = [
      {
        id: "mix_preservation",
        name: "Capital Preservation Allocation",
        label: "Baseline Match",
        rationale: "An illustrative mix designed for near-term capital protection, weighted towards Singapore Government-backed T-bills, SSBs, and cash equivalents.",
        risk_rating: "Very Low",
        components: [
          { asset_class: 'cash', name: 'Cash / Fixed Deposit', default_proxy: 'Cash', is_fixed_rate: true, default_rate: 0.020, weight: 0.25 },
          { asset_class: 'gov_backed', name: 'Government-Backed (T-Bills / SSB)', default_proxy: 'SSB/T-Bills', is_fixed_rate: true, default_rate: 0.028, weight: 0.45 },
          { asset_class: 'bonds', name: 'Global / US Aggregate Bonds', default_proxy: 'AGG', is_fixed_rate: false, weight: 0.20 },
          { asset_class: 'global_equity', name: 'Global Equity', default_proxy: 'VT', is_fixed_rate: false, weight: 0.05 },
          { asset_class: 'sg_equity', name: 'Singapore Equity (STI)', default_proxy: 'ES3.SI', is_fixed_rate: false, weight: 0.05 },
          { asset_class: 'reits', name: 'REITs', default_proxy: 'VNQ', is_fixed_rate: false, weight: 0.00 },
          { asset_class: 'gold', name: 'Gold', default_proxy: 'GLD', is_fixed_rate: false, weight: 0.00 },
        ]
      },
      {
        id: "mix_pure_cash_sovereign",
        name: "Sovereign & Fixed-Income Allocation",
        label: "Defensive Allocation",
        rationale: "An illustrative mix consisting exclusively of sovereign and fixed income assets with zero equity allocation.",
        risk_rating: "Minimal",
        components: [
          { asset_class: 'cash', name: 'Cash / Fixed Deposit', default_proxy: 'Cash', is_fixed_rate: true, default_rate: 0.020, weight: 0.35 },
          { asset_class: 'gov_backed', name: 'Government-Backed (T-Bills / SSB)', default_proxy: 'SSB/T-Bills', is_fixed_rate: true, default_rate: 0.028, weight: 0.45 },
          { asset_class: 'bonds', name: 'Global / US Aggregate Bonds', default_proxy: 'AGG', is_fixed_rate: false, weight: 0.20 },
          { asset_class: 'global_equity', name: 'Global Equity', default_proxy: 'VT', is_fixed_rate: false, weight: 0.00 },
          { asset_class: 'sg_equity', name: 'Singapore Equity (STI)', default_proxy: 'ES3.SI', is_fixed_rate: false, weight: 0.00 },
          { asset_class: 'reits', name: 'REITs', default_proxy: 'VNQ', is_fixed_rate: false, weight: 0.00 },
          { asset_class: 'gold', name: 'Gold', default_proxy: 'GLD', is_fixed_rate: false, weight: 0.00 },
        ]
      },
      {
        id: "mix_conservative_income",
        name: "Conservative Income Allocation",
        label: "Mild Growth Tilt",
        rationale: "An illustrative mix that incorporates a modest equity and REIT buffer alongside fixed-income instruments.",
        risk_rating: "Low",
        components: [
          { asset_class: 'cash', name: 'Cash / Fixed Deposit', default_proxy: 'Cash', is_fixed_rate: true, default_rate: 0.020, weight: 0.15 },
          { asset_class: 'gov_backed', name: 'Government-Backed (T-Bills / SSB)', default_proxy: 'SSB/T-Bills', is_fixed_rate: true, default_rate: 0.028, weight: 0.40 },
          { asset_class: 'bonds', name: 'Global / US Aggregate Bonds', default_proxy: 'AGG', is_fixed_rate: false, weight: 0.25 },
          { asset_class: 'global_equity', name: 'Global Equity', default_proxy: 'VT', is_fixed_rate: false, weight: 0.10 },
          { asset_class: 'sg_equity', name: 'Singapore Equity (STI)', default_proxy: 'ES3.SI', is_fixed_rate: false, weight: 0.05 },
          { asset_class: 'reits', name: 'REITs', default_proxy: 'VNQ', is_fixed_rate: false, weight: 0.05 },
          { asset_class: 'gold', name: 'Gold', default_proxy: 'GLD', is_fixed_rate: false, weight: 0.00 },
        ]
      }
    ];
  } else if (level === 2) {
    baseMixes = [
      {
        id: "mix_income_stability",
        name: "Income & Stability Allocation",
        label: "Baseline Match",
        rationale: "An illustrative mix balancing fixed-income stability with dividend-yielding Singapore and global equity exposure.",
        risk_rating: "Conservative",
        components: [
          { asset_class: 'cash', name: 'Cash / Fixed Deposit', default_proxy: 'Cash', is_fixed_rate: true, default_rate: 0.020, weight: 0.15 },
          { asset_class: 'gov_backed', name: 'Government-Backed (T-Bills / SSB)', default_proxy: 'SSB/T-Bills', is_fixed_rate: true, default_rate: 0.028, weight: 0.35 },
          { asset_class: 'bonds', name: 'Global / US Aggregate Bonds', default_proxy: 'AGG', is_fixed_rate: false, weight: 0.25 },
          { asset_class: 'global_equity', name: 'Global Equity', default_proxy: 'VT', is_fixed_rate: false, weight: 0.10 },
          { asset_class: 'sg_equity', name: 'Singapore Equity (STI)', default_proxy: 'ES3.SI', is_fixed_rate: false, weight: 0.10 },
          { asset_class: 'reits', name: 'REITs', default_proxy: 'VNQ', is_fixed_rate: false, weight: 0.05 },
          { asset_class: 'gold', name: 'Gold', default_proxy: 'GLD', is_fixed_rate: false, weight: 0.00 },
        ]
      },
      {
        id: "mix_sovereign_income",
        name: "Singapore Sovereign Heavy Allocation",
        label: "Defensive Allocation",
        rationale: "An illustrative mix prioritizing sovereign bills, bonds, and deposits to moderate equity drawdowns.",
        risk_rating: "Low",
        components: [
          { asset_class: 'cash', name: 'Cash / Fixed Deposit', default_proxy: 'Cash', is_fixed_rate: true, default_rate: 0.020, weight: 0.20 },
          { asset_class: 'gov_backed', name: 'Government-Backed (T-Bills / SSB)', default_proxy: 'SSB/T-Bills', is_fixed_rate: true, default_rate: 0.028, weight: 0.40 },
          { asset_class: 'bonds', name: 'Global / US Aggregate Bonds', default_proxy: 'AGG', is_fixed_rate: false, weight: 0.25 },
          { asset_class: 'global_equity', name: 'Global Equity', default_proxy: 'VT', is_fixed_rate: false, weight: 0.05 },
          { asset_class: 'sg_equity', name: 'Singapore Equity (STI)', default_proxy: 'ES3.SI', is_fixed_rate: false, weight: 0.05 },
          { asset_class: 'reits', name: 'REITs', default_proxy: 'VNQ', is_fixed_rate: false, weight: 0.05 },
          { asset_class: 'gold', name: 'Gold', default_proxy: 'GLD', is_fixed_rate: false, weight: 0.00 },
        ]
      },
      {
        id: "mix_dividend_yield",
        name: "Dividend & Real Assets Allocation",
        label: "Inflation Buffer",
        rationale: "An illustrative mix pairing dividend-yielding shares and real assets with a core fixed income cushion.",
        risk_rating: "Moderate-Low",
        components: [
          { asset_class: 'cash', name: 'Cash / Fixed Deposit', default_proxy: 'Cash', is_fixed_rate: true, default_rate: 0.020, weight: 0.10 },
          { asset_class: 'gov_backed', name: 'Government-Backed (T-Bills / SSB)', default_proxy: 'SSB/T-Bills', is_fixed_rate: true, default_rate: 0.028, weight: 0.25 },
          { asset_class: 'bonds', name: 'Global / US Aggregate Bonds', default_proxy: 'AGG', is_fixed_rate: false, weight: 0.25 },
          { asset_class: 'global_equity', name: 'Global Equity', default_proxy: 'VT', is_fixed_rate: false, weight: 0.15 },
          { asset_class: 'sg_equity', name: 'Singapore Equity (STI)', default_proxy: 'ES3.SI', is_fixed_rate: false, weight: 0.15 },
          { asset_class: 'reits', name: 'REITs', default_proxy: 'VNQ', is_fixed_rate: false, weight: 0.05 },
          { asset_class: 'gold', name: 'Gold', default_proxy: 'GLD', is_fixed_rate: false, weight: 0.05 },
        ]
      }
    ];
  } else if (level === 3) {
    baseMixes = [
      {
        id: "mix_sg_balanced",
        name: "Singapore Balanced Allocation",
        label: "Baseline Match",
        rationale: "An illustrative mix balancing wealth accumulation assets with preservation instruments for medium-to-long term goals.",
        risk_rating: "Moderate",
        components: [
          { asset_class: 'cash', name: 'Cash / Fixed Deposit', default_proxy: 'Cash', is_fixed_rate: true, default_rate: 0.020, weight: 0.10 },
          { asset_class: 'gov_backed', name: 'Government-Backed (T-Bills / SSB)', default_proxy: 'SSB/T-Bills', is_fixed_rate: true, default_rate: 0.028, weight: 0.15 },
          { asset_class: 'bonds', name: 'Global / US Aggregate Bonds', default_proxy: 'AGG', is_fixed_rate: false, weight: 0.20 },
          { asset_class: 'global_equity', name: 'Global Equity', default_proxy: 'VT', is_fixed_rate: false, weight: 0.30 },
          { asset_class: 'sg_equity', name: 'Singapore Equity (STI)', default_proxy: 'ES3.SI', is_fixed_rate: false, weight: 0.15 },
          { asset_class: 'reits', name: 'REITs', default_proxy: 'VNQ', is_fixed_rate: false, weight: 0.05 },
          { asset_class: 'gold', name: 'Gold', default_proxy: 'GLD', is_fixed_rate: false, weight: 0.05 },
        ]
      },
      {
        id: "mix_balanced_defensive",
        name: "Defensive Balanced Allocation",
        label: "Defensive Buffer",
        rationale: "An illustrative mix tilted towards sovereign and fixed income assets for investors who prefer moderate equity exposure with lower volatility.",
        risk_rating: "Moderate-Low",
        components: [
          { asset_class: 'cash', name: 'Cash / Fixed Deposit', default_proxy: 'Cash', is_fixed_rate: true, default_rate: 0.020, weight: 0.15 },
          { asset_class: 'gov_backed', name: 'Government-Backed (T-Bills / SSB)', default_proxy: 'SSB/T-Bills', is_fixed_rate: true, default_rate: 0.028, weight: 0.20 },
          { asset_class: 'bonds', name: 'Global / US Aggregate Bonds', default_proxy: 'AGG', is_fixed_rate: false, weight: 0.25 },
          { asset_class: 'global_equity', name: 'Global Equity', default_proxy: 'VT', is_fixed_rate: false, weight: 0.20 },
          { asset_class: 'sg_equity', name: 'Singapore Equity (STI)', default_proxy: 'ES3.SI', is_fixed_rate: false, weight: 0.10 },
          { asset_class: 'reits', name: 'REITs', default_proxy: 'VNQ', is_fixed_rate: false, weight: 0.05 },
          { asset_class: 'gold', name: 'Gold', default_proxy: 'GLD', is_fixed_rate: false, weight: 0.05 },
        ]
      },
      {
        id: "mix_balanced_growth",
        name: "Growth-Weighted Balanced Allocation",
        label: "Growth Focus",
        rationale: "An illustrative mix tilted towards worldwide equities and real estate investment trusts to support capital growth.",
        risk_rating: "Moderate-High",
        components: [
          { asset_class: 'cash', name: 'Cash / Fixed Deposit', default_proxy: 'Cash', is_fixed_rate: true, default_rate: 0.020, weight: 0.05 },
          { asset_class: 'gov_backed', name: 'Government-Backed (T-Bills / SSB)', default_proxy: 'SSB/T-Bills', is_fixed_rate: true, default_rate: 0.028, weight: 0.10 },
          { asset_class: 'bonds', name: 'Global / US Aggregate Bonds', default_proxy: 'AGG', is_fixed_rate: false, weight: 0.15 },
          { asset_class: 'global_equity', name: 'Global Equity', default_proxy: 'VT', is_fixed_rate: false, weight: 0.40 },
          { asset_class: 'sg_equity', name: 'Singapore Equity (STI)', default_proxy: 'ES3.SI', is_fixed_rate: false, weight: 0.15 },
          { asset_class: 'reits', name: 'REITs', default_proxy: 'VNQ', is_fixed_rate: false, weight: 0.10 },
          { asset_class: 'gold', name: 'Gold', default_proxy: 'GLD', is_fixed_rate: false, weight: 0.05 },
        ]
      }
    ];
  } else if (level === 4) {
    baseMixes = [
      {
        id: "mix_global_growth",
        name: "Global Multi-Asset Growth Allocation",
        label: "Baseline Match",
        rationale: "An illustrative growth mix weighted towards global equities, local blue chips, and REITs for extended compounding horizons.",
        risk_rating: "High",
        components: [
          { asset_class: 'cash', name: 'Cash / Fixed Deposit', default_proxy: 'Cash', is_fixed_rate: true, default_rate: 0.020, weight: 0.05 },
          { asset_class: 'gov_backed', name: 'Government-Backed (T-Bills / SSB)', default_proxy: 'SSB/T-Bills', is_fixed_rate: true, default_rate: 0.028, weight: 0.05 },
          { asset_class: 'bonds', name: 'Global / US Aggregate Bonds', default_proxy: 'AGG', is_fixed_rate: false, weight: 0.15 },
          { asset_class: 'global_equity', name: 'Global Equity', default_proxy: 'VT', is_fixed_rate: false, weight: 0.45 },
          { asset_class: 'sg_equity', name: 'Singapore Equity (STI)', default_proxy: 'ES3.SI', is_fixed_rate: false, weight: 0.15 },
          { asset_class: 'reits', name: 'REITs', default_proxy: 'VNQ', is_fixed_rate: false, weight: 0.10 },
          { asset_class: 'gold', name: 'Gold', default_proxy: 'GLD', is_fixed_rate: false, weight: 0.05 },
        ]
      },
      {
        id: "mix_growth_cushioned",
        name: "Cushioned Growth Allocation",
        label: "Stability Tilt",
        rationale: "An illustrative mix retaining a moderate bond and sovereign allocation alongside equity assets.",
        risk_rating: "Moderate-High",
        components: [
          { asset_class: 'cash', name: 'Cash / Fixed Deposit', default_proxy: 'Cash', is_fixed_rate: true, default_rate: 0.020, weight: 0.10 },
          { asset_class: 'gov_backed', name: 'Government-Backed (T-Bills / SSB)', default_proxy: 'SSB/T-Bills', is_fixed_rate: true, default_rate: 0.028, weight: 0.10 },
          { asset_class: 'bonds', name: 'Global / US Aggregate Bonds', default_proxy: 'AGG', is_fixed_rate: false, weight: 0.20 },
          { asset_class: 'global_equity', name: 'Global Equity', default_proxy: 'VT', is_fixed_rate: false, weight: 0.35 },
          { asset_class: 'sg_equity', name: 'Singapore Equity (STI)', default_proxy: 'ES3.SI', is_fixed_rate: false, weight: 0.15 },
          { asset_class: 'reits', name: 'REITs', default_proxy: 'VNQ', is_fixed_rate: false, weight: 0.05 },
          { asset_class: 'gold', name: 'Gold', default_proxy: 'GLD', is_fixed_rate: false, weight: 0.05 },
        ]
      },
      {
        id: "mix_maximum_equity_tilt",
        name: "High-Equity Allocation",
        label: "High Growth",
        rationale: "An illustrative allocation prioritizing worldwide equity exposure with minimal defensive drag for multi-decade horizons.",
        risk_rating: "Aggressive",
        components: [
          { asset_class: 'cash', name: 'Cash / Fixed Deposit', default_proxy: 'Cash', is_fixed_rate: true, default_rate: 0.020, weight: 0.05 },
          { asset_class: 'gov_backed', name: 'Government-Backed (T-Bills / SSB)', default_proxy: 'SSB/T-Bills', is_fixed_rate: true, default_rate: 0.028, weight: 0.00 },
          { asset_class: 'bonds', name: 'Global / US Aggregate Bonds', default_proxy: 'AGG', is_fixed_rate: false, weight: 0.10 },
          { asset_class: 'global_equity', name: 'Global Equity', default_proxy: 'VT', is_fixed_rate: false, weight: 0.55 },
          { asset_class: 'sg_equity', name: 'Singapore Equity (STI)', default_proxy: 'ES3.SI', is_fixed_rate: false, weight: 0.15 },
          { asset_class: 'reits', name: 'REITs', default_proxy: 'VNQ', is_fixed_rate: false, weight: 0.10 },
          { asset_class: 'gold', name: 'Gold', default_proxy: 'GLD', is_fixed_rate: false, weight: 0.05 },
        ]
      }
    ];
  } else {
    // Risk Level 5: Aggressive Growth
    baseMixes = [
      {
        id: "mix_aggressive_core",
        name: "Aggressive Global Allocation",
        label: "Baseline Match",
        rationale: "An illustrative mix dominated by worldwide and domestic equities for investors seeking long-term capital expansion.",
        risk_rating: "Aggressive",
        components: [
          { asset_class: 'cash', name: 'Cash / Fixed Deposit', default_proxy: 'Cash', is_fixed_rate: true, default_rate: 0.020, weight: 0.05 },
          { asset_class: 'gov_backed', name: 'Government-Backed (T-Bills / SSB)', default_proxy: 'SSB/T-Bills', is_fixed_rate: true, default_rate: 0.028, weight: 0.00 },
          { asset_class: 'bonds', name: 'Global / US Aggregate Bonds', default_proxy: 'AGG', is_fixed_rate: false, weight: 0.05 },
          { asset_class: 'global_equity', name: 'Global Equity', default_proxy: 'VT', is_fixed_rate: false, weight: 0.60 },
          { asset_class: 'sg_equity', name: 'Singapore Equity (STI)', default_proxy: 'ES3.SI', is_fixed_rate: false, weight: 0.15 },
          { asset_class: 'reits', name: 'REITs', default_proxy: 'VNQ', is_fixed_rate: false, weight: 0.10 },
          { asset_class: 'gold', name: 'Gold', default_proxy: 'GLD', is_fixed_rate: false, weight: 0.05 },
        ]
      },
      {
        id: "mix_aggressive_hedged",
        name: "Diversified Aggressive Allocation",
        label: "Buffer Tilt",
        rationale: "An illustrative mix retaining an aggregate bond allocation to provide rebalancing liquidity during equity downcycles.",
        risk_rating: "High",
        components: [
          { asset_class: 'cash', name: 'Cash / Fixed Deposit', default_proxy: 'Cash', is_fixed_rate: true, default_rate: 0.020, weight: 0.05 },
          { asset_class: 'gov_backed', name: 'Government-Backed (T-Bills / SSB)', default_proxy: 'SSB/T-Bills', is_fixed_rate: true, default_rate: 0.028, weight: 0.05 },
          { asset_class: 'bonds', name: 'Global / US Aggregate Bonds', default_proxy: 'AGG', is_fixed_rate: false, weight: 0.15 },
          { asset_class: 'global_equity', name: 'Global Equity', default_proxy: 'VT', is_fixed_rate: false, weight: 0.50 },
          { asset_class: 'sg_equity', name: 'Singapore Equity (STI)', default_proxy: 'ES3.SI', is_fixed_rate: false, weight: 0.15 },
          { asset_class: 'reits', name: 'REITs', default_proxy: 'VNQ', is_fixed_rate: false, weight: 0.05 },
          { asset_class: 'gold', name: 'Gold', default_proxy: 'GLD', is_fixed_rate: false, weight: 0.05 },
        ]
      },
      {
        id: "mix_pure_equity_real",
        name: "Equities & Real Assets Allocation",
        label: "Equity Focus",
        rationale: "An illustrative mix consisting exclusively of global equities, Singapore stocks, REITs, and gold with zero cash or bond weighting.",
        risk_rating: "Very High",
        components: [
          { asset_class: 'cash', name: 'Cash / Fixed Deposit', default_proxy: 'Cash', is_fixed_rate: true, default_rate: 0.020, weight: 0.00 },
          { asset_class: 'gov_backed', name: 'Government-Backed (T-Bills / SSB)', default_proxy: 'SSB/T-Bills', is_fixed_rate: true, default_rate: 0.028, weight: 0.00 },
          { asset_class: 'bonds', name: 'Global / US Aggregate Bonds', default_proxy: 'AGG', is_fixed_rate: false, weight: 0.00 },
          { asset_class: 'global_equity', name: 'Global Equity', default_proxy: 'VT', is_fixed_rate: false, weight: 0.70 },
          { asset_class: 'sg_equity', name: 'Singapore Equity (STI)', default_proxy: 'ES3.SI', is_fixed_rate: false, weight: 0.15 },
          { asset_class: 'reits', name: 'REITs', default_proxy: 'VNQ', is_fixed_rate: false, weight: 0.10 },
          { asset_class: 'gold', name: 'Gold', default_proxy: 'GLD', is_fixed_rate: false, weight: 0.05 },
        ]
      }
    ];
  }

  // Phase 2.1: Deterministic horizon glide rule
  // - horizon <= 3 years: shift 40% of equity/reits/gold into gov_backed (60%) and cash (40%)
  // - horizon 4-5 years: shift 20% the same way
  // - 6-14 years: no change
  // - >= 15 years: no change
  let shiftFraction = 0;
  if (horizonYears <= 3) {
    shiftFraction = 0.40;
  } else if (horizonYears <= 5) {
    shiftFraction = 0.20;
  }

  const equityClasses = new Set(['global_equity', 'sg_equity', 'reits', 'gold']);

  const finalMixes: SuggestedMix[] = baseMixes.map(mix => {
    const comps = mix.components.map(c => ({ ...c }));

    let combinedEquityWeight = 0;
    for (const c of comps) {
      if (equityClasses.has(c.asset_class)) {
        combinedEquityWeight += c.weight;
      }
    }

    const shiftAmount = combinedEquityWeight * shiftFraction;
    const horizonAdjustmentPct = Math.round(shiftAmount * 1000) / 10;

    if (shiftAmount > 0) {
      // Reduce equity components proportionally
      for (const c of comps) {
        if (equityClasses.has(c.asset_class)) {
          c.weight = c.weight * (1 - shiftFraction);
        }
      }

      // Add to gov_backed (60% of shift) and cash (40% of shift)
      const govIdx = comps.findIndex(c => c.asset_class === 'gov_backed');
      const cashIdx = comps.findIndex(c => c.asset_class === 'cash');

      if (govIdx !== -1) {
        comps[govIdx].weight += 0.60 * shiftAmount;
      }
      if (cashIdx !== -1) {
        comps[cashIdx].weight += 0.40 * shiftAmount;
      }
    }

    // Renormalise weights to exactly 1.0 (+/- 1e-9)
    const sumW = comps.reduce((acc, c) => acc + c.weight, 0);
    for (const c of comps) {
      c.weight = c.weight / sumW;
    }

    // Phase 2.2: Compute neutral description from actual weights
    let fixedPct = 0;
    let equityPct = 0;
    for (const c of comps) {
      if (c.asset_class === 'cash' || c.asset_class === 'gov_backed' || c.asset_class === 'bonds') {
        fixedPct += c.weight;
      } else {
        equityPct += c.weight;
      }
    }
    const fixedInt = Math.round(fixedPct * 100);
    const equityInt = 100 - fixedInt;

    let dynamicDesc = "";
    if (fixedInt >= 70) {
      dynamicDesc = `Fixed-income heavy: an illustrative mix with about ${fixedInt}% in government-backed paper, cash and bonds, and ${equityInt}% in equities and real assets.`;
    } else if (fixedInt >= 40) {
      dynamicDesc = `Balanced distribution: an illustrative mix with about ${fixedInt}% in fixed income and sovereign buffers, and ${equityInt}% in equities and real assets.`;
    } else {
      dynamicDesc = `Growth-oriented: an illustrative mix with about ${equityInt}% in global equities, Singapore stocks and real assets, and ${fixedInt}% in defensive instruments.`;
    }

    return {
      id: mix.id,
      name: mix.name,
      label: mix.label,
      description: dynamicDesc,
      rationale: mix.rationale,
      risk_rating: mix.risk_rating,
      horizon_adjustment: horizonAdjustmentPct,
      components: comps
    };
  });

  return {
    risk_level: level,
    horizon_years: horizonYears,
    mixes: finalMixes
  };
}

/**
 * Tool 9: plan_goal
 * Server-side evaluation tool consolidating fetch, currency conversion,
 * blended series generation, bootstrap simulation, and required contribution solving.
 */
export async function planGoal(args: {
  start_value: number;
  monthly_contribution: number;
  years: number;
  target_amount: number;
  confidence?: number;
  inflation?: number;
  fee_drag?: number;
  base_currency?: string;
  seed?: number;
  risk_level?: number;
  components?: BlendedComponent[];
}): Promise<PlanGoalResult> {
  const startValue = args.start_value;
  const monthlyContribution = args.monthly_contribution;
  const years = args.years;
  const targetAmount = args.target_amount;
  const confidence = typeof args.confidence === "number" ? args.confidence : 0.80;
  const inflation = typeof args.inflation === "number" ? args.inflation : 0.025;
  const feeDrag = typeof args.fee_drag === "number" ? args.fee_drag : 0.002;
  const baseCurrency = args.base_currency || "SGD";
  const seed = typeof args.seed === "number" ? args.seed : 42;

  const mixesToEvaluate: Array<{
    mix_id: string;
    name: string;
    label: string;
    description: string;
    rationale: string;
    risk_rating: string;
    horizon_adjustment?: number;
    components: BlendedComponent[];
  }> = [];

  if (args.components && Array.isArray(args.components) && args.components.length > 0) {
    mixesToEvaluate.push({
      mix_id: "custom",
      name: "Custom Allocation Mix",
      label: "Bespoke Mix",
      description: "User-defined asset distribution evaluated against historical market data.",
      rationale: "Tailored to personal portfolio preferences.",
      risk_rating: "Custom",
      components: args.components
    });
  } else {
    const riskLevel = typeof args.risk_level === "number" ? args.risk_level : 3;
    const suggested = suggestMixes(riskLevel, years);
    for (const sm of suggested.mixes) {
      mixesToEvaluate.push({
        mix_id: sm.id,
        name: sm.name,
        label: sm.label,
        description: sm.description,
        rationale: sm.rationale,
        risk_rating: sm.risk_rating,
        horizon_adjustment: sm.horizon_adjustment,
        components: sm.components.map(c => ({
          asset_class: c.asset_class,
          ticker: c.is_fixed_rate ? undefined : c.default_proxy,
          fixed_rate: c.is_fixed_rate ? c.default_rate ?? 0.02 : undefined,
          weight: c.weight
        }))
      });
    }
  }

  const warnings: string[] = [];
  const sourcesSet = new Set<string>();
  let latestAsOf = "";

  const results: PlanGoalMixResult[] = [];

  for (const item of mixesToEvaluate) {
    // 1. Build blended series
    const blended = await buildBlendedSeries(item.components, years, "annual", baseCurrency);
    if (blended.warnings) {
      for (const w of blended.warnings) warnings.push(w);
    }
    if (blended.end_date > latestAsOf) {
      latestAsOf = blended.end_date;
    }

    const returnsList = blended.monthly_returns.map(m => m.return);

    // 2. Simulate goal
    const sim = simulateGoal(
      returnsList,
      startValue,
      monthlyContribution,
      years,
      targetAmount,
      1000,
      inflation,
      feeDrag,
      seed
    );

    // 3. Solve required contribution
    const req = solveRequiredContribution(
      returnsList,
      startValue,
      years,
      targetAmount,
      confidence,
      inflation,
      false, // nominal
      feeDrag,
      seed
    );

    const weightsRecord: Record<string, number> = {};
    for (const c of item.components) {
      weightsRecord[c.asset_class] = Math.round(c.weight * 1000) / 1000;
    }

    results.push({
      mix_id: item.mix_id,
      name: item.name,
      label: item.label,
      description: item.description,
      rationale: item.rationale,
      risk_rating: item.risk_rating,
      weights: weightsRecord,
      horizon_adjustment: item.horizon_adjustment,
      historical_blended_cagr: Math.round(blended.annualized_return * 10000) / 10000,
      historical_annualized_volatility: Math.round(blended.annualized_volatility * 10000) / 10000,
      data_window: {
        start_date: blended.start_date,
        end_date: blended.end_date,
        total_months: blended.total_months
      },
      probability_of_success: sim.probability_of_success,
      real_probability_of_success: sim.real_probability_of_success,
      median_final_value: sim.median_final_value,
      p10_final: sim.p10_final,
      p90_final: sim.p90_final,
      real_median_final_value: sim.real_median_final_value,
      real_p10_final: sim.real_p10_final,
      real_p90_final: sim.real_p90_final,
      yearly_trajectory: sim.trajectories,
      drawdown_median: sim.drawdown_median,
      drawdown_p95: sim.drawdown_p95,
      required_monthly_contribution: req.required_monthly_contribution,
      achieved_probability: req.achieved_probability,
      achievable: req.achievable
    });
  }

  // Determine sources from history cache or components
  sourcesSet.add("yahoo");

  return {
    mixes: results,
    sources: Array.from(sourcesSet),
    as_of: latestAsOf || new Date().toISOString().slice(0, 10),
    warnings: Array.from(new Set(warnings)),
    disclaimer: STANDARD_DISCLAIMER
  };
}

// Validation Helpers
function validateNumber(val: any, name: string, min?: number, max?: number, integerOnly?: boolean): number {
  if (typeof val !== "number" || isNaN(val) || !isFinite(val)) {
    throw new Error(`Invalid argument '${name}': must be a finite number.`);
  }
  if (integerOnly && !Number.isInteger(val)) {
    throw new Error(`Invalid argument '${name}': must be an integer.`);
  }
  if (min !== undefined && val < min) {
    throw new Error(`Invalid argument '${name}': must be >= ${min}. Received: ${val}.`);
  }
  if (max !== undefined && val > max) {
    throw new Error(`Invalid argument '${name}': must be <= ${max}. Received: ${val}.`);
  }
  return val;
}

function validateReturnsArray(returns: any): number[] {
  if (!Array.isArray(returns) || returns.length < 12 || returns.length > 600) {
    throw new Error("Invalid argument 'returns': must be an array of 12 to 600 monthly decimal return numbers.");
  }
  for (let i = 0; i < returns.length; i++) {
    const r = returns[i];
    if (typeof r !== "number" || isNaN(r) || !isFinite(r) || r <= -1) {
      throw new Error(`Invalid return value at index ${i}: must be a finite number strictly greater than -1. Received: ${r}.`);
    }
  }
  return returns;
}

function validatePricesArray(prices: any): PricePoint[] {
  if (!Array.isArray(prices) || prices.length < 2 || prices.length > 600) {
    throw new Error("Invalid argument 'prices': must be an array of 2 to 600 price points.");
  }
  return prices;
}

function validateComponentsArray(components: any): BlendedComponent[] {
  if (!Array.isArray(components) || components.length < 1 || components.length > 10) {
    throw new Error("Invalid argument 'components': must be an array of 1 to 10 component objects.");
  }
  let sumWeights = 0;
  for (let i = 0; i < components.length; i++) {
    const c = components[i];
    if (!c || typeof c !== "object") throw new Error(`Invalid component at index ${i}.`);
    if (typeof c.weight !== "number" || isNaN(c.weight) || !isFinite(c.weight) || c.weight < 0) {
      throw new Error(`Invalid component weight at index ${i}: must be a finite number >= 0.`);
    }
    if (typeof c.fixed_rate === "number") {
      if (isNaN(c.fixed_rate) || !isFinite(c.fixed_rate) || c.fixed_rate < -0.05 || c.fixed_rate > 0.30) {
        throw new Error(`Invalid component fixed_rate at index ${i}: must be between -0.05 (-5%) and 0.30 (30%).`);
      }
    }
    sumWeights += c.weight;
  }
  if (sumWeights <= 0) {
    throw new Error("Invalid component weights: sum of weights must be strictly positive.");
  }
  return components;
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
    case "ping": {
      return {
        jsonrpc: "2.0",
        id: id ?? null,
        result: {}
      };
    }

    case "initialize": {
      const requestedVersion = params?.protocolVersion;
      const acceptedVersion =
        requestedVersion === "2024-11-05" || requestedVersion === "1.0.0"
          ? requestedVersion
          : "2024-11-05";

      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: acceptedVersion,
          capabilities: {
            tools: { listChanged: false }
          },
          serverInfo: {
            name: "etf-horizon-mcp-server",
            version: "2.1.0",
            description: "Goal-based Asset Allocation & Horizon Analytics Model Context Protocol service"
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
            if (!args.ticker || typeof args.ticker !== "string") {
              throw new Error("Missing or invalid required argument 'ticker'.");
            }
            const years = typeof args.years === "number" ? args.years : 10;
            if (years !== 5 && years !== 10) {
              throw new Error("Invalid argument 'years' for get_price_history: must be 5 or 10.");
            }
            const history = await fetchYahooPriceHistory(args.ticker, years);
            toolOutput = {
              ticker: args.ticker.toUpperCase(),
              currency: history.currency,
              years,
              dataPoints: history.prices.length,
              adjusted_close_available: history.adjusted_close_available,
              prices: history.prices,
              source: history.source,
              as_of: history.as_of,
              warning: history.warning,
              fee_drag_default: 0.002
            };
            break;
          }

          case "compute_metrics": {
            const prices = validatePricesArray(args.prices);
            toolOutput = calculateMetrics(prices);
            break;
          }

          case "project_scenarios": {
            const startVal = validateNumber(args.start_value, "start_value", 0);
            const baseCagr = validateNumber(args.base_cagr, "base_cagr", -0.99, 10.0);
            const years = typeof args.years === "number" ? validateNumber(args.years, "years", 1, 30, true) : 10;
            const contribution =
              typeof args.monthly_contribution === "number"
                ? validateNumber(args.monthly_contribution, "monthly_contribution", 0)
                : 500;
            const feeDrag =
              typeof args.fee_drag === "number" ? validateNumber(args.fee_drag, "fee_drag", 0, 0.20) : 0.002;
            toolOutput = calculateScenarios(startVal, baseCagr, years, contribution, feeDrag);
            break;
          }

          case "monte_carlo": {
            const prices = validatePricesArray(args.prices);
            const startVal =
              typeof args.start_value === "number" ? validateNumber(args.start_value, "start_value", 0) : 10000;
            const years = typeof args.years === "number" ? validateNumber(args.years, "years", 1, 30, true) : 10;
            const contribution =
              typeof args.monthly_contribution === "number"
                ? validateNumber(args.monthly_contribution, "monthly_contribution", 0)
                : 500;
            const paths =
              typeof args.n_paths === "number" ? validateNumber(args.n_paths, "n_paths", 100, 3000, true) : 1000;
            const feeDrag =
              typeof args.fee_drag === "number" ? validateNumber(args.fee_drag, "fee_drag", 0, 0.20) : 0.002;
            const seed = typeof args.seed === "number" ? validateNumber(args.seed, "seed", 0, undefined, true) : 42;
            toolOutput = calculateMonteCarlo(prices, startVal, years, contribution, paths, feeDrag, seed);
            break;
          }

          case "build_blended_series": {
            const comps = validateComponentsArray(args.components);
            const years = typeof args.years === "number" ? validateNumber(args.years, "years", 1, 30, true) : 10;
            const rebalance = args.rebalance || "annual";
            const baseCurrency = args.base_currency || "SGD";
            toolOutput = await buildBlendedSeries(comps, years, rebalance, baseCurrency);
            break;
          }

          case "simulate_goal": {
            const returns = validateReturnsArray(args.returns);
            const startVal = validateNumber(args.start_value, "start_value", 0);
            const contribution = validateNumber(args.monthly_contribution, "monthly_contribution", 0);
            const years = validateNumber(args.years, "years", 1, 30, true);
            const target = validateNumber(args.target_amount, "target_amount", 1);
            const nPaths =
              typeof args.n_paths === "number" ? validateNumber(args.n_paths, "n_paths", 100, 3000, true) : 1000;
            const inflation =
              typeof args.inflation === "number" ? validateNumber(args.inflation, "inflation", -0.10, 0.50) : 0.025;
            const feeDrag =
              typeof args.fee_drag === "number" ? validateNumber(args.fee_drag, "fee_drag", 0, 0.20) : 0.002;
            const seed = typeof args.seed === "number" ? validateNumber(args.seed, "seed", 0, undefined, true) : 42;

            toolOutput = simulateGoal(returns, startVal, contribution, years, target, nPaths, inflation, feeDrag, seed);
            break;
          }

          case "solve_required_contribution": {
            const returns = validateReturnsArray(args.returns);
            const startVal = validateNumber(args.start_value, "start_value", 0);
            const years = validateNumber(args.years, "years", 1, 30, true);
            const target = validateNumber(args.target_amount, "target_amount", 1);
            const confidence =
              typeof args.confidence === "number" ? validateNumber(args.confidence, "confidence", 0.50, 0.99) : 0.80;
            const inflation =
              typeof args.inflation === "number" ? validateNumber(args.inflation, "inflation", -0.10, 0.50) : 0.025;
            const realTerms = !!args.real_terms;
            const feeDrag =
              typeof args.fee_drag === "number" ? validateNumber(args.fee_drag, "fee_drag", 0, 0.20) : 0.002;
            const seed = typeof args.seed === "number" ? validateNumber(args.seed, "seed", 0, undefined, true) : 42;

            toolOutput = solveRequiredContribution(
              returns,
              startVal,
              years,
              target,
              confidence,
              inflation,
              realTerms,
              feeDrag,
              seed
            );
            break;
          }

          case "suggest_mixes": {
            const riskLevel = validateNumber(args.risk_level, "risk_level", 1, 5);
            const horizon = validateNumber(args.horizon_years, "horizon_years", 1, 30, true);
            toolOutput = suggestMixes(riskLevel, horizon);
            break;
          }

          case "plan_goal": {
            const startVal = validateNumber(args.start_value, "start_value", 0);
            const contribution = validateNumber(args.monthly_contribution, "monthly_contribution", 0);
            const years = validateNumber(args.years, "years", 1, 30, true);
            const target = validateNumber(args.target_amount, "target_amount", 1);
            const confidence =
              typeof args.confidence === "number" ? validateNumber(args.confidence, "confidence", 0.50, 0.99) : 0.80;
            const inflation =
              typeof args.inflation === "number" ? validateNumber(args.inflation, "inflation", -0.10, 0.50) : 0.025;
            const feeDrag =
              typeof args.fee_drag === "number" ? validateNumber(args.fee_drag, "fee_drag", 0, 0.20) : 0.002;
            const baseCurrency = args.base_currency || "SGD";
            const seed = typeof args.seed === "number" ? validateNumber(args.seed, "seed", 0, undefined, true) : 42;
            const riskLevel = typeof args.risk_level === "number" ? validateNumber(args.risk_level, "risk_level", 1, 5) : undefined;
            const components = args.components ? validateComponentsArray(args.components) : undefined;

            toolOutput = await planGoal({
              start_value: startVal,
              monthly_contribution: contribution,
              years,
              target_amount: target,
              confidence,
              inflation,
              fee_drag: feeDrag,
              base_currency: baseCurrency,
              seed,
              risk_level: riskLevel,
              components
            });
            break;
          }

          default:
            // Phase 4.1: Unknown tool name returns JSON-RPC error code -32602
            return {
              jsonrpc: "2.0",
              id,
              error: { code: -32602, message: `Tool '${toolName}' not found.` }
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

  // Phase 4.1: Handle JSON-RPC batch (array) requests
  if (Array.isArray(body)) {
    if (body.length === 0) {
      return res.status(200).json({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32600, message: "Invalid Request: Batch request cannot be empty." }
      });
    }

    const responses: any[] = [];
    for (const item of body) {
      if (item && typeof item.method === "string" && item.method.startsWith("notifications/")) {
        // Notification in batch produces no entry
        continue;
      }
      const resp = await handleMcpPayload(item);
      if (resp !== null) {
        responses.push(resp);
      }
    }

    if (responses.length === 0) {
      return res.status(202).end();
    }
    return res.status(200).json(responses);
  }

  // Phase 4.1: Handle single notifications (any method starting with "notifications/")
  if (body && typeof body.method === "string" && body.method.startsWith("notifications/")) {
    return res.status(202).end();
  }

  const responsePayload = await handleMcpPayload(body);
  return res.status(200).json(responsePayload);
}

export { handler };
