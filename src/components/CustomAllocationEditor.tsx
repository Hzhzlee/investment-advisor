import React from 'react';
import { AssetClassKey, AssetClassConfig } from '../types';
import { Sliders, RefreshCw, CheckCircle2, AlertTriangle, Layers, Percent } from 'lucide-react';

interface CustomAllocationEditorProps {
  weights: Record<AssetClassKey, number>;
  onWeightChange: (key: AssetClassKey, newWeight: number) => void;
  onNormalizeWeights: () => void;
  configs: Record<AssetClassKey, AssetClassConfig>;
  onApplyPresetWeights: (preset: 'balanced' | 'all_weather' | 'growth') => void;
  isSimulating: boolean;
  onRunSimulation: () => void;
}

const ASSET_ORDER: AssetClassKey[] = [
  'cash',
  'gov_backed',
  'bonds',
  'global_equity',
  'sg_equity',
  'reits',
  'gold'
];

export const CustomAllocationEditor: React.FC<CustomAllocationEditorProps> = ({
  weights,
  onWeightChange,
  onNormalizeWeights,
  configs,
  onApplyPresetWeights,
  isSimulating,
  onRunSimulation,
}) => {
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  const totalPercent = Math.round(totalWeight * 100);
  const is100 = totalPercent === 100;

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl backdrop-blur-md space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <Sliders className="h-4 w-4 text-blue-400" />
            <h2 className="text-base font-bold text-white tracking-tight font-display">
              Custom Asset Mix Builder
            </h2>
            <span className="text-[11px] font-mono text-slate-400">
              Interactive 7-Asset Rebalancer
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Craft your bespoke portfolio allocation. The engine models annual rebalancing and tests goal probability via block bootstrapping.
          </p>
        </div>

        {/* Total Weight Status & Action */}
        <div className="flex items-center gap-2.5">
          <div
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-mono text-xs ${
              is100
                ? 'border-emerald-800/80 bg-emerald-950/40 text-emerald-300'
                : 'border-amber-800/80 bg-amber-950/40 text-amber-300'
            }`}
          >
            {is100 ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
            )}
            <span>Total: {totalPercent}%</span>
          </div>

          {!is100 && (
            <button
              type="button"
              onClick={onNormalizeWeights}
              className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors flex items-center gap-1"
            >
              <RefreshCw className="h-3 w-3" />
              <span>Normalize to 100%</span>
            </button>
          )}

          <button
            type="button"
            onClick={onRunSimulation}
            disabled={isSimulating}
            className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-md shadow-emerald-950/50"
          >
            {isSimulating ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Layers className="h-3.5 w-3.5" />
            )}
            <span>Recalculate Custom Mix</span>
          </button>
        </div>
      </div>

      {/* Preset Quick Actions */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-slate-400 text-[11px] font-mono">Quick Blueprints:</span>
        <button
          type="button"
          onClick={() => onApplyPresetWeights('balanced')}
          className="px-2.5 py-1 rounded bg-slate-950 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 transition-colors"
        >
          Singapore Balanced (50/50)
        </button>
        <button
          type="button"
          onClick={() => onApplyPresetWeights('all_weather')}
          className="px-2.5 py-1 rounded bg-slate-950 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 transition-colors"
        >
          All-Weather (Gold + REITs + Bonds)
        </button>
        <button
          type="button"
          onClick={() => onApplyPresetWeights('growth')}
          className="px-2.5 py-1 rounded bg-slate-950 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 transition-colors"
        >
          High-Growth Global (80% Equity)
        </button>
      </div>

      {/* Sliders Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5 pt-1">
        {ASSET_ORDER.map((key) => {
          const cfg = configs[key];
          const currentWeight = weights[key] || 0;
          const currentPercent = Math.round(currentWeight * 100);

          return (
            <div
              key={key}
              className="rounded-lg border border-slate-800/80 bg-slate-950/60 p-3.5 space-y-2.5"
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-white block">
                    {cfg.name}
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    {cfg.isFixedRate ? `Assumed ${((cfg.fixedRate ?? 0.02) * 100).toFixed(1)}%` : cfg.currentProxy}
                  </span>
                </div>

                <div className="flex items-center gap-1 font-mono">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={currentPercent}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (!isNaN(val)) {
                        onWeightChange(key, Math.max(0, Math.min(100, val)) / 100);
                      }
                    }}
                    className="w-12 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-xs font-bold text-white text-right focus:outline-none focus:border-blue-500"
                  />
                  <span className="text-xs font-semibold text-slate-400">%</span>
                </div>
              </div>

              {/* Slider */}
              <div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={currentPercent}
                  onChange={(e) => onWeightChange(key, Number(e.target.value) / 100)}
                  className="w-full accent-blue-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                <span>0%</span>
                <span>50%</span>
                <span>100%</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
