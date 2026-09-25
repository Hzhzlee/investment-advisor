import React from 'react';
import { Target, Calendar, DollarSign, Wallet, Shield, Sparkles, TrendingUp } from 'lucide-react';

export interface GoalPreset {
  id: string;
  title: string;
  defaultTarget: number;
  defaultYears: number;
  defaultStart: number;
  defaultMonthly: number;
  defaultRisk: number;
  description: string;
}

export const SINGAPORE_GOAL_PRESETS: GoalPreset[] = [
  {
    id: 'retirement',
    title: 'Singapore Retirement Nest Egg',
    defaultTarget: 600000,
    defaultYears: 15,
    defaultStart: 30000,
    defaultMonthly: 1200,
    defaultRisk: 3,
    description: 'Supplemental nest egg above CPF Life payouts to fund comfortable retirement.'
  },
  {
    id: 'hdb_downpayment',
    title: 'HDB / Resale Downpayment',
    defaultTarget: 150000,
    defaultYears: 5,
    defaultStart: 25000,
    defaultMonthly: 1500,
    defaultRisk: 2,
    description: 'Capital accumulation for housing downpayment and BSD stamp duties.'
  },
  {
    id: 'child_education',
    title: 'Child Tertiary Education Fund',
    defaultTarget: 120000,
    defaultYears: 10,
    defaultStart: 15000,
    defaultMonthly: 600,
    defaultRisk: 3,
    description: 'Tuition and living expenses for local/overseas university education.'
  },
  {
    id: 'fire',
    title: 'Financial Independence (FIRE)',
    defaultTarget: 1200000,
    defaultYears: 20,
    defaultStart: 50000,
    defaultMonthly: 2000,
    defaultRisk: 4,
    description: 'Multi-decade wealth accumulation to achieve passive dividend/withdrawal autonomy.'
  },
  {
    id: 'custom',
    title: 'Custom Wealth Goal',
    defaultTarget: 300000,
    defaultYears: 10,
    defaultStart: 20000,
    defaultMonthly: 800,
    defaultRisk: 3,
    description: 'Tailored milestone for personal wealth building.'
  }
];

interface GoalPlannerProps {
  selectedPreset: string;
  onSelectPreset: (preset: GoalPreset) => void;
  targetAmount: number;
  onTargetAmountChange: (val: number) => void;
  years: number;
  onYearsChange: (val: number) => void;
  startValue: number;
  onStartValueChange: (val: number) => void;
  monthlyContribution: number;
  onMonthlyContributionChange: (val: number) => void;
  riskLevel: number;
  onRiskLevelChange: (val: number) => void;
  inflation: number;
  onInflationChange: (val: number) => void;
  isRealTerms: boolean;
  onToggleRealTerms: (val: boolean) => void;
  currency: 'SGD' | 'USD';
}

export const GoalPlanner: React.FC<GoalPlannerProps> = ({
  selectedPreset,
  onSelectPreset,
  targetAmount,
  onTargetAmountChange,
  years,
  onYearsChange,
  startValue,
  onStartValueChange,
  monthlyContribution,
  onMonthlyContributionChange,
  riskLevel,
  onRiskLevelChange,
  inflation,
  onInflationChange,
  isRealTerms,
  onToggleRealTerms,
  currency,
}) => {
  const currencySymbol = currency === 'SGD' ? 'S$' : '$';

  const getRiskLabel = (lvl: number) => {
    switch (lvl) {
      case 1:
        return { name: '1. Very Conservative', desc: 'Focus on capital preservation; minimal market drops.' };
      case 2:
        return { name: '2. Conservative', desc: 'Income and capital stability with modest equity.' };
      case 3:
        return { name: '3. Balanced / Moderate', desc: 'Equal balance of growth and defensive assets.' };
      case 4:
        return { name: '4. Growth', desc: 'High equity tilt for capital appreciation.' };
      case 5:
        return { name: '5. Aggressive Growth', desc: 'Maximum compounding; comfortable with high volatility.' };
      default:
        return { name: 'Moderate', desc: '' };
    }
  };

  const riskInfo = getRiskLabel(riskLevel);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-6">
      {/* Header with Preset Selector */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-blue-50 text-blue-600 border border-blue-100">
              <Target className="h-4 w-4" />
            </span>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight font-display">
              Define Your Singapore Investment Goal
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Specify your financial objective and risk comfort. The platform illustrates asset mixes, calculates required monthly savings, and evaluates goal probabilities.
          </p>
        </div>

        {/* Inflation & Real Terms Toggle */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Nominal vs Real Toggle */}
          <div className="flex items-center p-1 bg-slate-100 rounded-lg border border-slate-200 text-xs">
            <button
              type="button"
              onClick={() => onToggleRealTerms(false)}
              className={`px-2.5 py-1 rounded font-medium transition-all ${
                !isRealTerms
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Nominal {currencySymbol}
            </button>
            <button
              type="button"
              onClick={() => onToggleRealTerms(true)}
              className={`px-2.5 py-1 rounded font-medium transition-all ${
                isRealTerms
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Adjusts all trajectories and target for Singapore inflation"
            >
              Real (Purchasing Power)
            </button>
          </div>

          {/* Inflation Rate Input */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-700 font-mono">
            <span className="text-[11px] text-slate-500">Inflation:</span>
            <input
              type="number"
              step="0.1"
              min="0"
              max="10"
              value={Math.round(inflation * 1000) / 10}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                if (!isNaN(val) && val >= 0) {
                  onInflationChange(val / 100);
                }
              }}
              className="w-11 bg-white border border-slate-200 rounded px-1 py-0.5 text-xs font-mono font-bold text-slate-900 text-center focus:outline-none focus:border-blue-500"
            />
            <span className="text-slate-500">% p.a.</span>
          </div>
        </div>
      </div>

      {/* Goal Presets Buttons */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-slate-700">
          Popular Singapore Goal Profiles:
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {SINGAPORE_GOAL_PRESETS.map((preset) => {
            const isSelected = selectedPreset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => onSelectPreset(preset)}
                className={`p-2.5 text-left rounded-lg border transition-all flex flex-col justify-between ${
                  isSelected
                    ? 'border-blue-600 bg-blue-50 text-blue-900 shadow-xs ring-1 ring-blue-600'
                    : 'border-slate-200 bg-slate-50/70 text-slate-700 hover:border-slate-300 hover:bg-slate-100'
                }`}
              >
                <span className="text-xs font-bold truncate">
                  {preset.title}
                </span>
                <span className="text-[10px] text-slate-500 font-mono mt-1">
                  {currencySymbol}{preset.defaultTarget.toLocaleString()} · {preset.defaultYears} yrs
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Primary Goal Parameters Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Target Amount */}
        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 space-y-1.5">
          <label htmlFor="targetAmountInput" className="text-xs font-semibold text-slate-700 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Target className="h-3.5 w-3.5 text-amber-600" />
              Target Goal Amount
            </span>
            <span className="text-[10px] font-mono text-slate-500">{currency}</span>
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-xs">
              {currencySymbol}
            </span>
            <input
              id="targetAmountInput"
              type="number"
              step="5000"
              min="1000"
              value={targetAmount}
              onChange={(e) => onTargetAmountChange(Math.max(1000, Number(e.target.value)))}
              className="w-full bg-white border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-sm font-mono font-bold text-slate-900 focus:outline-none focus:border-blue-500 shadow-xs"
            />
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-mono">
            <span>Quick:</span>
            {[100000, 250000, 500000, 1000000].map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => onTargetAmountChange(amt)}
                className="hover:text-blue-600 underline"
              >
                ${amt >= 1000000 ? `${amt / 1000000}M` : `${amt / 1000}k`}
              </button>
            ))}
          </div>
        </div>

        {/* 2. Horizon in Years */}
        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 space-y-1.5">
          <label htmlFor="yearsInput" className="text-xs font-semibold text-slate-700 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-blue-600" />
              Time Horizon
            </span>
            <span className="text-xs font-mono font-bold text-blue-600">{years} Years</span>
          </label>
          <div className="pt-1">
            <input
              id="yearsInput"
              type="range"
              min="3"
              max="25"
              step="1"
              value={years}
              onChange={(e) => onYearsChange(Number(e.target.value))}
              className="w-full accent-blue-600 h-1.5 bg-slate-200 rounded-lg cursor-pointer"
            />
          </div>
          <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 pt-0.5">
            <span>3 yrs</span>
            <span>5 yrs</span>
            <span>10 yrs</span>
            <span>15 yrs</span>
            <span>25 yrs</span>
          </div>
        </div>

        {/* 3. Starting Capital */}
        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 space-y-1.5">
          <label htmlFor="startCapitalInput" className="text-xs font-semibold text-slate-700 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Wallet className="h-3.5 w-3.5 text-emerald-600" />
              Starting Capital
            </span>
            <span className="text-[10px] font-mono text-slate-500">Current Savings</span>
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-xs">
              {currencySymbol}
            </span>
            <input
              id="startCapitalInput"
              type="number"
              step="1000"
              min="0"
              value={startValue}
              onChange={(e) => onStartValueChange(Math.max(0, Number(e.target.value)))}
              className="w-full bg-white border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-sm font-mono font-bold text-slate-900 focus:outline-none focus:border-blue-500 shadow-xs"
            />
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-mono">
            <span>Quick:</span>
            {[0, 10000, 30000, 50000].map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => onStartValueChange(amt)}
                className="hover:text-blue-600 underline"
              >
                ${amt / 1000}k
              </button>
            ))}
          </div>
        </div>

        {/* 4. Monthly Savings Contribution */}
        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 space-y-1.5">
          <label htmlFor="monthlyContributionInput" className="text-xs font-semibold text-slate-700 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <DollarSign className="h-3.5 w-3.5 text-sky-600" />
              Current Monthly Savings
            </span>
            <span className="text-[10px] font-mono text-slate-500">per month</span>
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-xs">
              {currencySymbol}
            </span>
            <input
              id="monthlyContributionInput"
              type="number"
              step="50"
              min="0"
              value={monthlyContribution}
              onChange={(e) => onMonthlyContributionChange(Math.max(0, Number(e.target.value)))}
              className="w-full bg-white border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-sm font-mono font-bold text-slate-900 focus:outline-none focus:border-blue-500 shadow-xs"
            />
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-mono">
            <span>Quick:</span>
            {[300, 500, 1000, 2000].map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => onMonthlyContributionChange(amt)}
                className="hover:text-blue-600 underline"
              >
                ${amt}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Comfort with Risk (1-5 Segmented Selector) */}
      <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-indigo-600" />
            <span className="text-xs font-bold text-slate-900">
              Comfort with Risk:
            </span>
            <span className="text-xs font-semibold text-indigo-700">
              {riskInfo.name}
            </span>
          </div>

          <p className="text-[11px] text-slate-500 font-sans">
            {riskInfo.desc}
          </p>
        </div>

        {/* 5-step Segmented Buttons */}
        <div className="grid grid-cols-5 gap-1.5 p-1 bg-white rounded-lg border border-slate-200">
          {[
            { lvl: 1, label: '1. Very Conservative', short: 'Preservation' },
            { lvl: 2, label: '2. Conservative', short: 'Income' },
            { lvl: 3, label: '3. Balanced', short: 'Balanced' },
            { lvl: 4, label: '4. Growth', short: 'Growth' },
            { lvl: 5, label: '5. Aggressive', short: 'Aggressive' },
          ].map((item) => {
            const isActive = riskLevel === item.lvl;
            return (
              <button
                key={item.lvl}
                type="button"
                onClick={() => onRiskLevelChange(item.lvl)}
                className={`py-2 px-1 text-center rounded text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <div className="text-[10px] font-mono opacity-80 sm:hidden">L{item.lvl}</div>
                <div className="text-[11px] hidden sm:block truncate">{item.short}</div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
};
