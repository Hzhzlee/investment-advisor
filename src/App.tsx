/**
 * ETF Horizon - Singapore Goal-Based Asset Allocation Illustrator
 * Extends the institutional ETF horizon engine into a goal-based asset allocation
 * illustrator for basic investors in Singapore.
 * 
 * Front-end operates strictly as a Model Context Protocol (MCP) client communicating with /api/mcp.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Header } from './components/Header';
import { GoalPlanner, SINGAPORE_GOAL_PRESETS, GoalPreset } from './components/GoalPlanner';
import { AllocationMixCard } from './components/AllocationMixCard';
import { GoalTrajectoryChart } from './components/GoalTrajectoryChart';
import { CustomAllocationEditor } from './components/CustomAllocationEditor';
import { Controls } from './components/Controls';
import { KpiCards } from './components/KpiCards';
import { BenchmarkComparisonChart } from './components/BenchmarkComparisonChart';
import { SummaryTable } from './components/SummaryTable';
import { McpActivityPanel } from './components/McpActivityPanel';
import { CsvUploadModal } from './components/CsvUploadModal';
import { Footer } from './components/Footer';
import { mcpClient } from './services/mcpClient';
import { BENCHMARKS, parseCSVToPrices } from './data/benchmarks';
import {
  PricePoint,
  MetricResults,
  ScenarioResult,
  MonteCarloResult,
  AssetClassKey,
  AssetClassConfig,
  MixAnalyticsState,
} from './types';
import {
  AlertTriangle,
  UploadCloud,
  CheckCircle,
  Database,
  Layers,
  Sparkles,
  RefreshCw,
  Info,
} from 'lucide-react';

const DEFAULT_ASSET_CONFIGS: Record<AssetClassKey, AssetClassConfig> = {
  cash: {
    key: 'cash',
    name: 'Cash / Fixed Deposit',
    shortName: 'Cash',
    isFixedRate: true,
    defaultFixedRate: 0.020,
    fixedRate: 0.020,
    defaultProxy: 'Cash',
    currentProxy: 'Cash',
    assumptionNote: 'Assumed rate to update — reflects prevailing Singapore bank fixed deposits / high-yield savings (default 2.0%).',
    description: 'Ultra-liquid capital buffer with zero market risk and predictable nominal interest.',
    color: '#10b981',
    category: 'Cash & Sovereign'
  },
  gov_backed: {
    key: 'gov_backed',
    name: 'Gov-Backed (T-Bills / SSB)',
    shortName: 'SSB/T-Bills',
    isFixedRate: true,
    defaultFixedRate: 0.028,
    fixedRate: 0.028,
    defaultProxy: 'SSB/T-Bills',
    currentProxy: 'SSB/T-Bills',
    assumptionNote: 'Assumed rate to update — reflects prevailing MAS Singapore 6-month T-bill / 10-year SSB coupon (default 2.8%).',
    description: 'Singapore Government-backed sovereign debt with highest AAA credit rating and capital safety.',
    color: '#0ea5e9',
    category: 'Cash & Sovereign'
  },
  bonds: {
    key: 'bonds',
    name: 'Global / US Aggregate Bonds',
    shortName: 'Bonds',
    isFixedRate: false,
    defaultProxy: 'AGG',
    currentProxy: 'AGG',
    description: 'Investment-grade fixed income providing coupon income and equity crash cushion.',
    color: '#6366f1',
    category: 'Fixed Income'
  },
  global_equity: {
    key: 'global_equity',
    name: 'Global Equities',
    shortName: 'Global Eq',
    isFixedRate: false,
    defaultProxy: 'VT',
    currentProxy: 'VT',
    description: 'Broad worldwide stock market exposure across 9,000+ companies in 40+ countries.',
    color: '#3b82f6',
    category: 'Equities'
  },
  sg_equity: {
    key: 'sg_equity',
    name: 'Singapore Equities (STI)',
    shortName: 'SG Equity',
    isFixedRate: false,
    defaultProxy: 'ES3.SI',
    currentProxy: 'ES3.SI',
    description: 'Top 30 blue-chip companies on the SGX (DBS, OCBC, Singtel) with strong dividend yields.',
    color: '#f43f5e',
    category: 'Equities'
  },
  reits: {
    key: 'reits',
    name: 'Real Estate / REITs',
    shortName: 'REITs',
    isFixedRate: false,
    defaultProxy: 'VNQ',
    currentProxy: 'VNQ',
    description: 'Income-generating real estate investment trusts offering inflation-linked dividend streams.',
    color: '#f59e0b',
    category: 'Real Assets'
  },
  gold: {
    key: 'gold',
    name: 'Physical Gold',
    shortName: 'Gold',
    isFixedRate: false,
    defaultProxy: 'GLD',
    currentProxy: 'GLD',
    description: 'Physical gold bullion acting as non-correlated crisis insurance and currency debasement hedge.',
    color: '#eab308',
    category: 'Real Assets'
  }
};

export default function App() {
  // Navigation View Mode: Goal Allocation Illustrator vs Preserved Single ETF Deep Dive
  const [viewMode, setViewMode] = useState<'goal_allocation' | 'single_etf'>('goal_allocation');

  // Base Currency Display
  const [currency, setCurrency] = useState<'SGD' | 'USD'>('SGD');

  // 1. Goal Parameters
  const [selectedPresetId, setSelectedPresetId] = useState<string>('retirement');
  const [targetAmount, setTargetAmount] = useState<number>(600000);
  const [years, setYears] = useState<number>(15);
  const [startValue, setStartValue] = useState<number>(30000);
  const [monthlyContribution, setMonthlyContribution] = useState<number>(1200);
  const [riskLevel, setRiskLevel] = useState<number>(3);
  const [inflation, setInflation] = useState<number>(0.025); // default 2.5% Singapore MAS baseline
  const [feeDrag, setFeeDrag] = useState<number>(0.002); // default 0.20% expense drag
  const [isRealTerms, setIsRealTerms] = useState<boolean>(false);

  // 2. Asset Building Blocks & Proxies
  const [assetConfigs, setAssetConfigs] = useState<Record<AssetClassKey, AssetClassConfig>>(DEFAULT_ASSET_CONFIGS);

  // 3. Illustrative Mix Analytics & Custom Allocation
  const [mixStates, setMixStates] = useState<MixAnalyticsState[]>([]);
  const [customWeights, setCustomWeights] = useState<Record<AssetClassKey, number>>({
    cash: 0.10,
    gov_backed: 0.15,
    bonds: 0.20,
    global_equity: 0.30,
    sg_equity: 0.15,
    reits: 0.05,
    gold: 0.05
  });
  const [customMixState, setCustomMixState] = useState<MixAnalyticsState | null>(null);
  const [activeChartMixId, setActiveChartMixId] = useState<string>('mix_1');

  // 4. Preserved Single ETF State
  const [singleTicker, setSingleTicker] = useState('ES3.SI');
  const [singleYears, setSingleYears] = useState(10);
  const [singleInitial, setSingleInitial] = useState(10000);
  const [singleMonthly, setSingleMonthly] = useState(500);
  const [singleCagrAdj, setSingleCagrAdj] = useState(0);
  const [singlePrices, setSinglePrices] = useState<PricePoint[]>([]);
  const [singleMetrics, setSingleMetrics] = useState<MetricResults | null>(null);
  const [singleScenarios, setSingleScenarios] = useState<ScenarioResult[]>([]);
  const [singleMonteCarlo, setSingleMonteCarlo] = useState<MonteCarloResult | null>(null);

  // Global App States
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSimulatingCustom, setIsSimulatingCustom] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [mcpStatus, setMcpStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const [dataSource, setDataSource] = useState<'api' | 'csv' | 'benchmark'>('api');
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);

  const mcpConsoleRef = useRef<HTMLDivElement>(null);

  // Initialize MCP connection on app load
  useEffect(() => {
    async function initMcp() {
      try {
        await mcpClient.initialize();
        await mcpClient.listTools();
        setMcpStatus('connected');
      } catch (err) {
        console.error('Failed to initialize MCP client:', err);
        setMcpStatus('error');
      }
    }
    initMcp();
  }, []);

  /**
   * Run Goal Analytics Pipeline:
   * Uses Phase 4.2 plan_goal server-side tool consolidation for the 3 suggested mixes
   * and any user-configured custom mix.
   */
  const runGoalAnalyticsPipeline = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      // 1. Unified MCP plan_goal tool call
      const planRes = await mcpClient.planGoal({
        start_value: startValue,
        monthly_contribution: monthlyContribution,
        years,
        target_amount: targetAmount,
        confidence: 0.80,
        inflation,
        fee_drag: feeDrag,
        base_currency: currency,
        seed: 42,
        risk_level: riskLevel
      });

      if (planRes?.warnings && planRes.warnings.length > 0) {
        setWarnings(planRes.warnings);
      } else {
        setWarnings([]);
      }

      const mixes = planRes?.mixes || [];
      const processedMixes: MixAnalyticsState[] = mixes.map((pm, idx) => {
        const weightsRecord: Record<AssetClassKey, number> = {
          cash: pm.weights['cash'] ?? 0,
          gov_backed: pm.weights['gov_backed'] ?? 0,
          bonds: pm.weights['bonds'] ?? 0,
          global_equity: pm.weights['global_equity'] ?? 0,
          sg_equity: pm.weights['sg_equity'] ?? 0,
          reits: pm.weights['reits'] ?? 0,
          gold: pm.weights['gold'] ?? 0
        };

        return {
          mixId: `mix_${idx + 1}`,
          mixName: pm.name,
          mixLabel: pm.label,
          description: pm.description,
          rationale: pm.rationale,
          riskRating: pm.risk_rating,
          weights: weightsRecord,
          blendedSeries: {
            monthly_returns: [],
            annualized_return: pm.historical_blended_cagr,
            annualized_volatility: pm.historical_annualized_volatility,
            max_drawdown: pm.drawdown_p95,
            total_months: pm.data_window?.total_months ?? (years * 12),
            start_date: pm.data_window?.start_date,
            end_date: pm.data_window?.end_date,
            aligned_months: pm.data_window?.total_months,
            base_currency: currency,
            components_summary: (Object.keys(weightsRecord) as AssetClassKey[]).map(k => ({
              asset_class: k,
              identifier: k,
              weight: weightsRecord[k],
              cagr: pm.historical_blended_cagr,
              volatility: pm.historical_annualized_volatility,
              currency: currency,
              fx_applied: false
            }))
          },
          simulation: {
            probability_of_success: pm.probability_of_success,
            real_probability_of_success: pm.real_probability_of_success,
            median_final_value: pm.median_final_value,
            real_median_final_value: pm.real_median_final_value,
            p10_final: pm.p10_final,
            p50_final: pm.median_final_value,
            p90_final: pm.p90_final,
            real_p10_final: pm.real_p10_final,
            real_p50_final: pm.real_median_final_value,
            real_p90_final: pm.real_p90_final,
            drawdown_median: pm.drawdown_median,
            drawdown_p95: pm.drawdown_p95,
            worst_case_drawdown: pm.drawdown_p95,
            total_contributed: Math.round(startValue + monthlyContribution * 12 * years),
            target_amount: targetAmount,
            years,
            inflation,
            fee_drag: feeDrag,
            seed: 42,
            trajectories: pm.yearly_trajectory || []
          },
          requiredContribution: {
            required_monthly_contribution: pm.required_monthly_contribution,
            achieved_probability: pm.achieved_probability,
            confidence: 0.80,
            achievable: pm.achievable,
            target_amount: targetAmount,
            years,
            start_value: startValue,
            real_terms: isRealTerms,
            inflation,
            fee_drag: feeDrag,
            expected_terminal_p50: pm.median_final_value
          },
          isLoading: false
        };
      });

      setMixStates(processedMixes);

      // Process Custom Mix via planGoal if any weight > 0
      const customPayload = (Object.keys(customWeights) as AssetClassKey[])
        .filter(k => customWeights[k] > 0)
        .map(key => {
          const cfg = assetConfigs[key] || DEFAULT_ASSET_CONFIGS[key];
          if (cfg.isFixedRate) {
            return {
              asset_class: key,
              fixed_rate: cfg.fixedRate ?? 0.02,
              weight: customWeights[key]
            };
          } else {
            return {
              asset_class: key,
              ticker: cfg.currentProxy,
              weight: customWeights[key]
            };
          }
        });

      if (customPayload.length > 0) {
        const customPlanRes = await mcpClient.planGoal({
          start_value: startValue,
          monthly_contribution: monthlyContribution,
          years,
          target_amount: targetAmount,
          confidence: 0.80,
          inflation,
          fee_drag: feeDrag,
          base_currency: currency,
          seed: 42,
          components: customPayload
        });

        if (customPlanRes?.mixes && customPlanRes.mixes.length > 0) {
          const cpm = customPlanRes.mixes[0];
          setCustomMixState({
            mixId: 'custom',
            mixName: 'Custom Mix Allocation',
            mixLabel: 'Bespoke Blend',
            description: cpm.description,
            rationale: cpm.rationale,
            riskRating: 'Custom',
            weights: { ...customWeights },
            blendedSeries: {
              monthly_returns: [],
              annualized_return: cpm.historical_blended_cagr,
              annualized_volatility: cpm.historical_annualized_volatility,
              max_drawdown: cpm.drawdown_p95,
              total_months: cpm.data_window?.total_months ?? (years * 12),
              start_date: cpm.data_window?.start_date,
              end_date: cpm.data_window?.end_date,
              aligned_months: cpm.data_window?.total_months,
              base_currency: currency,
              components_summary: []
            },
            simulation: {
              probability_of_success: cpm.probability_of_success,
              real_probability_of_success: cpm.real_probability_of_success,
              median_final_value: cpm.median_final_value,
              real_median_final_value: cpm.real_median_final_value,
              p10_final: cpm.p10_final,
              p50_final: cpm.median_final_value,
              p90_final: cpm.p90_final,
              real_p10_final: cpm.real_p10_final,
              real_p50_final: cpm.real_median_final_value,
              real_p90_final: cpm.real_p90_final,
              drawdown_median: cpm.drawdown_median,
              drawdown_p95: cpm.drawdown_p95,
              worst_case_drawdown: cpm.drawdown_p95,
              total_contributed: Math.round(startValue + monthlyContribution * 12 * years),
              target_amount: targetAmount,
              years,
              inflation,
              fee_drag: feeDrag,
              seed: 42,
              trajectories: cpm.yearly_trajectory || []
            },
            requiredContribution: {
              required_monthly_contribution: cpm.required_monthly_contribution,
              achieved_probability: cpm.achieved_probability,
              confidence: 0.80,
              achievable: cpm.achievable,
              target_amount: targetAmount,
              years,
              start_value: startValue,
              real_terms: isRealTerms,
              inflation,
              fee_drag: feeDrag,
              expected_terminal_p50: cpm.median_final_value
            },
            isLoading: false
          });
        }
      }
    } catch (err: any) {
      console.error('Goal analytics pipeline error:', err);
      setErrorMessage(err?.message || 'Goal simulation toolchain encountered an issue.');
    } finally {
      setIsLoading(false);
    }
  }, [
    riskLevel,
    years,
    currency,
    assetConfigs,
    startValue,
    monthlyContribution,
    targetAmount,
    inflation,
    feeDrag,
    isRealTerms,
    customWeights
  ]);

  // Re-run goal pipeline when parameters change
  useEffect(() => {
    if (viewMode === 'goal_allocation') {
      runGoalAnalyticsPipeline();
    }
  }, [
    runGoalAnalyticsPipeline,
    viewMode
  ]);

  // Preserved Single ETF Pipeline
  const runSingleEtfPipeline = useCallback(
    async (priceSeries: PricePoint[], baseTicker: string) => {
      try {
        setIsLoading(true);
        const metricsRes = await mcpClient.computeMetrics(priceSeries);
        setSingleMetrics(metricsRes);

        const effectiveBaseCagr = metricsRes.cagr * (1 + singleCagrAdj);
        const scenariosRes = await mcpClient.projectScenarios(
          singleInitial,
          effectiveBaseCagr,
          singleYears,
          singleMonthly,
          feeDrag
        );
        setSingleScenarios(scenariosRes);

        const mcRes = await mcpClient.monteCarlo(
          priceSeries,
          singleInitial,
          singleYears,
          singleMonthly,
          1000,
          feeDrag
        );
        setSingleMonteCarlo(mcRes);
        setErrorMessage(null);
      } catch (err: any) {
        console.error('Single ETF toolchain error:', err);
        setErrorMessage(err?.message || 'Analytics pipeline encountered an error.');
      } finally {
        setIsLoading(false);
      }
    },
    [singleInitial, singleMonthly, singleCagrAdj, singleYears, feeDrag]
  );

  const fetchSingleTickerData = useCallback(
    async (targetTicker: string, historyYears: number) => {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const result = await mcpClient.getPriceHistory(targetTicker, historyYears);
        if (result && Array.isArray(result.prices) && result.prices.length > 0) {
          setSinglePrices(result.prices);
          setDataSource('api');
          if (result.currency?.toUpperCase() === 'SGD' || targetTicker.toUpperCase().endsWith('.SI')) {
            setCurrency('SGD');
          } else {
            setCurrency('USD');
          }
          await runSingleEtfPipeline(result.prices, targetTicker);
          return;
        }
        throw new Error(`Empty price dataset returned for ${targetTicker}.`);
      } catch (err: any) {
        const errorText = err?.message || String(err);
        console.warn('get_price_history notice:', errorText);

        const benchmark = BENCHMARKS[targetTicker.toUpperCase()];
        if (benchmark) {
          const parsed = parseCSVToPrices(benchmark.csvData);
          const targetMonths = historyYears * 12;
          const sliced = parsed.slice(-targetMonths);
          setSinglePrices(sliced);
          setDataSource('benchmark');
          if (benchmark.currency === 'SGD' || targetTicker.toUpperCase().endsWith('.SI')) {
            setCurrency('SGD');
          } else {
            setCurrency('USD');
          }
          setErrorMessage(
            `Notice: ${errorText}. Using verified total return historical series for ${targetTicker}.`
          );
          await runSingleEtfPipeline(sliced, targetTicker);
        } else {
          setErrorMessage(
            `Unable to retrieve market series for "${targetTicker}": ${errorText}. Please try another ticker or upload a CSV.`
          );
          setIsLoading(false);
        }
      }
    },
    [runSingleEtfPipeline]
  );

  useEffect(() => {
    if (viewMode === 'single_etf') {
      fetchSingleTickerData(singleTicker, singleYears);
    }
  }, [singleTicker, singleYears, viewMode, fetchSingleTickerData]);

  // Handlers for Goal Presets
  const handleSelectPreset = (preset: GoalPreset) => {
    setSelectedPresetId(preset.id);
    setTargetAmount(preset.defaultTarget);
    setYears(preset.defaultYears);
    setStartValue(preset.defaultStart);
    setMonthlyContribution(preset.defaultMonthly);
    setRiskLevel(preset.defaultRisk);
  };

  // Handlers for Custom Weights
  const handleCustomWeightChange = (key: AssetClassKey, newWeight: number) => {
    setCustomWeights(prev => ({
      ...prev,
      [key]: newWeight
    }));
  };

  const handleNormalizeCustomWeights = () => {
    const total = Object.values(customWeights).reduce((a, b) => a + b, 0);
    if (total <= 0) return;
    const normalized: Record<AssetClassKey, number> = {} as any;
    for (const k of Object.keys(customWeights) as AssetClassKey[]) {
      normalized[k] = Math.round((customWeights[k] / total) * 100) / 100;
    }
    setCustomWeights(normalized);
  };

  const handleApplyPresetWeights = (preset: 'balanced' | 'all_weather' | 'growth') => {
    if (preset === 'balanced') {
      setCustomWeights({
        cash: 0.10,
        gov_backed: 0.15,
        bonds: 0.20,
        global_equity: 0.30,
        sg_equity: 0.15,
        reits: 0.05,
        gold: 0.05
      });
    } else if (preset === 'all_weather') {
      setCustomWeights({
        cash: 0.05,
        gov_backed: 0.15,
        bonds: 0.30,
        global_equity: 0.25,
        sg_equity: 0.10,
        reits: 0.05,
        gold: 0.10
      });
    } else {
      // growth
      setCustomWeights({
        cash: 0.05,
        gov_backed: 0.00,
        bonds: 0.10,
        global_equity: 0.55,
        sg_equity: 0.15,
        reits: 0.10,
        gold: 0.05
      });
    }
  };

  const handleApplyMixAsCustom = (weights: Record<AssetClassKey, number>) => {
    setCustomWeights({ ...weights });
    setActiveChartMixId('custom');
  };

  const handleDataLoadedFromCsv = (
    loadedPrices: PricePoint[],
    seriesName: string,
    source: 'csv' | 'benchmark'
  ) => {
    if (viewMode === 'single_etf') {
      setSingleTicker(seriesName);
      setSinglePrices(loadedPrices);
      setDataSource(source);
      setErrorMessage(null);
      runSingleEtfPipeline(loadedPrices, seriesName);
    } else {
      // In goal allocation mode, user can use loaded series for a proxy
      setErrorMessage(`Loaded CSV series for ${seriesName}.`);
    }
  };

  const scrollToMcp = () => {
    mcpConsoleRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const toggleCurrency = () => {
    setCurrency((prev) => (prev === 'SGD' ? 'USD' : 'SGD'));
  };

  // Determine active mix for the chart
  const combinedMixes: MixAnalyticsState[] = [...mixStates];
  if (customMixState) {
    combinedMixes.push(customMixState);
  }
  const activeMixForChart = combinedMixes.find(m => m.mixId === activeChartMixId) || combinedMixes[0] || customMixState;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col antialiased">
      {/* Top Bar Contract Navigation */}
      <Header
        onOpenCsvUpload={() => setIsCsvModalOpen(true)}
        onScrollToMcp={scrollToMcp}
        mcpStatus={mcpStatus}
        currency={currency}
        onToggleCurrency={toggleCurrency}
        viewMode={viewMode}
        onToggleViewMode={setViewMode}
      />

      {/* Main Workspace Canvas */}
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Title Header Banner */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-2 border-b border-slate-200">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 font-display">
              {viewMode === 'goal_allocation'
                ? 'Singapore Goal-Based Asset Allocation Illustrator'
                : 'ETF Horizon Single-Asset Analytics'}
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 mt-1">
              {viewMode === 'goal_allocation'
                ? 'Illustrative forward planning for retail investors in Singapore. Models 7 asset classes with block bootstrap simulations.'
                : 'Deterministic 5-scenario wealth projections and stochastic Monte Carlo paths from historical ETF prices.'}
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs font-mono text-slate-500">
            <span className="flex items-center gap-1.5">
              <Database className="h-3.5 w-3.5 text-blue-600" />
              <span>Data Engine:</span>
              <span className="text-slate-800 font-semibold">
                Yahoo Finance Total Return (Adj Close)
              </span>
            </span>
          </div>
        </div>

        {/* Connectivity / Notice Banner */}
        {errorMessage && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-900">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <span className="font-semibold text-amber-900">Notice: </span>
                {errorMessage}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setIsCsvModalOpen(true)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-medium text-xs transition-colors shadow-xs"
              >
                <UploadCloud className="h-3.5 w-3.5" />
                <span>Upload CSV / Fallback</span>
              </button>
            </div>
          </div>
        )}

        {/* Data Honesty Warnings Banner (Phase 3.1) */}
        {warnings && warnings.length > 0 && (
          <div className="rounded-xl border border-blue-200 bg-blue-50/80 p-3.5 text-xs text-blue-900 space-y-1">
            <div className="flex items-center gap-2 font-semibold">
              <Info className="h-4 w-4 text-blue-600 shrink-0" />
              <span>Data Engine Transparency & Fallback Disclosures:</span>
            </div>
            <ul className="list-disc list-inside space-y-0.5 pl-6 font-mono text-[11px] text-blue-800">
              {warnings.map((w, idx) => (
                <li key={idx}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Fee Drag & Methodology Disclosure (Phase 3.4) */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-slate-100/80 border border-slate-200 rounded-lg text-[11px] text-slate-600 font-mono">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
            <span>Assumptions: 0.20% p.a. fee drag modeled on all returns • Block bootstrap simulation (Mulberry32 seed: 42)</span>
          </div>
          <span className="text-slate-500">Not financial advice. Past performance is no guarantee of future returns.</span>
        </div>

        {/* VIEW MODE 1: GOAL ALLOCATION ILLUSTRATOR */}
        {viewMode === 'goal_allocation' && (
          <div className="space-y-6">
            {/* 1. Goal Formulation & Risk Comfort */}
            <GoalPlanner
              selectedPreset={selectedPresetId}
              onSelectPreset={handleSelectPreset}
              targetAmount={targetAmount}
              onTargetAmountChange={setTargetAmount}
              years={years}
              onYearsChange={setYears}
              startValue={startValue}
              onStartValueChange={setStartValue}
              monthlyContribution={monthlyContribution}
              onMonthlyContributionChange={setMonthlyContribution}
              riskLevel={riskLevel}
              onRiskLevelChange={setRiskLevel}
              inflation={inflation}
              onInflationChange={setInflation}
              isRealTerms={isRealTerms}
              onToggleRealTerms={setIsRealTerms}
              currency={currency}
            />

            {/* 2. Three Suggested Investment Mixes Side-by-Side */}
            <section className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-bold text-slate-900 tracking-tight font-display">
                    Illustrative Investment Mixes
                  </h2>
                  <p className="text-xs text-slate-500">
                    Calculated via MCP <code className="font-mono text-slate-700 bg-slate-100 px-1 py-0.5 rounded">suggest_mixes</code> for Risk Level {riskLevel} over a {years}-year horizon.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={runGoalAnalyticsPipeline}
                    disabled={isLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-xs font-mono text-slate-700 transition-colors shadow-xs"
                  >
                    <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin text-blue-600' : ''}`} />
                    <span>Re-evaluate Mixes</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {mixStates.map((mix) => (
                  <AllocationMixCard
                    key={mix.mixId}
                    mix={mix}
                    isActiveChart={activeChartMixId === mix.mixId}
                    onSelectActiveChart={() => setActiveChartMixId(mix.mixId)}
                    onApplyAsCustom={() => handleApplyMixAsCustom(mix.weights)}
                    targetAmount={targetAmount}
                    currentMonthlyContribution={monthlyContribution}
                    currency={currency}
                    isRealTerms={isRealTerms}
                    years={years}
                  />
                ))}
              </div>
            </section>

            {/* 4. Interactive Trajectory Projection Chart */}
            {activeMixForChart && (
              <GoalTrajectoryChart
                activeMix={activeMixForChart}
                targetAmount={targetAmount}
                currency={currency}
                isRealTerms={isRealTerms}
                years={years}
                availableMixes={combinedMixes}
                onSelectMixId={setActiveChartMixId}
              />
            )}

            {/* 5. Custom Asset Allocation Builder */}
            <CustomAllocationEditor
              weights={customWeights}
              onWeightChange={handleCustomWeightChange}
              onNormalizeWeights={handleNormalizeCustomWeights}
              configs={assetConfigs}
              onApplyPresetWeights={handleApplyPresetWeights}
              isSimulating={isLoading}
              onRunSimulation={runGoalAnalyticsPipeline}
            />

            {/* Custom Mix Card if exists */}
            {customMixState && (
              <div className="pt-2">
                <AllocationMixCard
                  mix={customMixState}
                  isActiveChart={activeChartMixId === 'custom'}
                  onSelectActiveChart={() => setActiveChartMixId('custom')}
                  onApplyAsCustom={() => {}}
                  targetAmount={targetAmount}
                  currentMonthlyContribution={monthlyContribution}
                  currency={currency}
                  isRealTerms={isRealTerms}
                  years={years}
                />
              </div>
            )}
          </div>
        )}

        {/* VIEW MODE 2: PRESERVED SINGLE ETF HORIZON DEEP DIVE */}
        {viewMode === 'single_etf' && (
          <div className="space-y-6">
            {/* Global Controls */}
            <Controls
              ticker={singleTicker}
              onTickerChange={(t) => setSingleTicker(t)}
              years={singleYears}
              onYearsChange={(y) => setSingleYears(y)}
              initialAmount={singleInitial}
              onInitialAmountChange={(a) => setSingleInitial(a)}
              monthlyContribution={singleMonthly}
              onMonthlyContributionChange={(c) => setSingleMonthly(c)}
              cagrAdjustment={singleCagrAdj}
              onCagrAdjustmentChange={(adj) => setSingleCagrAdj(adj)}
              isLoading={isLoading}
              onRunMcpPipeline={() => fetchSingleTickerData(singleTicker, singleYears)}
              currency={currency}
            />

            {/* Key Performance Indicators (KPI Cards) */}
            <KpiCards
              ticker={singleTicker}
              metrics={singleMetrics}
              scenarios={singleScenarios}
              currency={currency}
              years={singleYears}
            />

            {/* Multi-Ticker 10-Year Horizon Comparison Chart */}
            <BenchmarkComparisonChart
              years={singleYears}
              initialAmount={singleInitial}
              monthlyContribution={singleMonthly}
              currency={currency}
              activePrimaryTicker={singleTicker}
              onSelectPrimaryTicker={(t) => setSingleTicker(t)}
            />

            {/* Scenario Breakdown & Monte Carlo Ledger */}
            <SummaryTable
              scenarios={singleScenarios}
              monteCarlo={singleMonteCarlo}
              currency={currency}
              initialAmount={singleInitial}
              monthlyContribution={singleMonthly}
              years={singleYears}
            />
          </div>
        )}

        {/* MCP Activity Panel (Live JSON-RPC Telemetry) */}
        <div ref={mcpConsoleRef} className="pt-4">
          <McpActivityPanel />
        </div>
      </main>

      {/* CSV Fallback Modal */}
      <CsvUploadModal
        isOpen={isCsvModalOpen}
        onClose={() => setIsCsvModalOpen(false)}
        onDataLoaded={handleDataLoadedFromCsv}
      />

      {/* Footer */}
      <Footer />
    </div>
  );
}
