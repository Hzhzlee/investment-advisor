import React from 'react';
import { ScenarioResult, MonteCarloResult } from '../types';
import { Table, ArrowUpRight, CheckCircle2 } from 'lucide-react';

interface SummaryTableProps {
  scenarios: ScenarioResult[];
  monteCarlo: MonteCarloResult | null;
  currency: 'SGD' | 'USD';
  initialAmount: number;
  monthlyContribution: number;
  years: number;
}

export const SummaryTable: React.FC<SummaryTableProps> = ({
  scenarios,
  monteCarlo,
  currency,
  initialAmount,
  monthlyContribution,
  years,
}) => {
  const sym = currency === 'SGD' ? 'S$' : '$';
  const totalContributed = initialAmount + years * 12 * monthlyContribution;

  const formatCurrency = (num: number) => {
    return `${sym}${Math.round(num).toLocaleString()}`;
  };

  const formatPct = (num: number) => {
    return (num * 100).toFixed(2) + '%';
  };

  return (
    <section id="summary" className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 shadow-xl backdrop-blur-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
              10-Year Projections Ledger & Scenario Breakdown
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Exact deterministic and probabilistic terminal portfolio values matching Chart 1.
          </p>
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-400 font-mono">
          <span>Initial: {sym}{initialAmount.toLocaleString()}</span>
          <span aria-hidden="true">·</span>
          <span>Monthly: {sym}{monthlyContribution.toLocaleString()}/mo</span>
          <span aria-hidden="true">·</span>
          <span className="text-slate-300 font-semibold">Total Invested: {sym}{totalContributed.toLocaleString()}</span>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-950/60">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-900/90 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              <th className="py-3 px-4">Projection Model / Scenario</th>
              <th className="py-3 px-4 text-right">CAGR Rate</th>
              <th className="py-3 px-4 text-right">Projected Value (10Y)</th>
              <th className="py-3 px-4 text-right">Total Contributed</th>
              <th className="py-3 px-4 text-right">Total Capital Gain</th>
              <th className="py-3 px-4 text-right">MoIC</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-xs font-mono tabular-nums">
            {scenarios.map((s) => {
              const isBase = s.adjustment === 0;
              const isGainPositive = s.total_gain >= 0;

              return (
                <tr
                  key={s.id}
                  className={`hover:bg-slate-850/50 transition-colors ${
                    isBase ? 'bg-blue-950/20 font-semibold text-white' : 'text-slate-200'
                  }`}
                >
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2 font-sans font-medium">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          s.adjustment > 0
                            ? 'bg-emerald-400'
                            : s.adjustment === 0
                            ? 'bg-blue-500'
                            : 'bg-amber-400'
                        }`}
                      />
                      <span>{s.name}</span>
                      {isBase && (
                        <span className="text-[10px] font-mono text-blue-400 ml-1">
                          (Baseline Anchor)
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right font-medium">
                    {formatPct(s.cagr)}
                  </td>
                  <td className={`py-3 px-4 text-right font-bold ${isBase ? 'text-blue-300 text-sm' : 'text-slate-100'}`}>
                    {formatCurrency(s.final_value)}
                  </td>
                  <td className="py-3 px-4 text-right text-slate-400">
                    {formatCurrency(s.total_contributed)}
                  </td>
                  <td className={`py-3 px-4 text-right font-semibold ${isGainPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {isGainPositive ? `+${formatCurrency(s.total_gain)}` : formatCurrency(s.total_gain)}
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-slate-300">
                    {s.multiple.toFixed(2)}x
                  </td>
                </tr>
              );
            })}

            {/* Monte Carlo Statistical percentiles rows */}
            {monteCarlo && (
              <>
                <tr className="border-t border-slate-700 bg-slate-900/40 text-slate-300">
                  <td className="py-2.5 px-4 font-sans font-medium text-slate-400">
                    <div className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      <span>Monte Carlo 90th Percentile (P90)</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-4 text-right text-slate-500">Stochastic</td>
                  <td className="py-2.5 px-4 text-right font-bold text-emerald-400">
                    {formatCurrency(monteCarlo.p90_final)}
                  </td>
                  <td className="py-2.5 px-4 text-right text-slate-500">{formatCurrency(totalContributed)}</td>
                  <td className="py-2.5 px-4 text-right text-emerald-400 font-semibold">
                    +{formatCurrency(monteCarlo.p90_final - totalContributed)}
                  </td>
                  <td className="py-2.5 px-4 text-right text-slate-300">
                    {(monteCarlo.p90_final / totalContributed).toFixed(2)}x
                  </td>
                </tr>

                <tr className="bg-slate-900/40 text-slate-300">
                  <td className="py-2.5 px-4 font-sans font-medium text-slate-400">
                    <div className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
                      <span>Monte Carlo 50th Percentile (P50 Median)</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-4 text-right text-slate-500">Stochastic</td>
                  <td className="py-2.5 px-4 text-right font-bold text-sky-300">
                    {formatCurrency(monteCarlo.p50_final)}
                  </td>
                  <td className="py-2.5 px-4 text-right text-slate-500">{formatCurrency(totalContributed)}</td>
                  <td className="py-2.5 px-4 text-right text-sky-300 font-semibold">
                    {monteCarlo.p50_final >= totalContributed ? '+' : ''}
                    {formatCurrency(monteCarlo.p50_final - totalContributed)}
                  </td>
                  <td className="py-2.5 px-4 text-right text-slate-300">
                    {(monteCarlo.p50_final / totalContributed).toFixed(2)}x
                  </td>
                </tr>

                <tr className="bg-slate-900/40 text-slate-300">
                  <td className="py-2.5 px-4 font-sans font-medium text-slate-400">
                    <div className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                      <span>Monte Carlo 10th Percentile (P10 Downside)</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-4 text-right text-slate-500">Stochastic</td>
                  <td className="py-2.5 px-4 text-right font-bold text-rose-400">
                    {formatCurrency(monteCarlo.p10_final)}
                  </td>
                  <td className="py-2.5 px-4 text-right text-slate-500">{formatCurrency(totalContributed)}</td>
                  <td className={`py-2.5 px-4 text-right font-semibold ${monteCarlo.p10_final >= totalContributed ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {monteCarlo.p10_final >= totalContributed ? '+' : ''}
                    {formatCurrency(monteCarlo.p10_final - totalContributed)}
                  </td>
                  <td className="py-2.5 px-4 text-right text-slate-300">
                    {(monteCarlo.p10_final / totalContributed).toFixed(2)}x
                  </td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* Assumptions Footer Box */}
      <div className="mt-4 p-3.5 rounded-lg bg-slate-950/80 border border-slate-800 text-xs text-slate-400 space-y-1.5">
        <div className="flex items-center gap-1.5 font-semibold text-slate-200">
          <CheckCircle2 className="h-4 w-4 text-blue-400" />
          <span>Underlying Modeling Assumptions:</span>
        </div>
        <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-400 pl-1">
          <li>
            <strong className="text-slate-300">Monthly Compounding:</strong> Contributions occur at the beginning of each calendar month and compound monthly using effective rate <span className="font-mono text-slate-300">(1 + r)^(1/12) - 1</span>.
          </li>
          <li>
            <strong className="text-slate-300">Relative Adjustments:</strong> Scenario CAGRs are applied relative to the historical base CAGR (e.g. 6.0% base → 4.8% at -20% rel, 7.2% at +20% rel).
          </li>
          <li>
            <strong className="text-slate-300">Monte Carlo Simulation:</strong> 1,000 forward paths modeled via Geometric Brownian Motion using historical monthly log returns mean and variance parameters.
          </li>
        </ul>
      </div>
    </section>
  );
};
