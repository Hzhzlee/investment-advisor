import React, { useState, useEffect } from 'react';
import { mcpClient, McpActivityLog, McpToolDefinition } from '../services/mcpClient';
import {
  Terminal,
  Clock,
  CheckCircle2,
  AlertCircle,
  Code2,
  Copy,
  Check,
  Trash2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Cpu,
} from 'lucide-react';

export const McpActivityPanel: React.FC = () => {
  const [logs, setLogs] = useState<McpActivityLog[]>([]);
  const [showRawJsonRpc, setShowRawJsonRpc] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [copiedLogId, setCopiedLogId] = useState<string | null>(null);
  const [registeredTools, setRegisteredTools] = useState<McpToolDefinition[]>([]);
  const [activeTab, setActiveTab] = useState<'activity' | 'tools'>('activity');

  useEffect(() => {
    const unsubscribe = mcpClient.subscribe((updatedLogs) => {
      setLogs(updatedLogs);
    });

    // Fetch registered tools
    mcpClient.listTools().then((tools) => {
      setRegisteredTools(tools);
    }).catch(() => {
      // Ignored if handled elsewhere
    });

    return () => unsubscribe();
  }, []);

  const toggleExpand = (id: string) => {
    setExpandedLogId(expandedLogId === id ? null : id);
  };

  const handleCopyJson = (log: McpActivityLog) => {
    const payload = {
      request: log.requestPayload,
      response: log.responsePayload || (log.error ? { error: log.error } : null),
    };
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setCopiedLogId(log.id);
    setTimeout(() => setCopiedLogId(null), 2000);
  };

  return (
    <section
      id="mcp-telemetry"
      className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden"
    >
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 bg-slate-50 border-b border-slate-200">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-600">
            <Terminal className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight font-mono">
                MCP Activity Live Console
              </h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-700">
                JSON-RPC 2.0
              </span>
            </div>
            <p className="text-[11px] text-slate-600 mt-0.5">
              Live audit stream of all client-to-server MCP tool invocations through <span className="font-mono text-slate-800 font-semibold">/api/mcp</span>.
            </p>
          </div>
        </div>

        {/* Global Controls */}
        <div className="flex items-center gap-2">
          {/* Tab Switch */}
          <div className="flex items-center p-1 bg-slate-100 rounded-lg border border-slate-200 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('activity')}
              className={`px-2.5 py-1 rounded font-medium transition-all ${
                activeTab === 'activity'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Stream ({logs.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('tools')}
              className={`px-2.5 py-1 rounded font-medium transition-all ${
                activeTab === 'tools'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Registered Tools ({registeredTools.length || 4})
            </button>
          </div>

          {/* Show raw JSON-RPC Toggle */}
          <button
            type="button"
            onClick={() => setShowRawJsonRpc(!showRawJsonRpc)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-medium rounded-lg border transition-all ${
              showRawJsonRpc
                ? 'bg-blue-50 border-blue-300 text-blue-700'
                : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
            title="Toggle raw JSON-RPC 2.0 payloads for all events"
          >
            <Code2 className="h-3.5 w-3.5" />
            <span className="hidden xs:inline">Show raw JSON-RPC</span>
          </button>

          {/* Clear Logs */}
          <button
            type="button"
            onClick={() => mcpClient.clearLogs()}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded border border-transparent hover:border-slate-200 transition-colors"
            title="Clear Activity Log"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Content Body */}
      {activeTab === 'activity' ? (
        <div className="divide-y divide-slate-100 max-h-[480px] overflow-y-auto">
          {logs.length === 0 ? (
            <div className="py-12 text-center text-xs font-mono text-slate-400">
              No MCP events recorded yet. Perform an action above to trigger JSON-RPC tool calls.
            </div>
          ) : (
            logs.map((log) => {
              const isExpanded = showRawJsonRpc || expandedLogId === log.id;
              const isSuccess = log.status === 'success';
              const isPending = log.status === 'pending';

              return (
                <div key={log.id} className="p-3.5 hover:bg-slate-50 transition-colors">
                  <div
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 cursor-pointer select-none"
                    onClick={() => toggleExpand(log.id)}
                  >
                    {/* Left: Method, Tool Name, RPC ID */}
                    <div className="flex items-center gap-2.5">
                      <button type="button" className="text-slate-400">
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>

                      {/* Status indicator */}
                      {isPending ? (
                        <div className="h-2 w-2 rounded-full bg-amber-500 animate-ping" />
                      ) : isSuccess ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                      )}

                      <span className="font-mono text-xs font-bold text-slate-800">
                        {log.method}
                      </span>

                      {log.toolName && (
                        <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-700">
                          {log.toolName}
                        </span>
                      )}

                      <span className="text-[10px] font-mono text-slate-400">
                        id:{log.rpcId}
                      </span>
                    </div>

                    {/* Right: Timestamp & Duration */}
                    <div className="flex items-center gap-3 text-xs font-mono text-slate-600 pl-6 sm:pl-0">
                      <div className="flex items-center gap-1 text-slate-400">
                        <Clock className="h-3 w-3" />
                        <span>{log.timestamp}</span>
                      </div>

                      <span
                        className={`tabular-nums font-semibold ${
                          log.durationMs < 100
                            ? 'text-emerald-700'
                            : log.durationMs < 500
                            ? 'text-blue-700'
                            : 'text-amber-700'
                        }`}
                      >
                        {log.durationMs}ms
                      </span>

                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                          isSuccess
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : isPending
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}
                      >
                        {isSuccess ? '200 OK' : isPending ? 'PENDING' : 'ERR'}
                      </span>
                    </div>
                  </div>

                  {/* Arguments Summary */}
                  {log.args && Object.keys(log.args).length > 0 && !isExpanded && (
                    <div className="mt-2 pl-6 sm:pl-7 text-[11px] font-mono text-slate-600 flex items-center gap-2 overflow-hidden text-ellipsis whitespace-nowrap">
                      <span className="text-slate-400">args:</span>
                      <span className="text-slate-700">
                        {JSON.stringify(log.args).length > 90
                          ? JSON.stringify(log.args).slice(0, 90) + '...'
                          : JSON.stringify(log.args)}
                      </span>
                    </div>
                  )}

                  {/* Error display if any */}
                  {log.error && (
                    <div className="mt-2 pl-6 sm:pl-7 text-xs font-mono text-rose-700 bg-rose-50 border border-rose-200 rounded p-2">
                      {log.error}
                    </div>
                  )}

                  {/* Expanded JSON-RPC Payload Inspector */}
                  {isExpanded && (
                    <div className="mt-3 pl-6 sm:pl-7 pt-2 border-t border-slate-200 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-mono font-semibold text-slate-600">
                          JSON-RPC 2.0 Wire Transaction:
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopyJson(log)}
                          className="flex items-center gap-1 text-[10px] font-mono text-slate-600 hover:text-slate-900 bg-white border border-slate-300 px-2 py-0.5 rounded shadow-xs"
                        >
                          {copiedLogId === log.id ? (
                            <>
                              <Check className="h-3 w-3 text-emerald-600" />
                              <span>Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="h-3 w-3" />
                              <span>Copy JSON</span>
                            </>
                          )}
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] font-mono">
                        {/* Request Box */}
                        <div className="rounded-md bg-slate-900 border border-slate-800 p-2.5 overflow-x-auto text-slate-100">
                          <div className="text-[10px] font-bold text-blue-400 uppercase tracking-wider mb-1">
                            → Client Request Payload
                          </div>
                          <pre className="text-slate-300 whitespace-pre-wrap">
                            {JSON.stringify(log.requestPayload, null, 2)}
                          </pre>
                        </div>

                        {/* Response Box */}
                        <div className="rounded-md bg-slate-900 border border-slate-800 p-2.5 overflow-x-auto text-slate-100">
                          <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider mb-1">
                            ← Server Response Payload
                          </div>
                          <pre className="text-slate-300 whitespace-pre-wrap">
                            {log.responsePayload
                              ? JSON.stringify(log.responsePayload, null, 2)
                              : log.error
                              ? JSON.stringify({ error: log.error }, null, 2)
                              : '// Awaiting server response...'}
                          </pre>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      ) : (
        /* Registered Tools Tab */
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[480px] overflow-y-auto font-mono">
          {registeredTools.map((t) => (
            <div key={t.name} className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <span className="text-xs font-bold text-blue-700">{t.name}</span>
                <span className="text-[10px] text-slate-400 uppercase">MCP Tool</span>
              </div>
              <p className="text-xs text-slate-700 font-sans mt-2">{t.description}</p>
              <div className="mt-3 text-[10px] text-slate-600 bg-white p-2 rounded border border-slate-200">
                <span className="text-slate-400 font-semibold">Input Schema:</span>
                <pre className="mt-1 text-slate-700 whitespace-pre-wrap">
                  {JSON.stringify(t.inputSchema, null, 2)}
                </pre>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Footer Info */}
      <div className="px-5 py-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500 font-mono">
        <span>Stateless HTTP POST /api/mcp</span>
        <span>Protocol: 2024-11-05</span>
      </div>
    </section>
  );
};
