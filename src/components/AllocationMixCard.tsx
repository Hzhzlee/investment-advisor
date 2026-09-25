import React from 'react';
import { MixAnalyticsState, AssetClassKey } from '../types';
import {
  ShieldAlert,
  Percent,
  CheckCircle,
  AlertTriangle,
  ArrowUpRight,
  TrendingDown,
  Sparkles,
  Check,
  Coins,
  Building2,
  TrendingUp,
  Globe2,
  Landmark,
  ShieldCheck,
} from 'lucide-react';

interface AllocationMixCardProps {
  mix: MixAnalyticsState;
  isActiveChart: boolean;
  onSelectActiveChart: () => void;
  onApplyAsCustom: () => void;
  targetAmount: number;
  currentMonthlyContribution: number;
  currency: 'SGD' | 'USD';
  isRealTerms: boolean;
  years: number;
}

const ASSET_COLORS: Record<AssetClassKey, string> = {
  cash: '#10b981',        // Emerald
  gov_backed: '#0ea5e9',  // Sky
  bonds: '#6366f1',       // Indigo
  global_equity: '#3b82f6', // Blue
  sg_equity: '#f43f5e',   // Rose
  reits: '#f59e0b',       // Amber
  gold: '#eab308',        // Yellow
};

const ASSET_LABELS: Record<AssetClassKey, string> = {
  cash: 'Cash',
  gov_backed: 'T-Bills/SSB',
  bonds: 'Bonds (AGG)',
  global_equity: 'Global (VT)',
  sg_equity: 'STI (ES3)',
  reits: 'REITs (VNQ)',
  gold: 'Gold (GLD)',
};

export const AllocationMixCard: React.FC<AllocationMixCardProps> = ({
  mix,
  isActiveChart,
  onSelectActiveChart,
  onApplyAsCustom,
  targetAmount,
  currentMonthlyContribution,
  currency,
  isRealTerms,
  years,
}) => {
  const currencySymbol = currency === 'SGD' ? 'S$' : '$';
  const sim = mix.simulation;
  const req = mix.requiredContribution;

  const prob = isRealTerms ? sim?.real_probability_of_success : sim?.probability_of_success;
  const probPercent = prob !== undefined ? Math.round(prob * 100) : null;

  const reqMonthly = req?.required_monthly_contribution;
  const monthlyDiff = reqMonthly !== undefined ? currentMonthlyContribution - reqMonthly : 0;

  const medianTerminal = isRealTerms ? sim?.real_median_final_value : sim?.median_final_value;
  const p10Terminal = isRealTerms ? sim?.real_p10_final : sim?.p10_final;
  const p90Terminal = isRealTerms ? sim?.real_p90_final : sim?.p90_final;

  // Active asset classes with non-zero weights
  const assetKeys = (Object.keys(mix.weights) as AssetClassKey[]).filter(
    (k) => mix.weights[k] > 0
  );

  return (
    <div
      className={`rounded-xl border transition-all flex flex-col justify-between ${
        isActiveChart
          ? 'border-blue-600 bg-white shadow-md ring-2 ring-blue-600/30'
          : 'border-slate-200 bg-white hover:border-slate-300 shadow-xs'
      }`}
    >
      <div className="p-4 sm:p-5 space-y-4">
        {/* Header & Badges */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-blue-700 font-semibold bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                {mix.mixLabel}
              </span>
              <span className="text-[11px] font-mono text-slate-500">
                Risk: <strong className="text-slate-800">{mix.riskRating}</strong>
              </span>
            </div>
            <h3 className="text-base font-bold text-slate-900 tracking-tight mt-1 font-display">
              {mix.mixName}
            </h3>
          </div>

          {/* Probability Indicator Badge */}
          {probPercent !== null && (
            <div
              className={`flex flex-col items-end px-3 py-1.5 rounded-lg border ${
                probPercent >= 80
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : probPercent >= 60
                  ? 'border-amber-200 bg-amber-50 text-amber-800'
                  : 'border-rose-200 bg-rose-50 text-rose-800'
              }`}
            >
              <div className="text-[10px] font-mono tracking-tight uppercase opacity-80">
                Success Probability
              </div>
              <div className="text-lg font-mono font-extrabold tracking-tight">
                {probPercent}%
              </div>
            </div>
          )}
        </div>

        {/* Description & Singapore Context Rationale */}
        <p className="text-xs text-slate-600 leading-relaxed">
          {mix.description}
        </p>

        {mix.rationale && (
          <div className="text-[11px] text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-200 leading-relaxed">
            <span className="text-slate-800 font-semibold">Strategic Rationale: </span>
            {mix.rationale}
          </div>
        )}

        {/* Asset Allocation Breakdown Stacked Bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-mono">
            <span className="text-slate-500">Asset Mix</span>
            <span className="text-slate-700 font-semibold">
              {mix.blendedSeries
                ? `~${(mix.blendedSeries.annualized_return * 100).toFixed(1)}% p.a. hist CAGR`
                : '100% Target'}
            </span>
          </div>

          {/* Stacked Progress Bar */}
          <div className="h-2.5 w-full bg-slate-100 rounded-full flex overflow-hidden border border-slate-200">
            {assetKeys.map((key) => {
              const weight = mix.weights[key];
              return (
                <div
                  key={key}
                  style={{
                    width: `${weight * 100}%`,
                    backgroundColor: ASSET_COLORS[key],
                  }}
                  title={`${ASSET_LABELS[key]}: ${(weight * 100).toFixed(0)}%`}
                />
              );
            })}
          </div>

          {/* Key Legend Pill Breakdown */}
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-mono text-slate-500 pt-1">
            {assetKeys.map((key) => {
              const weight = mix.weights[key];
              return (
                <span key={key} className="flex items-center gap-1">
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: ASSET_COLORS[key] }}
                  />
                  <span>{ASSET_LABELS[key]}</span>
                  <strong className="text-slate-800">{(weight * 100).toFixed(0)}%</strong>
                </span>
              );
            })}
          </div>
        </div>

        {/* Required Contribution Analysis */}
        <div className="pt-2 border-t border-slate-200 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-slate-800 block">
                Required Monthly Contribution
              </span>
              <span className="text-[10px] text-slate-500 font-mono">
                To reach target at 80% confidence
              </span>
            </div>

            <div className="text-right font-mono">
              {req?.achievable === false ? (
                <span className="text-xs font-bold text-rose-600">
                  Unattainable ({(req.achieved_probability ? (req.achieved_probability * 100).toFixed(0) : 0)}% max)
                </span>
              ) : (
                <>
                  <span className="text-base font-extrabold text-blue-600">
                    {reqMonthly !== undefined
                      ? `${currencySymbol}${reqMonthly.toLocaleString()}`
                      : 'Computing...'}
                  </span>
                  <span className="text-xs text-slate-500">/mo</span>
                </>
              )}
            </div>
          </div>

          {/* Shortfall or Surplus Banner */}
          {reqMonthly !== undefined && (
            <div
              className={`p-2 rounded-lg text-xs font-mono flex items-center justify-between ${
                req?.achievable === false
                  ? 'bg-rose-50 border border-rose-200 text-rose-800'
                  : monthlyDiff >= 0
                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                  : 'bg-amber-50 border border-amber-200 text-amber-800'
              }`}
            >
              <div className="flex items-center gap-1.5">
                {req?.achievable === false ? (
                  <AlertTriangle className="h-3.5 w-3.5 text-rose-600 shrink-0" />
                ) : monthlyDiff >= 0 ? (
                  <CheckCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                )}
                <span>
                  {req?.achievable === false
                    ? 'Target exceeds maximum search bound'
                    : monthlyDiff >= 0
                    ? `Surplus of ${currencySymbol}${Math.abs(monthlyDiff).toLocaleString()}/mo`
                    : `Shortfall of ${currencySymbol}${Math.abs(monthlyDiff).toLocaleString()}/mo`}
                </span>
              </div>

              <span className="text-[10px] text-slate-500">
                (Current: {currencySymbol}{currentMonthlyContribution})
              </span>
            </div>
          )}
        </div>

        {/* Outcome Trajectory Range (10th, 50th, 90th) */}
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-500">
            <span>{years}-Yr Outcome {isRealTerms ? '(Real S$)' : '(Nominal S$)'}</span>
            <span>Target: {currencySymbol}{targetAmount.toLocaleString()}</span>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-200 text-center font-mono">
            <div>
              <span className="text-[10px] text-rose-600 block">10th Percentile</span>
              <span className="text-xs font-bold text-slate-700">
                {p10Terminal !== undefined ? `${currencySymbol}${p10Terminal.toLocaleString()}` : '-'}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-blue-600 block font-semibold">50th (Median)</span>
              <span className="text-xs font-extrabold text-slate-900">
                {medianTerminal !== undefined ? `${currencySymbol}${medianTerminal.toLocaleString()}` : '-'}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-emerald-600 block">90th Percentile</span>
              <span className="text-xs font-bold text-slate-700">
                {p90Terminal !== undefined ? `${currencySymbol}${p90Terminal.toLocaleString()}` : '-'}
              </span>
            </div>
          </div>
        </div>

        {/* Unit Drawdown (Median & P95) */}
        {(sim?.drawdown_p95 !== undefined || sim?.worst_case_drawdown !== undefined) && (
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 px-1">
            <span className="flex items-center gap-1">
              <TrendingDown className="h-3 w-3 text-rose-600" />
              <span>Simulated Drawdown (Median / P95):</span>
            </span>
            <span className="text-slate-800 font-bold">
              {sim.drawdown_median !== undefined ? `${(sim.drawdown_median * 100).toFixed(1)}% / ` : ''}
              <span className="text-rose-600">
                {((sim.drawdown_p95 ?? sim.worst_case_drawdown) * 100).toFixed(1)}%
              </span>
            </span>
          </div>
        )}
      </div>

      {/* Card Actions */}
      <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onApplyAsCustom}
          className="text-xs font-medium text-slate-600 hover:text-slate-900 px-2.5 py-1.5 rounded hover:bg-slate-100 transition-colors"
        >
          Customize Weights
        </button>

        <button
          type="button"
          onClick={onSelectActiveChart}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            isActiveChart
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
          }`}
        >
          {isActiveChart ? (
            <>
              <Check className="h-3.5 w-3.5 text-white" />
              <span>Chart Active</span>
            </>
          ) : (
            <>
              <ArrowUpRight className="h-3.5 w-3.5" />
              <span>View Trajectory</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
