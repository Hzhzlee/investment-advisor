import React from 'react';
import { Activity, UploadCloud, Server, Target, LineChart } from 'lucide-react';

interface HeaderProps {
  onOpenCsvUpload: () => void;
  onScrollToMcp: () => void;
  mcpStatus: 'connected' | 'connecting' | 'error';
  currency: 'SGD' | 'USD';
  onToggleCurrency: () => void;
  viewMode: 'goal_allocation' | 'single_etf';
  onToggleViewMode: (mode: 'goal_allocation' | 'single_etf') => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenCsvUpload,
  onScrollToMcp,
  mcpStatus,
  currency,
  onToggleCurrency,
  viewMode,
  onToggleViewMode,
}) => {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200 bg-white/95 backdrop-blur-md shadow-xs">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Zone 1: Single text element brand wordmark */}
        <div className="flex items-center gap-3">
          <a
            href="/"
            className="font-display text-xl font-extrabold tracking-tight text-slate-900 hover:text-blue-600 transition-colors"
          >
            My Financial Guru
          </a>
          <span className="hidden sm:inline-block text-xs font-mono text-slate-500 uppercase tracking-wider">
            Singapore Goal Allocation
          </span>
        </div>

        {/* Zone 2: Navigation & Mode Switcher */}
        <div className="flex items-center gap-2">
          <div className="flex items-center p-1 bg-slate-100 rounded-lg border border-slate-200 text-xs font-medium">
            <button
              type="button"
              onClick={() => onToggleViewMode('goal_allocation')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${
                viewMode === 'goal_allocation'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Target className="h-3.5 w-3.5" />
              <span>Goal Illustrator</span>
            </button>
            <button
              type="button"
              onClick={() => onToggleViewMode('single_etf')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${
                viewMode === 'single_etf'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LineChart className="h-3.5 w-3.5" />
              <span>Single ETF Horizon</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onScrollToMcp}
            className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-slate-600 hover:text-slate-900 transition-colors"
          >
            <Activity className="h-3.5 w-3.5 text-blue-600" />
            <span>MCP Activity</span>
          </button>
        </div>

        {/* Zone 3: Primary Actions */}
        <div className="flex items-center gap-2">
          {/* Currency Toggle */}
          <button
            type="button"
            onClick={onToggleCurrency}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-mono font-medium rounded border border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-slate-100 transition-colors whitespace-nowrap"
            title="Toggle Base Currency Display"
          >
            <span className="text-slate-500">Base:</span>
            <span className="text-blue-600 font-semibold">{currency === 'SGD' ? 'S$ (SGD)' : '$ (USD)'}</span>
          </button>

          {/* CSV Fallback Button */}
          <button
            type="button"
            onClick={onOpenCsvUpload}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded hover:bg-slate-50 hover:text-slate-900 transition-colors whitespace-nowrap shadow-xs"
          >
            <UploadCloud className="h-3.5 w-3.5 text-blue-600" />
            <span>CSV Fallback</span>
          </button>

          {/* MCP Server Status indicator */}
          <button
            type="button"
            onClick={onScrollToMcp}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-mono font-medium rounded border border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-slate-100 transition-colors whitespace-nowrap"
            title="Inspect Model Context Protocol server activity"
          >
            <span className="relative flex h-2 w-2">
              {mcpStatus === 'connected' && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              )}
              <span
                className={`relative inline-flex rounded-full h-2 w-2 ${
                  mcpStatus === 'connected'
                    ? 'bg-emerald-500'
                    : mcpStatus === 'connecting'
                    ? 'bg-amber-500 animate-pulse'
                    : 'bg-rose-500'
                }`}
              />
            </span>
            <Server className="h-3.5 w-3.5 text-slate-500 hidden xs:inline" />
            <span className="hidden sm:inline text-slate-700">MCP JSON-RPC</span>
          </button>
        </div>
      </div>
    </header>
  );
};
