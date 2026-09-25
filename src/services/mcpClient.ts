/**
 * ETF Horizon - MCP Client Service
 * Dispatches stateless JSON-RPC 2.0 requests over HTTP POST to /api/mcp.
 * Emits live event telemetry for the MCP Activity Panel.
 */

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: any;
}

export interface McpActivityLog {
  id: string;
  rpcId: number;
  timestamp: string;
  method: string;
  toolName?: string;
  args?: any;
  durationMs: number;
  status: 'pending' | 'success' | 'error';
  requestPayload: any;
  responsePayload?: any;
  error?: string;
}

type ActivityListener = (logs: McpActivityLog[]) => void;

class McpClientService {
  private rpcCounter = 1;
  private logs: McpActivityLog[] = [];
  private listeners: Set<ActivityListener> = new Set();
  private availableTools: McpToolDefinition[] = [];
  private isInitialized = false;

  public subscribe(listener: ActivityListener): () => void {
    this.listeners.add(listener);
    listener([...this.logs]);
    return () => this.listeners.delete(listener);
  }

  public getLogs(): McpActivityLog[] {
    return [...this.logs];
  }

  public clearLogs() {
    this.logs = [];
    this.notify();
  }

  private notify() {
    for (const listener of this.listeners) {
      listener([...this.logs]);
    }
  }

  private addLog(log: McpActivityLog) {
    this.logs.unshift(log);
    if (this.logs.length > 100) {
      this.logs = this.logs.slice(0, 100);
    }
    this.notify();
  }

  private updateLog(id: string, updates: Partial<McpActivityLog>) {
    const idx = this.logs.findIndex(l => l.id === id);
    if (idx !== -1) {
      this.logs[idx] = { ...this.logs[idx], ...updates };
      this.notify();
    }
  }

  /**
   * Generic JSON-RPC 2.0 POST dispatcher to /api/mcp
   */
  public async sendRpc<T = any>(method: string, params: any = {}, toolName?: string): Promise<T> {
    const rpcId = this.rpcCounter++;
    const logId = `log_${Date.now()}_${rpcId}`;
    const startTime = performance.now();

    const requestPayload = {
      jsonrpc: '2.0',
      id: rpcId,
      method,
      params
    };

    const initialLog: McpActivityLog = {
      id: logId,
      rpcId,
      timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }) + '.' + String(Date.now() % 1000).padStart(3, '0'),
      method,
      toolName,
      args: toolName ? params.arguments : params,
      durationMs: 0,
      status: 'pending',
      requestPayload
    };

    this.addLog(initialLog);

    try {
      const response = await fetch('/api/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(requestPayload)
      });

      const durationMs = Math.round(performance.now() - startTime);

      if (!response.ok) {
        const errorText = await response.text();
        let parsedError: any;
        try { parsedError = JSON.parse(errorText); } catch { /* ignore */ }
        
        const message = parsedError?.error?.message || `HTTP ${response.status}: ${response.statusText}`;
        this.updateLog(logId, {
          durationMs,
          status: 'error',
          responsePayload: parsedError || { raw: errorText },
          error: message
        });
        throw new Error(message);
      }

      const json = await response.json();

      if (json.error) {
        this.updateLog(logId, {
          durationMs,
          status: 'error',
          responsePayload: json,
          error: json.error.message || 'JSON-RPC Error'
        });
        throw new Error(json.error.message || 'JSON-RPC error');
      }

      // Check if tool call returned content with isError = true
      if (json.result?.isError && Array.isArray(json.result?.content)) {
        const errContent = json.result.content.map((c: any) => c.text).join('\n');
        this.updateLog(logId, {
          durationMs,
          status: 'error',
          responsePayload: json,
          error: errContent || 'Tool execution failed'
        });
        throw new Error(errContent || 'Tool execution failed');
      }

      this.updateLog(logId, {
        durationMs,
        status: 'success',
        responsePayload: json
      });

      return json.result;
    } catch (err: any) {
      const durationMs = Math.round(performance.now() - startTime);
      this.updateLog(logId, {
        durationMs,
        status: 'error',
        error: err?.message || String(err)
      });
      throw err;
    }
  }

  /**
   * Initializes MCP connection
   */
  public async initialize(): Promise<any> {
    const result = await this.sendRpc('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'etf-horizon-client',
        version: '1.0.0'
      }
    });
    this.isInitialized = true;
    return result;
  }

  /**
   * Lists available tools from MCP server
   */
  public async listTools(): Promise<McpToolDefinition[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    const result = await this.sendRpc<{ tools: McpToolDefinition[] }>('tools/list', {});
    this.availableTools = result?.tools || [];
    return this.availableTools;
  }

  /**
   * Invokes an MCP tool via tools/call
   */
  public async callTool<T = any>(name: string, args: Record<string, any>): Promise<T> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const result = await this.sendRpc('tools/call', { name, arguments: args }, name);

    // MCP tools/call standard response contains: content: [{ type: "text", text: "..." }]
    if (result && Array.isArray(result.content) && result.content[0]?.text) {
      const text = result.content[0].text;
      try {
        return JSON.parse(text) as T;
      } catch {
        return text as unknown as T;
      }
    }

    return result as T;
  }

  // Typed tool callers
  public async getPriceHistory(ticker: string, years: number = 10) {
    return this.callTool<{
      ticker: string;
      currency: string;
      years: number;
      dataPoints: number;
      adjusted_close_available: boolean;
      prices: Array<{
        date: string;
        close: number;
        raw_close?: number;
        adj_close?: number;
        is_adjusted?: boolean;
      }>;
      fee_drag_default: number;
    }>('get_price_history', { ticker, years });
  }

  public async computeMetrics(prices: Array<{ date: string; close: number }>) {
    return this.callTool<{
      cagr: number;
      annualized_volatility: number;
      max_drawdown: number;
      start_date: string;
      end_date: string;
      total_months: number;
      start_price: number;
      end_price: number;
    }>('compute_metrics', { prices });
  }

  public async projectScenarios(
    startValue: number,
    baseCagr: number,
    years: number = 10,
    monthlyContribution: number = 500,
    feeDrag: number = 0.002
  ) {
    return this.callTool<Array<{
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
    }>>('project_scenarios', {
      start_value: startValue,
      base_cagr: baseCagr,
      years,
      monthly_contribution: monthlyContribution,
      fee_drag: feeDrag
    });
  }

  public async monteCarlo(
    prices: Array<{ date: string; close: number }>,
    startValue: number = 10000,
    years: number = 10,
    monthlyContribution: number = 500,
    nPaths: number = 1000,
    feeDrag: number = 0.002
  ) {
    return this.callTool<{
      p10_final: number;
      p50_final: number;
      p90_final: number;
      trajectories: Array<{
        year: number;
        p10: number;
        p50: number;
        p90: number;
      }>;
    }>('monte_carlo', {
      prices,
      start_value: startValue,
      years,
      monthly_contribution: monthlyContribution,
      n_paths: nPaths,
      fee_drag: feeDrag
    });
  }

  public async buildBlendedSeries(
    components: Array<{
      asset_class: string;
      ticker?: string;
      fixed_rate?: number;
      weight: number;
      prices?: Array<{ date: string; close: number }>;
    }>,
    years: number = 10,
    rebalance: string = 'annual',
    baseCurrency: string = 'SGD'
  ) {
    return this.callTool<{
      monthly_returns: Array<{ date: string; return: number; index_value: number }>;
      annualized_return: number;
      annualized_volatility: number;
      max_drawdown: number;
      total_months: number;
      start_date?: string;
      end_date?: string;
      aligned_months?: number;
      base_currency?: string;
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
    }>('build_blended_series', { components, years, rebalance, base_currency: baseCurrency });
  }

  public async simulateGoal(
    returns: number[],
    startValue: number,
    monthlyContribution: number,
    years: number,
    targetAmount: number,
    nPaths: number = 1000,
    inflation: number = 0.025,
    feeDrag: number = 0.002,
    seed: number = 42
  ) {
    return this.callTool<{
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
      drawdown_median?: number;
      drawdown_p95?: number;
      worst_case_drawdown: number;
      total_contributed: number;
      target_amount: number;
      years: number;
      inflation: number;
      fee_drag: number;
      seed?: number;
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
    }>('simulate_goal', {
      returns,
      start_value: startValue,
      monthly_contribution: monthlyContribution,
      years,
      target_amount: targetAmount,
      n_paths: nPaths,
      inflation,
      fee_drag: feeDrag,
      seed
    });
  }

  public async solveRequiredContribution(
    returns: number[],
    startValue: number,
    years: number,
    targetAmount: number,
    confidence: number = 0.80,
    inflation: number = 0.025,
    realTerms: boolean = false,
    feeDrag: number = 0.002,
    seed: number = 42
  ) {
    return this.callTool<{
      required_monthly_contribution: number;
      achieved_probability?: number;
      confidence: number;
      achievable?: boolean;
      target_amount: number;
      years: number;
      start_value: number;
      real_terms: boolean;
      inflation: number;
      fee_drag: number;
      seed?: number;
      expected_terminal_p50: number;
    }>('solve_required_contribution', {
      returns,
      start_value: startValue,
      years,
      target_amount: targetAmount,
      confidence,
      inflation,
      real_terms: realTerms,
      fee_drag: feeDrag,
      seed
    });
  }

  public async suggestMixes(riskLevel: number, horizonYears: number) {
    return this.callTool<{
      risk_level: number;
      horizon_years: number;
      mixes: Array<{
        id: string;
        name: string;
        label: string;
        description: string;
        rationale: string;
        risk_rating: string;
        horizon_adjustment?: number;
        components: Array<{
          asset_class: any;
          name: string;
          default_proxy: string;
          is_fixed_rate: boolean;
          default_rate?: number;
          weight: number;
        }>;
      }>;
    }>('suggest_mixes', { risk_level: riskLevel, horizon_years: horizonYears });
  }

  public async planGoal(args: {
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
    components?: Array<{
      asset_class: string;
      ticker?: string;
      fixed_rate?: number;
      weight: number;
    }>;
  }) {
    return this.callTool<{
      mixes: Array<{
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
      }>;
      sources: string[];
      as_of: string;
      warnings: string[];
      disclaimer: string;
    }>('plan_goal', args);
  }
}

export const mcpClient = new McpClientService();
