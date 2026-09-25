import React, { useState, useRef } from 'react';
import { BENCHMARKS, parseCSVToPrices } from '../data/benchmarks';
import { PricePoint } from '../types';
import { UploadCloud, X, FileText, CheckCircle2, AlertCircle, Download } from 'lucide-react';

interface CsvUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDataLoaded: (prices: PricePoint[], tickerName: string, source: 'csv' | 'benchmark') => void;
}

export const CsvUploadModal: React.FC<CsvUploadModalProps> = ({
  isOpen,
  onClose,
  onDataLoaded,
}) => {
  const [dragOver, setDragOver] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [customTicker, setCustomTicker] = useState('CUSTOM_ETF');
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFile = (file: File) => {
    setErrorMsg(null);
    if (!file.name.endsWith('.csv') && !file.type.includes('csv') && !file.type.includes('text')) {
      setErrorMsg('Please upload a valid .csv formatted file.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) {
        setErrorMsg('Uploaded file is empty.');
        return;
      }

      const points = parseCSVToPrices(text);
      if (points.length < 2) {
        setErrorMsg('Could not parse valid Date and Close values. Ensure CSV has "Date,Close" header format with numeric closing prices.');
        return;
      }

      onDataLoaded(points, customTicker.toUpperCase() || 'UPLOADED_ETF', 'csv');
      onClose();
    };
    reader.onerror = () => {
      setErrorMsg('Failed to read file from disk.');
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleLoadBenchmark = (key: string) => {
    const bm = BENCHMARKS[key];
    if (!bm) return;
    const points = parseCSVToPrices(bm.csvData);
    onDataLoaded(points, bm.symbol, 'benchmark');
    onClose();
  };

  const handleDownloadTemplate = () => {
    const templateContent = `Date,Close\n2022-01-01,100.00\n2022-02-01,102.50\n2022-03-01,101.20\n2022-04-01,104.80\n2022-05-01,106.10\n2022-06-01,105.40\n2022-07-01,108.90\n2022-08-01,110.20\n2022-09-01,107.50\n2022-10-01,112.00\n2022-11-01,115.30\n2022-12-01,114.70\n2023-01-01,118.00\n2023-02-01,120.40\n2023-03-01,122.10`;
    const blob = new Blob([templateContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'sample_etf_prices.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl rounded-xl border border-slate-200 bg-white p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
              <UploadCloud className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">CSV Data Upload Fallback</h3>
              <p className="text-xs text-slate-500">
                Run MCP analytics and projections on verified historical price files.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="mt-4 flex items-center gap-2 p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Ticker Name Input */}
        <div className="mt-4">
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Series Ticker / Label:
          </label>
          <input
            type="text"
            value={customTicker}
            onChange={(e) => setCustomTicker(e.target.value.toUpperCase())}
            placeholder="e.g. PORTFOLIO_A"
            className="w-full h-8 px-3 text-xs font-mono bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-blue-500 shadow-xs"
          />
        </div>

        {/* Drop Zone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`mt-4 flex flex-col items-center justify-center p-8 rounded-xl border-2 border-dashed transition-all cursor-pointer ${
            dragOver
              ? 'border-blue-500 bg-blue-50'
              : 'border-slate-300 bg-slate-50 hover:border-slate-400 hover:bg-slate-100'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                handleFile(e.target.files[0]);
              }
            }}
            className="hidden"
          />
          <UploadCloud className="h-9 w-9 text-slate-400 mb-2" />
          <p className="text-sm font-medium text-slate-800">
            Drag & drop your CSV file here, or <span className="text-blue-600 underline">browse</span>
          </p>
          <p className="text-xs text-slate-500 mt-1 font-mono">
            Required columns: Date, Close (monthly closing values)
          </p>
        </div>

        {/* Quick Verified Benchmarks */}
        <div className="mt-5">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Or Load Verified Exchange Benchmark Data (10Y):
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {Object.values(BENCHMARKS).map((bm) => (
              <button
                key={bm.symbol}
                type="button"
                onClick={() => handleLoadBenchmark(bm.symbol)}
                className="flex flex-col text-left p-2.5 rounded-lg bg-slate-50 border border-slate-200 hover:border-blue-500 hover:bg-blue-50/50 transition-all group"
              >
                <span className="text-xs font-mono font-bold text-slate-900 group-hover:text-blue-600">
                  {bm.symbol}
                </span>
                <span className="text-[11px] text-slate-500 truncate mt-0.5">
                  {bm.name}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Actions Footer */}
        <div className="mt-6 pt-4 border-t border-slate-200 flex items-center justify-between">
          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Download CSV Template</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
