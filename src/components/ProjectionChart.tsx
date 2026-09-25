import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { MetricResults, ScenarioResult, MonteCarloResult, PricePoint } from '../types';
import { Layers, Info, Maximize2, Minimize2 } from 'lucide-react';

interface ProjectionChartProps {
  ticker: string;
  prices: PricePoint[];
  metrics: MetricResults | null;
  scenarios: ScenarioResult[];
  monteCarlo: MonteCarloResult | null;
  initialAmount: number;
  monthlyContribution: number;
  currency: 'SGD' | 'USD';
  years: number;
}

export const ProjectionChart: React.FC<ProjectionChartProps> = ({
  ticker,
  prices,
  metrics,
  scenarios,
  monteCarlo,
  initialAmount,
  currency,
  years,
}) => {
  const [showMonteCarloBand, setShowMonteCarloBand] = useState(true);
  const [useDynamicScale, setUseDynamicScale] = useState(true);
  const sym = currency === 'SGD' ? 'S$' : '$';

  // Build combined 1-point-per-year dataset
  const chartData = useMemo(() => {
    if (!prices || prices.length < 2 || !metrics) return [];

    const sortedPrices = [...prices].sort((a, b) => a.date.localeCompare(b.date));
    const lastPricePoint = sortedPrices[sortedPrices.length - 1];
    const lastPrice = lastPricePoint.close;
    const currentYear = new Date(lastPricePoint.date).getFullYear() || 2025;

    // 1. Sample historical prices: 1 point per year
    const yearlyHistoricalMap = new Map<number, { close: number; date: string }>();
    for (const p of sortedPrices) {
      const yr = new Date(p.date).getFullYear();
      yearlyHistoricalMap.set(yr, { close: p.close, date: p.date });
    }

    const histYears = Array.from(yearlyHistoricalMap.keys()).sort((a, b) => a - b);
    const sampledHistYears = histYears.slice(-years);

    const rows: any[] = [];

    // Historical Points (solid line, indexed to initial capital at Year 0)
    for (const y of sampledHistYears) {
      const item = yearlyHistoricalMap.get(y)!;
      const priceAtY = item.close;
      const scaledVal = Math.round((priceAtY / lastPrice) * initialAmount);
      const isCurrent = y === currentYear;

      const row: any = {
        label: `${y}`,
        yearNumber: y,
        isFuture: false,
        historical: scaledVal,
        rawClosePrice: priceAtY,
      };

      // Connect seamless anchor point at Current Year
      if (isCurrent) {
        row.label = `${y} (Now)`;
        row.historical = initialAmount;
        scenarios.forEach((scen) => {
          row[scen.id] = initialAmount;
        });
        if (monteCarlo) {
          row.mcRange = [initialAmount, initialAmount];
          row.mcMedian = initialAmount;
        }
      }

      rows.push(row);
    }

    // Forward Projections (10 Years forward, 1 point per year)
    for (let fYear = 1; fYear <= 10; fYear++) {
      const futureCalendarYear = currentYear + fYear;
      const row: any = {
        label: `${futureCalendarYear}`,
        yearNumber: futureCalendarYear,
        isFuture: true,
        historical: null,
      };

      scenarios.forEach((scen) => {
        const point = scen.trajectory.find((t) => t.year === fYear);
        if (point) {
          row[scen.id] = point.value;
          row.totalContributed = point.totalContributed;
        }
      });

      if (monteCarlo) {
        const mcPoint = monteCarlo.trajectories.find((t) => t.year === fYear);
        if (mcPoint) {
          row.mcRange = [mcPoint.p10, mcPoint.p90];
          row.mcP10 = mcPoint.p10;
          row.mcP50 = mcPoint.p50;
          row.mcP90 = mcPoint.p90;
        }
      }

      rows.push(row);
    }

    return rows;
  }, [prices, metrics, scenarios, monteCarlo, initialAmount, years]);

  // Dynamically calculate tight Y-axis domain based on actual price & projection range
  const dynamicYDomain = useMemo(() => {
    if (!chartData || chartData.length === 0) return [0, 10000];
    let minVal = Infinity;
    let maxVal = -Infinity;

    chartData.forEach((row) => {
      if (typeof row.historical === 'number') {
        minVal = Math.min(minVal, row.historical);
        maxVal = Math.max(maxVal, row.historical);
      }
      ['scen_m20', 'scen_m10', 'scen_0', 'scen_p10', 'scen_p20'].forEach((key) => {
        if (typeof row[key] === 'number') {
          minVal = Math.min(minVal, row[key]);
          maxVal = Math.max(maxVal, row[key]);
        }
      });
      if (showMonteCarloBand && Array.isArray(row.mcRange)) {
        minVal = Math.min(minVal, row.mcRange[0]);
        maxVal = Math.max(maxVal, row.mcRange[1]);
      }
    });

    if (!isFinite(minVal) || !isFinite(maxVal)) return [0, 10000];

    if (!useDynamicScale) {
      // Baseline 0 mode
      const paddedMax = Math.ceil((maxVal * 1.1) / 5000) * 5000;
      return [0, paddedMax];
    }

    // Dynamic zoom based on data range
    const span = maxVal - minVal;
    const padding = Math.max(span * 0.08, 1000);
    const paddedMin = Math.max(0, Math.floor((minVal - padding) / 1000) * 1000);
    const paddedMax = Math.ceil((maxVal + padding) / 1000) * 1000;

    return [paddedMin, Math.max(paddedMax, paddedMin + 1000)];
  }, [chartData, showMonteCarloBand, useDynamicScale]);

  const scenarioConfig = [
    { id: 'scen_m20', label: 'Severe Bear (-20% rel)', color: '#f43f5e' },
    { id: 'scen_m10', label: 'Conservative (-10% rel)', color: '#fb923c' },
    { id: 'scen_0', label: 'Base Horizon (0% rel)', color: '#3b82f6' },
    { id: 'scen_p10', label: 'Optimistic (+10% rel)', color: '#38bdf8' },
    { id: 'scen_p20', label: 'Strong Bull (+20% rel)', color: '#10b981' },
  ];

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;

    const dataItem = payload[0]?.payload;
    if (!dataItem) return null;

    return (
      <div className="rounded-lg border border-slate-700 bg-slate-900/95 p-3 text-xs shadow-2xl backdrop-blur-md min-w-[240px]">
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
          <span className="font-semibold text-slate-200">
            Year: <span className="font-mono text-blue-400">{label}</span>
          </span>
          <span className="text-[10px] font-mono text-slate-400">
            {dataItem.isFuture ? '10Y Forward' : 'Historical Trajectory'}
          </span>
        </div>

        <div className="space-y-1.5 font-mono">
          {dataItem.historical !== null && dataItem.historical !== undefined && (
            <div className="flex flex-col gap-0.5 pb-1 border-b border-slate-800/80">
              <div className="flex items-center justify-between text-slate-200">
                <span className="flex items-center gap-1.5 text-blue-400">
                  <span className="h-2 w-2 rounded-full bg-blue-500" />
                  Portfolio Value:
                </span>
                <span className="font-bold tabular-nums">
                  {sym}{dataItem.historical.toLocaleString()}
                </span>
              </div>
              {dataItem.rawClosePrice && (
                <div className="flex items-center justify-between text-[10px] text-slate-400">
                  <span>ETF Share Price:</span>
                  <span className="tabular-nums font-semibold text-slate-300">
                    {sym}{dataItem.rawClosePrice.toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          )}

          {dataItem.isFuture && (
            <>
              {scenarioConfig.map((sc) => {
                const val = dataItem[sc.id];
                if (val === undefined) return null;
                return (
                  <div key={sc.id} className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5" style={{ color: sc.color }}>
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: sc.color }} />
                      {sc.label}:
                    </span>
                    <span className="font-semibold tabular-nums text-slate-200">
                      {sym}{val.toLocaleString()}
                    </span>
                  </div>
                );
              })}

              {dataItem.mcP10 !== undefined && (
                <div className="mt-2 pt-2 border-t border-slate-800/80 text-[11px] text-slate-400 space-y-0.5">
                  <div className="flex justify-between">
                    <span>Monte Carlo P90:</span>
                    <span className="text-emerald-400 font-semibold">{sym}{dataItem.mcP90.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Monte Carlo P50 (Median):</span>
                    <span className="text-sky-300 font-semibold">{sym}{dataItem.mcP50.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Monte Carlo P10:</span>
                    <span className="text-rose-400 font-semibold">{sym}{dataItem.mcP10.toLocaleString()}</span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <section id="projections" className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 shadow-xl backdrop-blur-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
              Chart 1: Historical Performance & 10-Year Forward Projections
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Solid historical line flowing into five scenario projections (dashed) with Monte Carlo 10th-90th percentile band.
          </p>
        </div>

        {/* Dynamic Scale & MC Band Controls */}
        <div className="flex items-center gap-2">
          {/* Dynamic Range Button */}
          <button
            type="button"
            onClick={() => setUseDynamicScale(!useDynamicScale)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
              useDynamicScale
                ? 'bg-blue-950/80 border-blue-700 text-blue-300'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
            title="Toggle dynamic scale range based on actual prices vs fixed 0-baseline"
          >
            {useDynamicScale ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            <span>{useDynamicScale ? 'Dynamic Price Range (Active)' : 'Fit from S$0'}</span>
          </button>

          {/* MC Band Toggle */}
          <button
            type="button"
            onClick={() => setShowMonteCarloBand(!showMonteCarloBand)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
              showMonteCarloBand
                ? 'bg-blue-950/80 border-blue-800 text-blue-300'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>{showMonteCarloBand ? 'Hide MC Band' : 'Show MC Band'}</span>
          </button>
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="h-[400px] sm:h-[460px] w-full">
        {chartData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-slate-500 text-sm font-mono">
            Awaiting price series data...
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 20, right: 25, left: 15, bottom: 25 }}>
              <defs>
                <linearGradient id="mcBandGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#1e3a8a" stopOpacity={0.08} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />

              <XAxis
                dataKey="label"
                stroke="#64748b"
                tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'var(--font-mono)' }}
                tickMargin={10}
                interval="preserveStartEnd"
              />

              <YAxis
                stroke="#64748b"
                tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'var(--font-mono)' }}
                tickFormatter={(val) => {
                  if (val >= 1000000) return `${sym}${(val / 1000000).toFixed(1)}M`;
                  if (val >= 1000) return `${sym}${(val / 1000).toFixed(0)}k`;
                  return `${sym}${val}`;
                }}
                domain={dynamicYDomain}
                tickMargin={10}
              />

              <Tooltip content={<CustomTooltip />} />

              {/* Shaded Monte Carlo 10th-90th Band */}
              {showMonteCarloBand && (
                <Area
                  type="monotone"
                  dataKey="mcRange"
                  fill="url(#mcBandGradient)"
                  stroke="#3b82f6"
                  strokeWidth={0.5}
                  strokeDasharray="2 2"
                  opacity={0.7}
                  name="Monte Carlo Band (P10 - P90)"
                  isAnimationActive={false}
                />
              )}

              {/* Solid Line: Historical Price Indexed */}
              <Line
                type="monotone"
                dataKey="historical"
                stroke="#60a5fa"
                strokeWidth={3}
                dot={{ r: 3, fill: '#60a5fa', strokeWidth: 0 }}
                activeDot={{ r: 5, fill: '#93c5fd' }}
                name={`Historical Price (${ticker})`}
                connectNulls={false}
                isAnimationActive={false}
              />

              {/* Five Dashed Lines for Scenario Projections */}
              <Line
                type="monotone"
                dataKey="scen_p20"
                stroke="#10b981"
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={false}
                name="Strong Bull (+20% rel)"
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="scen_p10"
                stroke="#38bdf8"
                strokeWidth={1.75}
                strokeDasharray="4 3"
                dot={false}
                name="Optimistic (+10% rel)"
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="scen_0"
                stroke="#3b82f6"
                strokeWidth={2.5}
                strokeDasharray="6 3"
                dot={false}
                name="Base Horizon (0% rel)"
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="scen_m10"
                stroke="#fb923c"
                strokeWidth={1.75}
                strokeDasharray="4 3"
                dot={false}
                name="Conservative (-10% rel)"
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="scen_m20"
                stroke="#f43f5e"
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={false}
                name="Severe Bear (-20% rel)"
                isAnimationActive={false}
              />

              <Legend
                verticalAlign="bottom"
                height={40}
                wrapperStyle={{ paddingTop: 16, fontSize: 12 }}
                formatter={(val) => <span className="text-slate-300 font-medium mr-3">{val}</span>}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between text-[11px] text-slate-500 border-t border-slate-800/80 pt-3">
        <div className="flex items-center gap-1.5">
          <Info className="h-3.5 w-3.5 text-blue-400 shrink-0" />
          <span>
            Dynamic range adjusts vertical scaling to the active price data. Range: {sym}{dynamicYDomain[0].toLocaleString()} – {sym}{dynamicYDomain[1].toLocaleString()}.
          </span>
        </div>
        <div className="font-mono text-slate-400">
          Annual Points · 10-Year Horizon
        </div>
      </div>
    </section>
  );
};
