import React, { useState } from 'react';
import { AssetClassConfig, AssetClassKey } from '../types';
import { mcpClient } from '../services/mcpClient';
import {
  Coins,
  Building2,
  TrendingUp,
  Globe2,
  Landmark,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Info,
  Sliders,
} from 'lucide-react';

interface AssetBuildingBlocksProps {
  configs: Record<AssetClassKey, AssetClassConfig>;
  onUpdateRate: (key: AssetClassKey, rate: number) => void;
  onUpdateProxy: (key: AssetClassKey, ticker: string) => void;
  feeDrag: number;
  onUpdateFeeDrag: (drag: number) => void;
}

export const AssetBuildingBlocks: React.FC<AssetBuildingBlocksProps> = ({
  configs,
  onUpdateRate,
  onUpdateProxy,
  feeDrag,
  onUpdateFeeDrag,
}) => {
  const [editingTickerKey, setEditingTickerKey] = useState<AssetClassKey | null>(null);
  const [tempTickerValue, setTempTickerValue] = useState('');
  const [validationStatus, setValidationStatus] = useState<Record<string, { status: 'idle' | 'validating' | 'success' | 'error'; message?: string }>>({});

  const assetList: AssetClassKey[] = [
    'cash',
    'gov_backed',
    'bonds',
    'global_equity',
    'sg_equity',
    'reits',
    'gold'
  ];

  const getIcon = (key: AssetClassKey) => {
    switch (key) {
      case 'cash':
        return <Coins className="h-4 w-4 text-emerald-400" />;
      case 'gov_backed':
        return <Landmark className="h-4 w-4 text-sky-400" />;
      case 'bonds':
        return <ShieldCheck className="h-4 w-4 text-indigo-400" />;
      case 'global_equity':
        return <Globe2 className="h-4 w-4 text-blue-400" />;
      case 'sg_equity':
        return <TrendingUp className="h-4 w-4 text-rose-400" />;
      case 'reits':
        return <Building2 className="h-4 w-4 text-amber-400" />;
      case 'gold':
        return <Coins className="h-4 w-4 text-yellow-400" />;
    }
  };

  const handleStartEditTicker = (key: AssetClassKey, currentTicker: string) => {
    setEditingTickerKey(key);
    setTempTickerValue(currentTicker);
  };

  const handleValidateAndSaveTicker = async (key: AssetClassKey) => {
    const clean = tempTickerValue.trim().toUpperCase();
    if (!clean) return;

    setValidationStatus(prev => ({
      ...prev,
      [key]: { status: 'validating' }
    }));

    try {
      // Validate via MCP get_price_history tool
      const res = await mcpClient.getPriceHistory(clean, 5);
      if (res && res.prices && res.prices.length >= 2) {
        onUpdateProxy(key, clean);
        setEditingTickerKey(null);
        setValidationStatus(prev => ({
          ...prev,
          [key]: {
            status: 'success',
            message: `Verified (${res.currency}, ${res.prices.length} pts, ${res.adjusted_close_available ? 'Total Return' : 'Close'})`
          }
        }));
        setTimeout(() => {
          setValidationStatus(prev => ({ ...prev, [key]: { status: 'idle' } }));
        }, 4000);
      } else {
        throw new Error('No historical prices returned.');
      }
    } catch (err: any) {
      const msg = err?.message || 'Ticker not found on Yahoo Finance.';
      setValidationStatus(prev => ({
        ...prev,
        [key]: { status: 'error', message: msg }
      }));
    }
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900 tracking-tight font-display">
              Asset-Class Building Blocks & Proxies
            </h2>
            <span className="text-[11px] font-mono text-slate-500">
              7 Configurable Components
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Model building blocks for Singapore retail investors. Cash & sovereign rates use user-editable assumptions. Market proxies use dividend-adjusted total returns.
          </p>
        </div>

        {/* Expense ratio / fee drag input */}
        <div className="flex items-center gap-2.5 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200 self-start sm:self-auto">
          <Sliders className="h-3.5 w-3.5 text-blue-600" />
          <div className="flex flex-col">
            <label htmlFor="feeDragInput" className="text-[10px] text-slate-500 font-medium">
              Expense Ratio / Fee Drag
            </label>
            <div className="flex items-center gap-1.5 mt-0.5">
              <input
                id="feeDragInput"
                type="number"
                step="0.05"
                min="0"
                max="3.0"
                value={Math.round(feeDrag * 1000) / 10}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (!isNaN(val) && val >= 0) {
                    onUpdateFeeDrag(val / 100);
                  }
                }}
                className="w-14 bg-white border border-slate-200 rounded px-1.5 py-0.5 text-xs font-mono font-semibold text-slate-900 focus:outline-none focus:border-blue-500 shadow-xs"
              />
              <span className="text-xs text-slate-500 font-mono">% p.a.</span>
            </div>
          </div>
        </div>
      </div>

      {/* Grid of 7 asset classes */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
        {assetList.map((key) => {
          const cfg = configs[key];
          const valState = validationStatus[key];

          return (
            <div
              key={key}
              className="rounded-lg border border-slate-200 bg-slate-50/60 p-3.5 flex flex-col justify-between hover:border-slate-300 hover:bg-slate-50 transition-colors shadow-2xs"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded bg-white border border-slate-200 shadow-2xs">
                      {getIcon(key)}
                    </div>
                    <span className="text-xs font-bold text-slate-900">
                      {cfg.name}
                    </span>
                  </div>

                  <span className="text-[10px] font-mono text-slate-500">
                    {cfg.category}
                  </span>
                </div>

                <p className="text-[11px] text-slate-600 leading-relaxed mb-3">
                  {cfg.description}
                </p>
              </div>

              {/* Editable Configuration */}
              <div className="pt-2 border-t border-slate-200">
                {cfg.isFixedRate ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-amber-700 font-medium flex items-center gap-1">
                        <Info className="h-3 w-3" />
                        Assumption to update
                      </span>
                      <div className="flex items-center gap-1 font-mono">
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          max="15"
                          value={Math.round((cfg.fixedRate ?? 0.02) * 1000) / 10}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            if (!isNaN(val)) {
                              onUpdateRate(key, val / 100);
                            }
                          }}
                          className="w-14 bg-white border border-slate-200 rounded px-1.5 py-0.5 text-xs font-mono font-bold text-slate-900 text-right focus:outline-none focus:border-blue-500 shadow-2xs"
                        />
                        <span className="text-xs text-slate-700 font-semibold">%</span>
                      </div>
                    </div>
                    {cfg.assumptionNote && (
                      <p className="text-[10px] text-slate-500 leading-tight">
                        {cfg.assumptionNote}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-500">Market Proxy:</span>
                      {editingTickerKey === key ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={tempTickerValue}
                            onChange={(e) => setTempTickerValue(e.target.value.toUpperCase())}
                            placeholder="Ticker"
                            className="w-20 bg-white border border-blue-500 rounded px-1.5 py-0.5 text-xs font-mono font-bold text-slate-900 uppercase focus:outline-none shadow-2xs"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => handleValidateAndSaveTicker(key)}
                            disabled={valState?.status === 'validating'}
                            className="px-2 py-0.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-[10px] font-semibold transition-colors flex items-center gap-0.5 shadow-2xs"
                          >
                            {valState?.status === 'validating' ? (
                              <RefreshCw className="h-3 w-3 animate-spin" />
                            ) : (
                              'Save'
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingTickerKey(null)}
                            className="px-1.5 py-0.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded text-[10px]"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                            {cfg.currentProxy}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleStartEditTicker(key, cfg.currentProxy)}
                            className="text-[10px] text-slate-500 hover:text-slate-900 underline underline-offset-2 transition-colors"
                          >
                            Swap
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Validation feedback message */}
                    {valState?.status === 'success' && (
                      <div className="flex items-center gap-1 text-[10px] text-emerald-600 font-mono">
                        <CheckCircle2 className="h-3 w-3 shrink-0" />
                        <span className="truncate">{valState.message}</span>
                      </div>
                    )}
                    {valState?.status === 'error' && (
                      <div className="flex items-start gap-1 text-[10px] text-rose-600 font-mono leading-tight">
                        <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" />
                        <span>{valState.message}</span>
                      </div>
                    )}
                    {!valState?.status || valState.status === 'idle' ? (
                      <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                        <span>Default: {cfg.defaultProxy}</span>
                        <span className="text-emerald-600 font-medium">Total Return</span>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
