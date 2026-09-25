import React, { useState } from 'react';
import { Search, Sliders, RefreshCw, ChevronDown } from 'lucide-react';

interface ControlsProps {
  ticker: string;
  onTickerChange: (ticker: string) => void;
  years: number;
  onYearsChange: (years: number) => void;
  initialAmount: number;
  onInitialAmountChange: (amount: number) => void;
  monthlyContribution: number;
  onMonthlyContributionChange: (contrib: number) => void;
  cagrAdjustment: number;
  onCagrAdjustmentChange: (adj: number) => void;
  isLoading: boolean;
  onRunMcpPipeline: () => void;
  currency: 'SGD' | 'USD';
}

const POPULAR_TICKERS = [
  { symbol: 'ES3.SI', label: 'ES3.SI (STI SG)', name: 'STI ETF (Singapore)' },
  { symbol: 'SPY', label: 'SPY (S&P 500)', name: 'S&P 500 (US Large Cap)' },
  { symbol: 'VT', label: 'VT (Total World)', name: 'Vanguard Total World' },
  { symbol: 'QQQ', label: 'QQQ (Nasdaq 100)', name: 'Invesco Nasdaq 100' },
  { symbol: 'VOO', label: 'VOO (Vanguard 500)', name: 'Vanguard S&P 500' },
  { symbol: 'VTI', label: 'VTI (Total US)', name: 'Vanguard Total US Market' },
  { symbol: 'MBH.SI', label: 'MBH.SI (SG Bond)', name: 'Nikko AM SGD Bond ETF' },
];

export const Controls: React.FC<ControlsProps> = ({
  ticker,
  onTickerChange,
  years,
  onYearsChange,
  initialAmount,
  onInitialAmountChange,
  monthlyContribution,
  onMonthlyContributionChange,
  cagrAdjustment,
  onCagrAdjustmentChange,
  isLoading,
  onRunMcpPipeline,
  currency,
}) => {
  const [customInput, setCustomInput] = useState('');
  const currencySymbol = currency === 'SGD' ? 'S$' : '$';

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (customInput.trim()) {
      onTickerChange(customInput.trim().toUpperCase());
      setCustomInput('');
    }
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        {/* Ticker Selector Deck */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mr-1">
            Focus ETF:
          </span>

          {/* Popular Ticker Quick Pills */}
          <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 rounded-lg border border-slate-200">
            {POPULAR_TICKERS.map((t) => {
              const isActive = ticker.toUpperCase() === t.symbol;
              return (
                <button
                  key={t.symbol}
                  type="button"
                  onClick={() => onTickerChange(t.symbol)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all whitespace-nowrap ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                  }`}
                  title={t.name}
                >
                  {t.symbol}
                </button>
              );
            })}
          </div>

          {/* Custom ticker search form */}
          <form onSubmit={handleCustomSubmit} className="flex items-center">
            <div className="relative flex items-center">
              <input
                type="text"
                placeholder="Enter ticker (e.g. VT, AAPL)..."
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value.toUpperCase())}
                className="w-40 sm:w-48 h-8 pl-7 pr-2 text-xs font-mono font-medium text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-xs"
              />
              <Search className="absolute left-2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            </div>
            {customInput.trim() && (
              <button
                type="submit"
                className="ml-1.5 h-8 px-3 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-xs"
              >
                Set Focus
              </button>
            )}
          </form>

          {/* Currently selected indicator */}
          <span className="text-xs font-mono px-2.5 py-1 bg-blue-50 border border-blue-200 text-blue-700 rounded-md flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-pulse" />
            <span>Active: {ticker.toUpperCase()}</span>
          </span>
        </div>

        {/* History Lookback Length */}
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            History Horizon:
          </span>
          <div className="flex items-center p-1 bg-slate-100 rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={() => onYearsChange(5)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all whitespace-nowrap ${
                years === 5
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              5 Years
            </button>
            <button
              type="button"
              onClick={() => onYearsChange(10)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all whitespace-nowrap ${
                years === 10
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              10 Years
            </button>
          </div>
        </div>
      </div>

      {/* Numerical Projection Controls */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-5">
        {/* Initial Amount Input */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <label htmlFor="initial-amount" className="font-semibold text-slate-700">
              Initial Capital ({currencySymbol})
            </label>
            <span className="font-mono text-blue-600 font-semibold">
              {currencySymbol}{initialAmount.toLocaleString()}
            </span>
          </div>

          <div className="relative rounded-lg border border-slate-300 bg-white focus-within:border-blue-500 transition-colors shadow-xs">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 text-xs font-mono">
              {currencySymbol}
            </span>
            <input
              id="initial-amount"
              type="number"
              min="0"
              step="1000"
              value={initialAmount}
              onChange={(e) => onInitialAmountChange(Math.max(0, Number(e.target.value)))}
              className="w-full pl-8 pr-3 py-2 text-sm font-mono font-medium text-slate-900 bg-transparent rounded-lg focus:outline-none"
            />
          </div>

          {/* Quick preset buttons */}
          <div className="flex items-center gap-1.5 pt-0.5">
            {[5000, 10000, 25000, 50000].map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => onInitialAmountChange(amt)}
                className={`px-2 py-0.5 text-[11px] font-mono rounded border transition-colors ${
                  initialAmount === amt
                    ? 'bg-blue-50 border-blue-300 text-blue-700 font-semibold'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                {currencySymbol}{(amt / 1000).toFixed(0)}k
              </button>
            ))}
          </div>
        </div>

        {/* Monthly Contribution Input */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <label htmlFor="monthly-contribution" className="font-semibold text-slate-700">
              Monthly Contribution ({currencySymbol}/mo)
            </label>
            <span className="font-mono text-blue-600 font-semibold">
              {currencySymbol}{monthlyContribution.toLocaleString()}/mo
            </span>
          </div>

          <div className="relative rounded-lg border border-slate-300 bg-white focus-within:border-blue-500 transition-colors shadow-xs">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 text-xs font-mono">
              {currencySymbol}
            </span>
            <input
              id="monthly-contribution"
              type="number"
              min="0"
              step="100"
              value={monthlyContribution}
              onChange={(e) => onMonthlyContributionChange(Math.max(0, Number(e.target.value)))}
              className="w-full pl-8 pr-3 py-2 text-sm font-mono font-medium text-slate-900 bg-transparent rounded-lg focus:outline-none"
            />
          </div>

          {/* Quick contribution presets */}
          <div className="flex items-center gap-1.5 pt-0.5">
            {[0, 250, 500, 1000, 2000].map((contrib) => (
              <button
                key={contrib}
                type="button"
                onClick={() => onMonthlyContributionChange(contrib)}
                className={`px-2 py-0.5 text-[11px] font-mono rounded border transition-colors ${
                  monthlyContribution === contrib
                    ? 'bg-blue-50 border-blue-300 text-blue-700 font-semibold'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                {currencySymbol}{contrib}
              </button>
            ))}
          </div>
        </div>

        {/* Base CAGR Sensitivity Adjustment Slider */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5">
              <Sliders className="h-3.5 w-3.5 text-blue-600" />
              <span className="font-semibold text-slate-700">Base CAGR Adjustment</span>
            </div>
            <span className="font-mono font-semibold text-slate-900">
              {cagrAdjustment > 0 ? `+${(cagrAdjustment * 100).toFixed(0)}%` : `${(cagrAdjustment * 100).toFixed(0)}%`}
            </span>
          </div>

          <div className="pt-2">
            <input
              type="range"
              min="-0.5"
              max="0.5"
              step="0.05"
              value={cagrAdjustment}
              onChange={(e) => onCagrAdjustmentChange(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
            <div className="flex justify-between text-[10px] font-mono text-slate-500 pt-1">
              <span>-50% (Bearish)</span>
              <span>Baseline (0%)</span>
              <span>+50% (Bullish)</span>
            </div>
          </div>

          <div className="flex items-center justify-between pt-0.5 text-[11px] text-slate-500">
            <span>Sensitizes 10Y projection rates</span>
            {cagrAdjustment !== 0 && (
              <button
                type="button"
                onClick={() => onCagrAdjustmentChange(0)}
                className="text-blue-600 hover:underline text-[10px] font-mono font-medium"
              >
                Reset to 0%
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
