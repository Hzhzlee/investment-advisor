import React, { useState, useEffect, useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { mcpClient } from '../services/mcpClient';
import { BENCHMARKS } from '../data/benchmarks';
import { PricePoint, MetricResults, ScenarioResult } from '../types';
import { Plus, X, Award, ArrowRight, Minimize2, Maximize2, TrendingUp, DollarSign, Check, Sparkles, Trash2, Search } from 'lucide-react';

interface BenchmarkComparisonChartProps {
  years: number;
  initialAmount: number;
  monthlyContribution: number;
  currency: 'SGD' | 'USD';
  activePrimaryTicker: string;
  onSelectPrimaryTicker: (ticker: string) => void;
}

interface TickerAnalytics {
  ticker: string;
  name: string;
  currency: string;
  color: string;
  prices: PricePoint[];
  metrics: MetricResults | null;
  scenarios: ScenarioResult[];
  isLoading: boolean;
  error?: string;
}

const DEFAULT_COMPARISON_TICKERS = ['ES3.SI', 'SPY', 'VT', 'QQQ'];

const POPULAR_TICKER_SUGGESTIONS = [
  { symbol: 'ES3.SI', label: 'ES3.SI (STI SG)', name: 'SPDR Straits Times Index ETF' },
  { symbol: 'SPY', label: 'SPY (S&P 500)', name: 'SPDR S&P 500 ETF Trust' },
  { symbol: 'VT', label: 'VT (Total World)', name: 'Vanguard Total World Stock ETF' },
  { symbol: 'QQQ', label: 'QQQ (Nasdaq 100)', name: 'Invesco QQQ Trust' },
  { symbol: 'VOO', label: 'VOO (Vanguard 500)', name: 'Vanguard S&P 500 ETF' },
  { symbol: 'VTI', label: 'VTI (Total US)', name: 'Vanguard Total Stock Market ETF' },
  { symbol: 'MBH.SI', label: 'MBH.SI (SG Bond)', name: 'Nikko AM SGD Investment Grade Bond ETF' },
  { symbol: 'GLD', label: 'GLD (Gold)', name: 'SPDR Gold Shares' },
  { symbol: 'DIA', label: 'DIA (Dow 30)', name: 'SPDR Dow Jones Industrial Average' },
  { symbol: 'IWM', label: 'IWM (Russell 2000)', name: 'iShares Russell 2000 ETF' },
];

const PRESET_COMPARISONS = [
  { label: 'SG & Global', tickers: ['ES3.SI', 'SPY', 'VT', 'QQQ'] },
  { label: 'US Leaders', tickers: ['SPY', 'QQQ', 'VOO', 'VTI'] },
  { label: 'Singapore Horizons', tickers: ['ES3.SI', 'MBH.SI', 'SPY', 'VT'] },
  { label: 'Growth vs World', tickers: ['QQQ', 'SPY', 'VT', 'IWM'] },
];

const TICKER_COLORS: Record<string, string> = {
  'ES3.SI': '#38bdf8', // Light sky blue
  'SPY': '#3b82f6',    // Blue
  'VT': '#10b981',     // Emerald
  'QQQ': '#a855f7',    // Purple
  'VTI': '#f59e0b',    // Amber
  'VOO': '#06b6d4',    // Cyan
  'MBH.SI': '#ec4899', // Pink
  'GLD': '#eab308',    // Gold
  'DIA': '#6366f1',    // Indigo
  'IWM': '#14b8a6',    // Teal
};

export const BenchmarkComparisonChart: React.FC<BenchmarkComparisonChartProps> = ({
  years,
  initialAmount,
  monthlyContribution,
  currency,
  activePrimaryTicker,
  onSelectPrimaryTicker,
}) => {
  const [selectedTickers, setSelectedTickers] = useState<string[]>(DEFAULT_COMPARISON_TICKERS);
  const [newTickerInput, setNewTickerInput] = useState('');
  const [tickerDataMap, setTickerDataMap] = useState<Record<string, TickerAnalytics>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [useDynamicScale, setUseDynamicScale] = useState(true);
  const [chartViewMode, setChartViewMode] = useState<'forward_projections' | 'historical_indexed'>('forward_projections');

  const sym = currency === 'SGD' ? 'S$' : '$';
  const totalContributed = initialAmount + 10 * 12 * monthlyContribution;

  // Fetch prices, compute metrics, and run scenario projections for each selected ticker
  useEffect(() => {
    let isCancelled = false;

    async function loadAllTickers() {
      setIsLoading(true);
      setNotice(null);
      const newMap: Record<string, TickerAnalytics> = { ...tickerDataMap };

      for (const t of selectedTickers) {
        if (newMap[t] && newMap[t].prices.length > 0 && !newMap[t].isLoading) {
          // Re-compute scenarios if capital/contribution changed
          try {
            if (newMap[t].metrics) {
              const scenRes = await mcpClient.projectScenarios(
                initialAmount,
                newMap[t].metrics!.cagr,
                10,
                monthlyContribution
              );
              newMap[t] = { ...newMap[t], scenarios: scenRes };
            }
          } catch {
            // keep existing
          }
          continue;
        }

        newMap[t] = {
          ticker: t,
          name: BENCHMARKS[t]?.name || t,
          currency: t.endsWith('.SI') ? 'SGD' : 'USD',
          color: TICKER_COLORS[t] || '#60a5fa',
          prices: [],
          metrics: null,
          scenarios: [],
          isLoading: true,
        };

        try {
          // 1. Fetch price history via MCP
          const historyRes = await mcpClient.getPriceHistory(t, years);
          const prices = historyRes?.prices || [];
          const tickerCurrency = historyRes?.currency || (t.endsWith('.SI') ? 'SGD' : 'USD');

          // 2. Compute metrics via MCP
          const metricsRes = await mcpClient.computeMetrics(prices);

          // 3. Project 10-year scenarios via MCP
          const scenariosRes = await mcpClient.projectScenarios(
            initialAmount,
            metricsRes.cagr,
            10,
            monthlyContribution
          );

          if (!isCancelled) {
            newMap[t] = {
              ticker: t,
              name: BENCHMARKS[t]?.name || t,
              currency: tickerCurrency,
              color: TICKER_COLORS[t] || '#60a5fa',
              prices,
              metrics: metricsRes,
              scenarios: scenariosRes,
              isLoading: false,
            };
          }
        } catch (err: any) {
          // Fallback to verified exchange benchmark if available
          if (BENCHMARKS[t]) {
            const { parseCSVToPrices } = await import('../data/benchmarks');
            const benchmarkPrices = parseCSVToPrices(BENCHMARKS[t].csvData);
            const targetMonths = years * 12;
            const sliced = benchmarkPrices.slice(-targetMonths);

            try {
              const metricsRes = await mcpClient.computeMetrics(sliced);
              const scenariosRes = await mcpClient.projectScenarios(
                initialAmount,
                metricsRes.cagr,
                10,
                monthlyContribution
              );

              if (!isCancelled) {
                newMap[t] = {
                  ticker: t,
                  name: BENCHMARKS[t].name,
                  currency: BENCHMARKS[t].currency,
                  color: TICKER_COLORS[t] || '#60a5fa',
                  prices: sliced,
                  metrics: metricsRes,
                  scenarios: scenariosRes,
                  isLoading: false,
                };
              }
              continue;
            } catch {
              // ignore
            }
          }

          if (!isCancelled) {
            newMap[t] = {
              ...newMap[t],
              isLoading: false,
              error: err?.message || 'Failed to load data',
            };
          }
        }
      }

      if (!isCancelled) {
        setTickerDataMap({ ...newMap });
        setIsLoading(false);
      }
    }

    loadAllTickers();

    return () => {
      isCancelled = true;
    };
  }, [selectedTickers, years, initialAmount, monthlyContribution]);

  // Add or swap a ticker
  const handleAddOrSwapTicker = (tickerToAdd: string) => {
    const clean = tickerToAdd.trim().toUpperCase();
    if (!clean) return;

    if (selectedTickers.includes(clean)) {
      onSelectPrimaryTicker(clean);
      setNotice(`${clean} is already in the comparison set. Set as active focus.`);
      setTimeout(() => setNotice(null), 3000);
      return;
    }

    if (selectedTickers.length >= 4) {
      // Replace the last non-primary ticker
      let replacedIndex = 3;
      for (let i = selectedTickers.length - 1; i >= 0; i--) {
        if (selectedTickers[i].toUpperCase() !== activePrimaryTicker.toUpperCase()) {
          replacedIndex = i;
          break;
        }
      }
      const replacedTicker = selectedTickers[replacedIndex];
      const updated = [...selectedTickers];
      updated[replacedIndex] = clean;
      setSelectedTickers(updated);
      setNotice(`Replaced ${replacedTicker} with ${clean} in 4-ticker comparison set.`);
      setTimeout(() => setNotice(null), 3500);
    } else {
      setSelectedTickers([...selectedTickers, clean]);
      setNotice(`Added ${clean} to comparison set.`);
      setTimeout(() => setNotice(null), 3000);
    }
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newTickerInput.trim()) {
      handleAddOrSwapTicker(newTickerInput);
      setNewTickerInput('');
    }
  };

  const handleRemoveTicker = (tickerToRemove: string) => {
    if (selectedTickers.length <= 1) {
      setNotice('At least one ticker must remain active in the comparison.');
      setTimeout(() => setNotice(null), 3000);
      return;
    }
    const updated = selectedTickers.filter((t) => t !== tickerToRemove);
    setSelectedTickers(updated);
    if (tickerToRemove.toUpperCase() === activePrimaryTicker.toUpperCase() && updated.length > 0) {
      onSelectPrimaryTicker(updated[0]);
    }
    setNotice(null);
  };

  const handleApplyPreset = (presetTickers: string[]) => {
    setSelectedTickers(presetTickers);
    if (!presetTickers.includes(activePrimaryTicker)) {
      onSelectPrimaryTicker(presetTickers[0]);
    }
    setNotice(`Applied preset: ${presetTickers.join(', ')}`);
    setTimeout(() => setNotice(null), 3000);
  };

  // 1. Dataset for 10-Year Forward Wealth Projections across all selected tickers
  const forwardProjectionsData = useMemo(() => {
    const activeSeries = selectedTickers
      .map((t) => tickerDataMap[t])
      .filter((item): item is TickerAnalytics => Boolean(item && item.scenarios && item.scenarios.length > 0));

    if (activeSeries.length === 0) return [];

    const currentYear = new Date().getFullYear();
    const rows: any[] = [];

    for (let yr = 0; yr <= 10; yr++) {
      const row: any = {
        year: yr,
        label: yr === 0 ? `${currentYear} (Now)` : `Year ${yr} (${currentYear + yr})`,
        displayLabel: yr === 0 ? 'Now' : `Yr ${yr}`,
      };

      activeSeries.forEach((s) => {
        const baseScen = s.scenarios.find((sc) => sc.adjustment === 0) || s.scenarios[2];
        if (baseScen) {
          const pt = baseScen.trajectory.find((t) => t.year === yr);
          if (pt) {
            row[s.ticker] = pt.value;
            row[`${s.ticker}_contributed`] = pt.totalContributed;
          }
        }
      });

      rows.push(row);
    }

    return rows;
  }, [selectedTickers, tickerDataMap]);

  // 2. Dataset for Historical Normalized Performance (Base 100)
  const historicalIndexedData = useMemo(() => {
    const activeSeries = selectedTickers
      .map((t) => tickerDataMap[t])
      .filter((item): item is TickerAnalytics => Boolean(item && item.prices && item.prices.length > 0));

    if (activeSeries.length === 0) return [];

    const dateSet = new Set<string>();
    activeSeries.forEach((s) => s.prices.forEach((p) => dateSet.add(p.date)));
    const sortedDates = Array.from(dateSet).sort();

    const seriesMaps = activeSeries.map((s) => ({
      ticker: s.ticker,
      name: s.name,
      map: new Map(s.prices.map((p) => [p.date, p.close])),
      firstPrice: s.prices[0]?.close || 1,
      lastPrice: s.prices[s.prices.length - 1]?.close || 1,
    }));

    return sortedDates.map((d) => {
      const row: any = {
        date: d,
        formattedDate: d.slice(0, 7),
        displayLabel: d.slice(0, 7),
      };

      seriesMaps.forEach((s) => {
        const p = s.map.get(d);
        if (p !== undefined) {
          row[s.ticker] = Math.round((p / s.firstPrice) * 10000) / 100;
        }
      });

      return row;
    });
  }, [selectedTickers, tickerDataMap]);

  // Active chart rows based on selected view mode
  const activeChartData = chartViewMode === 'forward_projections' ? forwardProjectionsData : historicalIndexedData;

  // Dynamically compute tight Y-axis domain based on actual min/max price or wealth values
  const dynamicYDomain = useMemo(() => {
    if (!activeChartData || activeChartData.length === 0) {
      return chartViewMode === 'forward_projections' ? [initialAmount, initialAmount * 2] : [80, 250];
    }

    let minVal = Infinity;
    let maxVal = -Infinity;

    activeChartData.forEach((row) => {
      selectedTickers.forEach((t) => {
        const val = row[t];
        if (typeof val === 'number') {
          minVal = Math.min(minVal, val);
          maxVal = Math.max(maxVal, val);
        }
      });
    });

    if (!isFinite(minVal) || !isFinite(maxVal)) {
      return chartViewMode === 'forward_projections' ? [initialAmount, initialAmount * 2] : [80, 250];
    }

    if (!useDynamicScale) {
      return [0, Math.ceil(maxVal * 1.12)];
    }

    // Dynamic scale with tight padding
    const span = maxVal - minVal;
    if (chartViewMode === 'forward_projections') {
      const padding = Math.max(span * 0.08, 1000);
      const paddedMin = Math.max(0, Math.floor((minVal - padding) / 1000) * 1000);
      const paddedMax = Math.ceil((maxVal + padding) / 1000) * 1000;
      return [paddedMin, Math.max(paddedMax, paddedMin + 1000)];
    } else {
      const padding = Math.max(span * 0.08, 5);
      const paddedMin = Math.max(0, Math.floor(minVal - padding));
      const paddedMax = Math.ceil(maxVal + padding);
      return [paddedMin, paddedMax];
    }
  }, [activeChartData, selectedTickers, useDynamicScale, chartViewMode, initialAmount]);

  // Find standout leaders among compared tickers
  const topCagrTicker = useMemo(() => {
    let bestTicker = '';
    let maxCagr = -Infinity;
    selectedTickers.forEach((t) => {
      const m = tickerDataMap[t]?.metrics;
      if (m && m.cagr > maxCagr) {
        maxCagr = m.cagr;
        bestTicker = t;
      }
    });
    return bestTicker;
  }, [selectedTickers, tickerDataMap]);

  const lowestVolTicker = useMemo(() => {
    let bestTicker = '';
    let minVol = Infinity;
    selectedTickers.forEach((t) => {
      const m = tickerDataMap[t]?.metrics;
      if (m && m.annualized_volatility < minVol) {
        minVol = m.annualized_volatility;
        bestTicker = t;
      }
    });
    return bestTicker;
  }, [selectedTickers, tickerDataMap]);

  const formatCurrency = (val: number) => `${sym}${Math.round(val).toLocaleString()}`;
  const formatPct = (val: number) => `${(val * 100).toFixed(2)}%`;

  return (
    <section id="comparative" className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 shadow-xl backdrop-blur-sm space-y-6">
      {/* Chart Header & Controls */}
      <div>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                Multi-Ticker 10-Year Horizon & Performance Comparison
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Side-by-side performance trajectories and wealth projections across 3 to 4 selected ETF benchmarks.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* View Mode Toggle */}
            <div className="flex items-center p-1 bg-slate-950 rounded-lg border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setChartViewMode('forward_projections')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded font-medium transition-all ${
                  chartViewMode === 'forward_projections'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <DollarSign className="h-3.5 w-3.5" />
                <span>10Y Forward Wealth ($)</span>
              </button>
              <button
                type="button"
                onClick={() => setChartViewMode('historical_indexed')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded font-medium transition-all ${
                  chartViewMode === 'historical_indexed'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <TrendingUp className="h-3.5 w-3.5" />
                <span>Historical Index (Base 100)</span>
              </button>
            </div>

            {/* Dynamic Scale Toggle */}
            <button
              type="button"
              onClick={() => setUseDynamicScale(!useDynamicScale)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-mono rounded-md border transition-colors ${
                useDynamicScale
                  ? 'bg-blue-950/80 border-blue-700 text-blue-300'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
              title="Toggle dynamic vertical scaling based on actual price values"
            >
              {useDynamicScale ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
              <span>{useDynamicScale ? 'Dynamic Scale (Active)' : 'Fit from 0'}</span>
            </button>
          </div>
        </div>

        {/* Ticker Management Deck */}
        <div className="space-y-3 pb-4 border-b border-slate-800/80">
          {/* Active Comparison Chips & Direct Ticker Search */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mr-1">
              Active Tickers ({selectedTickers.length}/4):
            </span>

            {selectedTickers.map((t) => {
              const color = TICKER_COLORS[t] || '#60a5fa';
              const isPrimary = t.toUpperCase() === activePrimaryTicker.toUpperCase();
              return (
                <span
                  key={t}
                  className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono font-medium rounded-md border transition-all ${
                    isPrimary
                      ? 'bg-blue-950 border-blue-600 text-white shadow-sm shadow-blue-500/30 ring-1 ring-blue-500/50'
                      : 'bg-slate-950 border-slate-800 text-slate-200 hover:border-slate-700'
                  }`}
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                  <button
                    type="button"
                    onClick={() => onSelectPrimaryTicker(t)}
                    title={`Click to set ${t} as primary focus`}
                    className="hover:underline font-bold"
                  >
                    {t}
                  </button>
                  {isPrimary && (
                    <span className="text-[10px] text-blue-400 font-sans">Focus</span>
                  )}
                  <button
                    type="button"
                    onClick={() => handleRemoveTicker(t)}
                    className="text-slate-500 hover:text-rose-400 ml-0.5 transition-colors"
                    title={`Remove ${t} from comparison`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              );
            })}

            {/* Always-accessible custom search input */}
            <form onSubmit={handleCustomSubmit} className="flex items-center ml-auto">
              <div className="relative flex items-center">
                <input
                  type="text"
                  placeholder="Add or swap ticker..."
                  value={newTickerInput}
                  onChange={(e) => setNewTickerInput(e.target.value.toUpperCase())}
                  className="w-36 sm:w-44 h-7 pl-6 pr-2 text-xs font-mono text-slate-200 bg-slate-950 border border-slate-800 rounded-md focus:outline-none focus:border-blue-500"
                />
                <Search className="absolute left-1.5 h-3.5 w-3.5 text-slate-500 pointer-events-none" />
              </div>
              <button
                type="submit"
                className="ml-1 h-7 px-2.5 text-xs font-medium text-blue-400 bg-slate-950 border border-slate-800 rounded-md hover:bg-blue-900/40 hover:text-white transition-colors"
              >
                <Plus className="h-3 w-3" />
              </button>
            </form>
          </div>

          {/* Quick Preset Portfolios & Popular Ticker Pills */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 text-xs">
            {/* Quick-add popular pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-slate-400 font-medium">Quick Pick:</span>
              {POPULAR_TICKER_SUGGESTIONS.slice(0, 7).map((item) => {
                const isSelected = selectedTickers.includes(item.symbol);
                return (
                  <button
                    key={item.symbol}
                    type="button"
                    onClick={() => handleAddOrSwapTicker(item.symbol)}
                    className={`px-2 py-0.5 text-[11px] font-mono rounded border transition-all ${
                      isSelected
                        ? 'bg-blue-950/70 border-blue-800 text-blue-300 font-semibold'
                        : 'bg-slate-950/60 border-slate-800/80 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                    }`}
                    title={item.name}
                  >
                    {item.symbol}
                  </button>
                );
              })}
            </div>

            {/* Presets */}
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[11px] text-slate-400 font-medium">Presets:</span>
              {PRESET_COMPARISONS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => handleApplyPreset(p.tickers)}
                  className="px-2 py-0.5 text-[10px] font-medium rounded bg-slate-900 border border-slate-800 text-slate-400 hover:text-blue-400 hover:border-slate-700 transition-colors"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {notice && (
          <div className="mt-2 text-xs text-blue-300 bg-blue-950/40 border border-blue-800/50 rounded px-3 py-1.5 flex items-center justify-between">
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice(null)} className="text-blue-400 hover:text-blue-200">
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* Chart Canvas with Dynamic Range */}
        <div className="h-[380px] sm:h-[420px] w-full pt-4">
          {isLoading && activeChartData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-slate-500 text-sm font-mono">
              Loading price series and computing forward projections...
            </div>
          ) : activeChartData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-slate-500 text-sm font-mono">
              No comparison records available.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={activeChartData} margin={{ top: 15, right: 25, left: 15, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />

                <XAxis
                  dataKey={chartViewMode === 'forward_projections' ? 'displayLabel' : 'formattedDate'}
                  stroke="#64748b"
                  tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'var(--font-mono)' }}
                  tickMargin={8}
                  minTickGap={chartViewMode === 'forward_projections' ? 10 : 40}
                />

                <YAxis
                  stroke="#64748b"
                  tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'var(--font-mono)' }}
                  domain={dynamicYDomain}
                  tickMargin={10}
                  tickFormatter={(val) => {
                    if (chartViewMode === 'forward_projections') {
                      if (val >= 1000000) return `${sym}${(val / 1000000).toFixed(1)}M`;
                      if (val >= 1000) return `${sym}${(val / 1000).toFixed(0)}k`;
                      return `${sym}${val}`;
                    }
                    return `${val}`;
                  }}
                />

                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload || !payload.length) return null;
                    return (
                      <div className="rounded-lg border border-slate-700 bg-slate-900/95 p-3 text-xs shadow-2xl backdrop-blur-md min-w-[220px]">
                        <div className="font-mono text-slate-400 pb-1.5 mb-1.5 border-b border-slate-800 flex justify-between">
                          <span>{chartViewMode === 'forward_projections' ? 'Projection:' : 'Observation:'}</span>
                          <span className="text-white font-semibold">{label}</span>
                        </div>
                        <div className="space-y-1.5 font-mono">
                          {payload.map((item: any) => {
                            const val = item.value;
                            return (
                              <div key={item.dataKey} className="flex items-center justify-between">
                                <span className="flex items-center gap-1.5" style={{ color: item.color }}>
                                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                                  {item.name}:
                                </span>
                                <span className="font-semibold tabular-nums text-white">
                                  {chartViewMode === 'forward_projections' ? formatCurrency(val) : `${val}`}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  }}
                />

                {selectedTickers.map((t) => (
                  <Line
                    key={t}
                    type="monotone"
                    dataKey={t}
                    name={t}
                    stroke={TICKER_COLORS[t] || '#60a5fa'}
                    strokeWidth={t.toUpperCase() === activePrimaryTicker.toUpperCase() ? 3 : 2}
                    dot={chartViewMode === 'forward_projections' ? { r: 3 } : false}
                    activeDot={{ r: 5 }}
                    isAnimationActive={false}
                    connectNulls={true}
                  />
                ))}

                <Legend
                  verticalAlign="bottom"
                  height={32}
                  wrapperStyle={{ paddingTop: 14, fontSize: 12 }}
                  formatter={(val) => <span className="text-slate-300 font-medium mr-4">{val}</span>}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Multi-Ticker Forward Projections Comparison Table */}
      <div className="border-t border-slate-800/90 pt-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                <span>Multi-Ticker 10-Year Forward Projections Comparison</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-950 border border-blue-800 text-blue-300">
                  {selectedTickers.length} Selected
                </span>
              </h3>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Side-by-side terminal wealth projections modeled on initial capital of{' '}
              <strong className="text-slate-200">{sym}{initialAmount.toLocaleString()}</strong> plus{' '}
              <strong className="text-slate-200">{sym}{monthlyContribution.toLocaleString()}/mo</strong> over 10 years (Total Invested: {sym}{totalContributed.toLocaleString()}).
            </p>
          </div>
        </div>

        {/* Comparison Table */}
        <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/80 shadow-lg">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/90 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-4">ETF / Benchmark</th>
                <th className="py-3 px-3 text-right">Hist. CAGR</th>
                <th className="py-3 px-3 text-right">Volatility</th>
                <th className="py-3 px-3 text-right">Max Drawdown</th>
                <th className="py-3 px-3 text-right text-rose-400">10Y Bear (-20%)</th>
                <th className="py-3 px-3 text-right text-amber-400">10Y Cons (-10%)</th>
                <th className="py-3 px-4 text-right text-blue-300 bg-blue-950/30">10Y Base Horizon</th>
                <th className="py-3 px-3 text-right text-sky-400">10Y Opt (+10%)</th>
                <th className="py-3 px-3 text-right text-emerald-400">10Y Bull (+20%)</th>
                <th className="py-3 px-4 text-right">Projected Net Gain</th>
                <th className="py-3 px-3 text-right">MoIC</th>
                <th className="py-3 px-3 text-center">Manage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 text-xs font-mono tabular-nums">
              {selectedTickers.map((t) => {
                const item = tickerDataMap[t];
                const color = TICKER_COLORS[t] || '#60a5fa';
                const isPrimary = t.toUpperCase() === activePrimaryTicker.toUpperCase();
                const metrics = item?.metrics;
                const scenarios = item?.scenarios || [];

                const baseScen = scenarios.find((s) => s.adjustment === 0);
                const bearScen = scenarios.find((s) => s.adjustment === -0.2);
                const consScen = scenarios.find((s) => s.adjustment === -0.1);
                const optScen = scenarios.find((s) => s.adjustment === 0.1);
                const bullScen = scenarios.find((s) => s.adjustment === 0.2);

                const isTopCagr = t === topCagrTicker;
                const isLowestVol = t === lowestVolTicker;

                return (
                  <tr
                    key={t}
                    className={`hover:bg-slate-850/50 transition-colors ${
                      isPrimary ? 'bg-blue-950/25 font-medium' : ''
                    }`}
                  >
                    {/* Ticker & Fund Name */}
                    <td className="py-3.5 px-4 font-sans">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                        <div>
                          <div className="flex items-center gap-1.5 font-bold font-mono text-white text-sm">
                            <span>{t}</span>
                            {isPrimary && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-600 text-white font-sans font-normal">
                                Active Focus
                              </span>
                            )}
                            {isTopCagr && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-950 border border-emerald-800 text-emerald-300 font-sans font-normal flex items-center gap-0.5">
                                <Award className="h-3 w-3" />
                                Top CAGR
                              </span>
                            )}
                            {isLowestVol && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-sky-950 border border-sky-800 text-sky-300 font-sans font-normal">
                                Lowest Risk
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 truncate max-w-[170px]">
                            {item?.name || t}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Historical CAGR */}
                    <td className="py-3.5 px-3 text-right font-bold text-slate-100">
                      {metrics ? (
                        <span className={metrics.cagr > 0 ? 'text-emerald-400' : 'text-rose-400'}>
                          {metrics.cagr > 0 ? `+${formatPct(metrics.cagr)}` : formatPct(metrics.cagr)}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>

                    {/* Volatility */}
                    <td className="py-3.5 px-3 text-right text-slate-300">
                      {metrics ? formatPct(metrics.annualized_volatility) : '—'}
                    </td>

                    {/* Max Drawdown */}
                    <td className="py-3.5 px-3 text-right text-rose-400 font-medium">
                      {metrics ? formatPct(metrics.max_drawdown) : '—'}
                    </td>

                    {/* Severe Bear (-20%) */}
                    <td className="py-3.5 px-3 text-right text-rose-300">
                      {bearScen ? formatCurrency(bearScen.final_value) : '—'}
                    </td>

                    {/* Conservative (-10%) */}
                    <td className="py-3.5 px-3 text-right text-amber-300">
                      {consScen ? formatCurrency(consScen.final_value) : '—'}
                    </td>

                    {/* 10Y Base Horizon (Highlighted) */}
                    <td className="py-3.5 px-4 text-right font-extrabold text-blue-200 bg-blue-950/30 text-sm">
                      {baseScen ? formatCurrency(baseScen.final_value) : '—'}
                    </td>

                    {/* Optimistic (+10%) */}
                    <td className="py-3.5 px-3 text-right text-sky-300">
                      {optScen ? formatCurrency(optScen.final_value) : '—'}
                    </td>

                    {/* Strong Bull (+20%) */}
                    <td className="py-3.5 px-3 text-right text-emerald-400 font-bold">
                      {bullScen ? formatCurrency(bullScen.final_value) : '—'}
                    </td>

                    {/* Projected Net Gain */}
                    <td className="py-3.5 px-4 text-right font-semibold">
                      {baseScen ? (
                        <span className={baseScen.total_gain >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                          {baseScen.total_gain >= 0 ? `+${formatCurrency(baseScen.total_gain)}` : formatCurrency(baseScen.total_gain)}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>

                    {/* MoIC */}
                    <td className="py-3.5 px-3 text-right font-bold text-slate-200">
                      {baseScen ? `${baseScen.multiple.toFixed(2)}x` : '—'}
                    </td>

                    {/* Actions: Focus & Remove */}
                    <td className="py-3.5 px-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {!isPrimary ? (
                          <button
                            type="button"
                            onClick={() => onSelectPrimaryTicker(t)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-sans font-medium text-blue-400 hover:text-white bg-blue-950/60 hover:bg-blue-600 border border-blue-800/60 rounded transition-all whitespace-nowrap"
                            title={`Set ${t} as the primary dashboard focus`}
                          >
                            <span>Focus</span>
                            <ArrowRight className="h-3 w-3" />
                          </button>
                        ) : (
                          <span className="text-[11px] text-blue-400 font-semibold px-2 py-1 bg-blue-950/60 rounded border border-blue-800/40">
                            Active
                          </span>
                        )}

                        {selectedTickers.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveTicker(t)}
                            className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                            title={`Remove ${t}`}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
};
