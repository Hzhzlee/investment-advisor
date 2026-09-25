# ETF Horizon

> Executive-ready ETF performance analytics, 10-year forward wealth projections, and Singapore goal-based asset allocation planning platform powered by a Model Context Protocol (MCP) serverless architecture.

**ETF Horizon** models multi-asset portfolio compounding and simulates goal achievement using block bootstrap simulations and stochastic Monte Carlo models. The app requires **NO API keys and NO environment variables of any kind**, and is designed to deploy on Vercel from GitHub with zero configuration or code modifications.

---

## Key Features & Architecture

- **Stateless MCP Server (`/api/mcp.ts`):** Implements JSON-RPC 2.0 over HTTP POST handling `initialize`, `ping`, `notifications/*` (HTTP 202), JSON-RPC batch requests, `tools/list`, and `tools/call`. No external MCP SDK required.
- **Client-Side MCP Client:** The React front end operates strictly as an MCP client. The browser never fetches market data directly.
- **Zero-Key Public Data Ingestion:** Historical price series are retrieved server-side in `/api/mcp.ts` from Yahoo Finance's public chart endpoint with in-memory caching and 8-second request timeouts.
- **Source Transparency & Benchmark Fallbacks:** When Yahoo Finance is unreachable or rate-limited, verified benchmark snapshots from `src/data/benchmarks.ts` are utilized and explicitly surfaced in the UI and response warnings.
- **Seeded PRNG (Mulberry32):** Deterministic and reproducible block bootstrap simulations across runs using an explicit `seed` parameter (default: 42).
- **Multi-Currency FX Alignment:** Converts non-base currency components (e.g. USD assets in an SGD portfolio) using synchronized monthly FX exchange series (e.g. `USDSGD=X`).
- **Calendar-Month Alignment & Unit Drawdown:** Blended multi-asset series join strictly on calendar-month (YYYY-MM) intersections. Drawdowns are computed on unit wealth indices (1.0 initial) to isolate market declines from ongoing monthly cash inflows.
- **Consolidated `plan_goal` Tool:** Server-side evaluation tool consolidating fetch, currency conversion, blended series construction, bootstrap simulation, and contribution solving in a single call.
- **Fee Drag Assumption:** Projections and simulations incorporate a default **0.20% p.a. (0.002) fee drag** assumption.

---

## MCP Tools (JSON Schemas)

The MCP serverless function at `/api/mcp.ts` exposes 9 tools:

### 1. `get_price_history(ticker, years=10)`
Fetches monthly closing prices and native currency from Yahoo Finance.
- Decides raw vs adjusted close consistently across the entire series.
- Drops the current incomplete month.
- Includes `source` ("yahoo" or "benchmark_snapshot") and `as_of`.

### 2. `compute_metrics(prices)`
Computes historical CAGR, annualised volatility ($\sigma \times \sqrt{12}$), and maximum peak-to-trough drawdown from monthly price series.

### 3. `project_scenarios(start_value, base_cagr, years=10, monthly_contribution=500, fee_drag=0.002)`
Deterministic forward projections across five relative scenarios (Severe Bear, Conservative, Base, Optimistic, Strong Bull) with net monthly compounding and default 0.20% fee drag.

### 4. `monte_carlo(prices, start_value=10000, years=10, monthly_contribution=500, n_paths=1000, fee_drag=0.002, seed=42)`
Stochastic Geometric Brownian Motion (GBM) simulation yielding 10th, 50th (median), and 90th percentile trajectories with optional PRNG seed.

### 5. `build_blended_series(components, years=10, rebalance="annual", base_currency="SGD")`
Blends up to 10 market and fixed-rate assets:
- Calendar-month (YYYY-MM) intersection alignment across all assets.
- Monthly FX conversion of non-base currency assets to `base_currency`.
- Rebalances annually from the start month.
- Returns `start_date`, `end_date`, `aligned_months`, and component metadata (`currency`, `fx_applied`).

### 6. `simulate_goal(returns, start_value, monthly_contribution, years, target_amount, n_paths=1000, inflation=0.025, fee_drag=0.002, seed=42)`
Simulates forward goal outcomes using 6-month block bootstrapping:
- Seeded Mulberry32 PRNG ensures deterministic results.
- Drawdowns computed on a 1.0 unit return index (free from contribution distortion).
- Returns `probability_of_success` (nominal and real), percentile trajectories, `drawdown_median`, and `drawdown_p95`.

### 7. `solve_required_contribution(returns, start_value, years, target_amount, confidence=0.80, inflation=0.025, real_terms=false, fee_drag=0.002, seed=42)`
Finds the minimal monthly contribution satisfying $P(\text{terminal} \ge \text{target}) \ge \text{confidence}$:
- Bisects directly on success probability using common random numbers (same seed for all candidates).
- Searches up to a sensible cap. If unattainable, returns `achievable: false` with the achieved probability at the cap.

### 8. `suggest_mixes(risk_level, horizon_years)`
Generates 3 illustrative asset allocations for Singapore investors:
- Applies a deterministic horizon glide rule:
  - $\le 3$ years: shifts 40% equity/reits/gold into gov-backed (60%) and cash (40%).
  - 4–5 years: shifts 20% equity/reits/gold into gov-backed (60%) and cash (40%).
  - $\ge 6$ years: no horizon adjustment.
- Descriptions dynamically generated from actual weights.
- Returns `horizon_adjustment` in percentage points.

### 9. `plan_goal(start_value, monthly_contribution, years, target_amount, confidence=0.80, inflation=0.025, fee_drag=0.002, base_currency="SGD", seed=42, risk_level, components)`
Full-pipeline server-side tool evaluating all 3 suggested mixes (via `risk_level`) or a custom mix in a single round-trip without transmitting large return arrays. Returns historical metrics, trajectories, drawdowns, required contributions, `sources`, `as_of`, `warnings`, and disclaimers.

---

## Benchmark Historical Snapshots (`src/data/benchmarks.ts`)

The fallback benchmark price series in `src/data/benchmarks.ts` represent verified real-world monthly adjusted and raw closing price snapshots taken in **January 2025** covering the 10-year period from **2015-01 to 2025-01**:

1. **`ES3.SI` (SPDR Straits Times Index ETF)**: Exchange closing prices from Singapore Exchange (SGX) in SGD.
2. **`SPY` (SPDR S&P 500 ETF Trust)**: Exchange closing prices from NYSE Arca in USD.
3. **`VT` (Vanguard Total World Stock ETF)**: Exchange closing prices from NYSE Arca in USD.
4. **`AGG` (iShares Core U.S. Aggregate Bond ETF)**: Exchange closing prices from NYSE Arca in USD.
5. **`VNQ` (Vanguard Real Estate ETF)**: Exchange closing prices from NYSE Arca in USD.
6. **`GLD` (SPDR Gold Shares)**: Exchange closing prices from NYSE Arca in USD.

When the live Yahoo Finance endpoint is unavailable, these snapshots are utilized and an explicit warning is attached to the response and surfaced in the application.

---

## Disclaimer

> **Illustrative scenarios based on past data and stated assumptions. Not personalised financial advice. Past performance does not guarantee future results.**

---

## Local Development & Testing

### 1. Run Tests
```bash
npm test
```
Verifies seeded PRNG reproducibility, solver probability bisection and monotonicity, unattainable bounds, YYYY-MM calendar alignment, FX conversions, and JSON-RPC 2.0 protocol compliance.

### 2. Lint & Build
```bash
npm run lint
npm run build
```

### 3. Run Development Server
```bash
npm run dev
```
Starts on [http://localhost:3000](http://localhost:3000).
