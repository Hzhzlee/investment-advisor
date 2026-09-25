import React from 'react';
import { ShieldCheck, Info, AlertTriangle } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="w-full border-t border-slate-200 bg-white py-8 mt-12 text-xs text-slate-500">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-4">
        {/* Regulatory & Methodology Disclaimer */}
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-slate-600">
          <div className="flex items-center gap-2 text-slate-900 font-semibold">
            <Info className="h-4 w-4 text-blue-600 shrink-0" />
            <span>Singapore Regulatory & Educational Notice (Non-Advisory)</span>
          </div>
          <p className="leading-relaxed">
            This application is an educational simulation and asset allocation illustration tool designed for basic investors in Singapore. It does not provide personalized financial advice, wealth advisory services, or recommendations under the Monetary Authority of Singapore (MAS) Financial Advisers Act. Cash and government-backed (T-bills / SSB) rates are user-editable assumptions. All market ETF projections use dividend-adjusted historical closing prices (total return). Actual forward outcomes may differ materially from bootstrap simulations.
          </p>
        </div>

        {/* System & Architecture Info */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-slate-500 font-mono text-[11px] pt-1">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-3.5 w-3.5 text-slate-500" />
            <span>My Financial Guru · 6-Month Block Bootstrap Simulation · Stateless MCP Serverless Protocol</span>
          </div>

          <div className="flex items-center gap-4">
            <span>Serverless Endpoint: /api/mcp</span>
            <span>Yahoo Finance Total Return (Dividends Reinvested)</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
