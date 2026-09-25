import React from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  Legend,
} from 'recharts';
import { MixAnalyticsState } from '../types';
import { TrendingUp, Target, Info, Sparkles } from 'lucide-react';

interface GoalTrajectoryChartProps {
  activeMix: MixAnalyticsState;
  targetAmount: number;
  currency: 'SGD' | 'USD';
  isRealTerms: boolean;
  years: number;
  availableMixes: MixAnalyticsState[];
  onSelectMixId: (id: string) => void;
}

export const GoalTrajectoryChart: React.FC<GoalTrajectoryChartProps> = ({
  activeMix,
  targetAmount,
  currency,
  isRealTerms,
  years,
  availableMixes,
  onSelectMixId,
}) => {
  const currencySymbol = currency === 'SGD' ? 'S$' : '$';
  const trajectories = activeMix.simulation?.trajectories || [];

  const chartData = trajectories.map((t) => ({
    year: `Yr ${t.year}`,
    yearNum: t.year,
    p10: isRealTerms ? t.real_p10 : t.p10,
    p50: isRealTerms ? t.real_p50 : t.p50,
    p90: isRealTerms ? t.real_p90 : t.p90,
    contributed: t.totalContributed,
  }));

  const formatCurrency = (val: number) => {
    if (val >= 1000000) {
      return `${currencySymbol}${(val / 1000000).toFixed(2)}M`;
    }
    if (val >= 1000) {
      return `${currencySymbol}${Math.round(val / 1000)}k`;
    }
    return `${currencySymbol}${val}`;
  };

  const prob = isRealTerms
    ? activeMix.simulation?.real_probability_of_success
    : activeMix.simulation?.probability_of_success;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
      {/* Header with Mix Switcher Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-blue-600" />
            <h2 className="text-base font-bold text-slate-900 tracking-tight font-display">
              {years}-Year Forward Wealth Trajectory
            </h2>
            <span className="text-[11px] font-mono text-slate-500">
              6-Month Block Bootstrap Simulation
            </span>
          </div>
          <p className="text-xs text-slate-600 mt-0.5">
            Illustrating 10th, 50th (median), and 90th percentile wealth accumulation paths versus your{' '}
            <strong className="text-amber-600 font-mono">
              {currencySymbol}{targetAmount.toLocaleString()}
            </strong>{' '}
            goal.
          </p>
        </div>

        {/* Mix Selector Tabs */}
        <div className="flex items-center p-1 bg-slate-100 rounded-lg border border-slate-200 text-xs self-start sm:self-auto overflow-x-auto max-w-full">
          {availableMixes.map((mix) => {
            const isSelected = activeMix.mixId === mix.mixId;
            return (
              <button
                key={mix.mixId}
                type="button"
                onClick={() => onSelectMixId(mix.mixId)}
                className={`px-3 py-1.5 rounded-md font-medium whitespace-nowrap transition-all ${
                  isSelected
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {mix.mixName}
              </button>
            );
          })}
        </div>
      </div>

      {/* Trajectory Insights Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200 font-mono text-xs">
        <div>
          <span className="text-[10px] text-slate-500 block uppercase">Selected Strategy</span>
          <span className="text-xs font-bold text-slate-800 truncate block">
            {activeMix.mixName}
          </span>
        </div>

        <div>
          <span className="text-[10px] text-slate-500 block uppercase">Target Feasibility</span>
          <span
            className={`text-xs font-bold ${
              prob && prob >= 0.8
                ? 'text-emerald-700'
                : prob && prob >= 0.6
                ? 'text-amber-700'
                : 'text-rose-700'
            }`}
          >
            {prob !== undefined ? `${Math.round(prob * 100)}% Probability` : 'Calculating...'}
          </span>
        </div>

        <div>
          <span className="text-[10px] text-slate-500 block uppercase">Median Year {years} Outcome</span>
          <span className="text-xs font-bold text-blue-600">
            {activeMix.simulation?.median_final_value
              ? `${currencySymbol}${activeMix.simulation.median_final_value.toLocaleString()}`
              : '-'}
          </span>
        </div>

        <div>
          <span className="text-[10px] text-slate-500 block uppercase">Total Principal Contributed</span>
          <span className="text-xs font-bold text-slate-700">
            {activeMix.simulation?.total_contributed
              ? `${currencySymbol}${activeMix.simulation.total_contributed.toLocaleString()}`
              : '-'}
          </span>
        </div>
      </div>

      {/* Chart Visualization */}
      <div className="h-[380px] w-full pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
            margin={{ top: 20, right: 30, left: 10, bottom: 10 }}
          >
            <defs>
              <linearGradient id="uncertaintyGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />

            <XAxis
              dataKey="year"
              stroke="#64748b"
              fontSize={11}
              fontFamily="var(--font-mono)"
              tickLine={false}
              axisLine={{ stroke: '#cbd5e1' }}
            />

            <YAxis
              stroke="#64748b"
              fontSize={11}
              fontFamily="var(--font-mono)"
              tickLine={false}
              axisLine={{ stroke: '#cbd5e1' }}
              tickFormatter={formatCurrency}
              domain={['auto', 'auto']}
            />

            <Tooltip
              content={({ active, payload, label }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload;
                  return (
                    <div className="rounded-lg border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur-md font-mono text-xs space-y-1.5 min-w-[210px]">
                      <div className="font-bold text-slate-900 pb-1 border-b border-slate-200 flex justify-between">
                        <span>Horizon {label}</span>
                        <span className="text-slate-500 text-[10px]">
                          {isRealTerms ? 'Real S$' : 'Nominal S$'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-emerald-700">
                        <span>90th % (Optimistic):</span>
                        <span className="font-bold">
                          {currencySymbol}{data.p90?.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-blue-700">
                        <span>50th % (Median):</span>
                        <span className="font-extrabold text-slate-900">
                          {currencySymbol}{data.p50?.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-rose-700">
                        <span>10th % (Conservative):</span>
                        <span className="font-bold">
                          {currencySymbol}{data.p10?.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-slate-600 pt-1 border-t border-slate-200">
                        <span>Cumulative Contributed:</span>
                        <span>{currencySymbol}{data.contributed?.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between items-center text-amber-700 text-[11px] pt-0.5">
                        <span>Target Goal:</span>
                        <span>{currencySymbol}{targetAmount.toLocaleString()}</span>
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />

            <Legend
              verticalAlign="bottom"
              height={36}
              iconType="circle"
              wrapperStyle={{ fontSize: '11px', fontFamily: 'var(--font-mono)', paddingTop: '10px' }}
            />

            {/* Target Goal Horizontal Reference Line */}
            <ReferenceLine
              y={targetAmount}
              stroke="#d97706"
              strokeDasharray="5 5"
              strokeWidth={2}
              label={{
                value: `Goal Target: ${formatCurrency(targetAmount)}`,
                position: 'top',
                fill: '#d97706',
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
              }}
            />

            {/* Shaded Area between 10th and 90th percentiles */}
            <Area
              type="monotone"
              dataKey="p90"
              stroke="transparent"
              fill="url(#uncertaintyGradient)"
              name="90th Percentile Range"
            />

            {/* 90th percentile optimistic line */}
            <Line
              type="monotone"
              dataKey="p90"
              stroke="#10b981"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
              name="90th Percentile (Optimistic)"
            />

            {/* Median 50th percentile line */}
            <Line
              type="monotone"
              dataKey="p50"
              stroke="#3b82f6"
              strokeWidth={2.5}
              dot={{ r: 3, fill: '#3b82f6' }}
              name="50th Percentile (Median Path)"
            />

            {/* 10th percentile conservative line */}
            <Line
              type="monotone"
              dataKey="p10"
              stroke="#f43f5e"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
              name="10th Percentile (Conservative)"
            />

            {/* Contributed capital baseline line */}
            <Line
              type="monotone"
              dataKey="contributed"
              stroke="#94a3b8"
              strokeWidth={1.5}
              dot={false}
              name="Total Capital Contributed"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
};
