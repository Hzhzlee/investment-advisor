# ETF Horizon

> Executive-ready ETF performance analytics and 10-year forward wealth projection platform powered by a Model Context Protocol (MCP) serverless architecture.

**ETF Horizon** charts historical ETF performance and projects terminal portfolio wealth 10 years forward using five deterministic relative scenarios alongside stochastic Monte Carlo simulations. The app requires **NO API keys and NO environment variables of any kind**, and is designed to deploy on Vercel from GitHub with zero configuration or code modifications.

---

## Key Features & Architecture

- **Stateless MCP Server (`/api/mcp.ts`):** Implements JSON-RPC 2.0 over HTTP POST handling `initialize`, `tools/list`, and `tools/call`. No external MCP SDK required.
- **Client-Side MCP Client:** The React front end is an MCP client. It calls `tools/list` on initial load and `tools/call` for every user action. The browser never fetches market data directly.
- **Zero-Key Public Data Ingestion:** Historical price series are retrieved server-side in `/api/mcp.ts` from Yahoo Finance's public chart endpoint (`https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?range=10y&interval=1mo`) using standard browser headers. Zero API keys, zero rate limits, zero tokens required.
- **Chart 1 (Forward Horizon):** Solid historical price line flowing smoothly into five scenario projections (dashed), with the Monte Carlo 10th-90th band shaded. Exactly one point per year with ordered, chronological axes.
- **Chart 2 (Comparative Horizon):** Compare up to 3 ETFs (defaults: `ES3.SI`, `SPY`, `VT`, plus custom tickers) indexed to base 100.
- **Prominent MCP Activity Panel:** Live audit log of every `tools/list` and `tools/call` invocation with tool name, arguments, latency (ms), status, and an interactive "Show raw JSON-RPC" payload inspector.
- **Resilient Fallback:** Drag-and-drop CSV uploader (Date, Close) for custom or offline price series; uploaded data executes through the exact same MCP analytical toolchain.

---

## MCP Tools (JSON Schemas)

The MCP serverless function at `/api/mcp.ts` exposes four institutional tools:

### 1. `get_price_history(ticker, years)`
Fetches monthly closing prices and native currency from Yahoo Finance.
```json
{
  "type": "object",
  "properties": {
    "ticker": { "type": "string", "description": "ETF or stock symbol (e.g. 'ES3.SI', 'SPY', 'VT', 'QQQ')" },
    "years": { "type": "number", "description": "Lookback duration in years (5 or 10)", "default": 10 }
  },
  "required": ["ticker"]
}
```
*Returns:* `{ ticker, currency, years, dataPoints, prices: [{ date: "YYYY-MM-DD", close: number }] }`

### 2. `compute_metrics(prices)`
Computes CAGR, annualised volatility ($\sigma \times \sqrt{12}$), and maximum peak-to-trough drawdown.
```json
{
  "type": "object",
  "properties": {
    "prices": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "date": { "type": "string" },
          "close": { "type": "number" }
        },
        "required": ["date", "close"]
      }
    }
  },
  "required": ["prices"]
}
```
*Returns:* `{ cagr, annualized_volatility, max_drawdown, start_date, end_date, total_months, start_price, end_price }`

### 3. `project_scenarios(start_value, base_cagr, years, monthly_contribution)`
Computes 10-year forward deterministic projections across five scenarios with CAGRs adjusted RELATIVE to the base CAGR:
- Severe Bear: base $\times 0.80$ (-20% rel)
- Conservative: base $\times 0.90$ (-10% rel)
- Base: base $\times 1.00$ (0% rel)
- Optimistic: base $\times 1.10$ (+10% rel)
- Strong Bull: base $\times 1.20$ (+20% rel)
Compounded monthly including regular monthly contributions: $r_{\text{monthly}} = (1 + r)^{1/12} - 1$.
```json
{
  "type": "object",
  "properties": {
    "start_value": { "type": "number", "description": "Starting investment capital" },
    "base_cagr": { "type": "number", "description": "Base CAGR decimal (e.g. 0.06)" },
    "years": { "type": "number", "default": 10 },
    "monthly_contribution": { "type": "number", "default": 500 }
  },
  "required": ["start_value", "base_cagr"]
}
```

### 4. `monte_carlo(prices, years, monthly_contribution, n_paths=1000)`
Simulates 1,000 forward paths via Geometric Brownian Motion from sample mean log return and standard deviation.
```json
{
  "type": "object",
  "properties": {
    "prices": { "type": "array" },
    "start_value": { "type": "number", "default": 10000 },
    "years": { "type": "number", "default": 10 },
    "monthly_contribution": { "type": "number", "default": 500 },
    "n_paths": { "type": "number", "default": 1000 }
  },
  "required": ["prices"]
}
```
*Returns:* 10th (downside), 50th (median), and 90th percentile trajectories.

---

## Local Development

### 1. Install dependencies
```bash
npm install
```

### 2. Run local development server
```bash
npm run dev
```
The application starts at [http://localhost:3000](http://localhost:3000). The local server runs Express (`server.ts`) with Vite middlewares mounted in dev, routing all `/api/mcp` requests directly to the MCP serverless handler.

### 3. Verify TypeScript and Build
```bash
npm run lint
npm run build
```

---

## Vercel Deployment (Zero Code Changes, Zero API Keys)

1. Push your repository to GitHub.
2. In [Vercel](https://vercel.com/new), select **"Import Project"** and choose your repository.
3. Framework preset will automatically detect as **Vite**.
4. **No Environment Variables are needed!** Leave environment variables blank.
5. Click **Deploy**.

Vercel will:
- Build the static frontend bundle with `vite build`.
- Serve `/api/mcp.ts` as a serverless function with CORS enabled.
- Route requests seamlessly using `vercel.json`.

---

## Connecting `/api/mcp` to Remote MCP Clients

You can also use this deployed MCP endpoint with any MCP-compatible agent or client:

### In an MCP client configuration:
Add the server using a lightweight HTTP proxy:
```json
{
  "mcpServers": {
    "etf-horizon": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-proxy",
        "--transport",
        "http",
        "--url",
        "https://<your-vercel-deployment>.vercel.app/api/mcp"
      ]
    }
  }
}
```
The client will automatically recognize the four tools (`get_price_history`, `compute_metrics`, `project_scenarios`, and `monte_carlo`).

---

## Underlying Assumptions

1. **Monthly Compounding:** Growth compounds each month using effective monthly interest $r_m = (1 + r_{\text{annual}})^{1/12} - 1$.
2. **Contributions:** Deposited at the start of each month and compounded forward.
3. **Past Performance:** Historical returns exclude dividends, reinvestment withholdings, and management expense ratios unless explicitly adjusted.
4. **Regulatory Notice:** Projections are illustrative, based on past prices, exclude dividends and fees, and are not financial advice.
