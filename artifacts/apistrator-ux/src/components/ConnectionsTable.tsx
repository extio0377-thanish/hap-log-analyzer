import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Search, List, ChevronLeft, ChevronRight, RefreshCw, Key, Filter, X } from 'lucide-react';
import type { ConnectionEntry } from '@workspace/api-client-react';
import { formatBytes, cn } from '@/lib/utils';

function StatusCodeBadge({ code }: { code?: number }) {
  if (!code) return <span className="text-muted-foreground font-mono">—</span>;

  let colorClass = '';
  const label = String(code);

  if (code >= 200 && code < 300) {
    colorClass = 'bg-green-500/20 text-green-700 border border-green-500/40';
  } else if (code >= 300 && code < 400) {
    colorClass = 'bg-blue-500/20 text-blue-700 border border-blue-500/40';
  } else if (code >= 400 && code < 500) {
    colorClass = 'bg-orange-500/20 text-orange-700 border border-orange-500/40';
  } else if (code >= 500) {
    colorClass = 'bg-red-500/20 text-red-700 border border-red-500/40';
  } else {
    colorClass = 'bg-muted text-muted-foreground border border-border';
  }

  return (
    <span className={cn('inline-block font-mono text-[11px] font-bold px-2 py-0.5 rounded', colorClass)}>
      {label}
    </span>
  );
}

function MethodBadge({ method }: { method?: string }) {
  if (!method) return <span className="text-muted-foreground">—</span>;

  const colors: Record<string, string> = {
    GET:     'bg-cyan-500/20 text-cyan-700 border border-cyan-500/40',
    POST:    'bg-violet-500/20 text-violet-700 border border-violet-500/40',
    PUT:     'bg-yellow-500/20 text-yellow-700 border border-yellow-500/40',
    PATCH:   'bg-orange-500/20 text-orange-700 border border-orange-500/40',
    DELETE:  'bg-red-500/20 text-red-700 border border-red-500/40',
    HEAD:    'bg-muted text-muted-foreground border border-border',
    OPTIONS: 'bg-muted text-muted-foreground border border-border',
  };

  return (
    <span className={cn('inline-block font-mono font-bold text-[11px] uppercase px-2 py-0.5 rounded', colors[method] ?? 'bg-muted text-foreground border border-border')}>
      {method}
    </span>
  );
}

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

interface Filters {
  clientIp: string;
  apiKey: string;
  url: string;
  statusCode: string;
}

const emptyFilters: Filters = { clientIp: '', apiKey: '', url: '', statusCode: '' };

interface ConnectionsTableProps {
  connections: ConnectionEntry[];
  onRefresh: () => void;
}

export function ConnectionsTable({ connections, onRefresh }: ConnectionsTableProps) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [refreshing, setRefreshing] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Filters>(emptyFilters);

  const httpConnections = useMemo(
    () => [...(connections ?? []).filter(c => c.isJsonLog === true)].reverse(),
    [connections]
  );

  const hasActiveFilters = Object.values(filters).some(v => v.trim() !== '') || search.trim() !== '';

  const filtered = useMemo(() => {
    let result = httpConnections;

    // Global search
    if (search.trim()) {
      const lower = search.toLowerCase();
      result = result.filter(c =>
        c.clientIp.toLowerCase().includes(lower) ||
        (c.httpUrl ?? '').toLowerCase().includes(lower) ||
        (c.httpMethod ?? '').toLowerCase().includes(lower) ||
        String(c.httpStatusCode ?? '').includes(lower) ||
        (c.apiKey ?? '').toLowerCase().includes(lower) ||
        (c.sslCn ?? '').toLowerCase().includes(lower)
      );
    }

    // Specific filters
    if (filters.clientIp.trim()) {
      const v = filters.clientIp.trim().toLowerCase();
      result = result.filter(c => c.clientIp.toLowerCase().includes(v));
    }
    if (filters.apiKey.trim()) {
      const v = filters.apiKey.trim().toLowerCase();
      result = result.filter(c => (c.apiKey ?? '').toLowerCase().includes(v));
    }
    if (filters.url.trim()) {
      const v = filters.url.trim().toLowerCase();
      result = result.filter(c => (c.httpUrl ?? '').toLowerCase().includes(v));
    }
    if (filters.statusCode.trim()) {
      const v = filters.statusCode.trim();
      result = result.filter(c => String(c.httpStatusCode ?? '').startsWith(v));
    }

    return result;
  }, [httpConnections, search, filters]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const start = (safePage - 1) * pageSize + (filtered.length > 0 ? 1 : 0);
  const end = Math.min(safePage * pageSize, filtered.length);

  const resetPage = () => setPage(1);

  const handleRefresh = async () => {
    setRefreshing(true);
    await onRefresh();
    resetPage();
    setTimeout(() => setRefreshing(false), 600);
  };

  const clearFilters = () => {
    setFilters(emptyFilters);
    setSearch('');
    resetPage();
  };

  const setFilter = (key: keyof Filters, value: string) => {
    setFilters(f => ({ ...f, [key]: value }));
    resetPage();
  };

  return (
    <Card>
      <CardHeader className="pb-0 border-b border-border/50">
        {/* Top bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4">
          <div className="flex items-center gap-3">
            <CardTitle className="flex items-center gap-2">
              <List className="w-5 h-5 text-primary" />
              Live Traffic
            </CardTitle>
            <span className="text-xs text-muted-foreground bg-muted/40 px-2 py-0.5 rounded font-mono">
              {filtered.length} / {httpConnections.length}
            </span>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors text-xs font-medium disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative w-full sm:w-56">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Quick search…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); resetPage(); }}
                className="w-full bg-background border border-border rounded-lg pl-9 pr-4 py-1.5 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all"
              />
            </div>

            {/* Filter toggle */}
            <button
              onClick={() => setShowFilters(v => !v)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors whitespace-nowrap',
                showFilters || hasActiveFilters
                  ? 'bg-primary/10 border-primary/30 text-primary'
                  : 'bg-card border-border text-muted-foreground hover:text-foreground hover:bg-accent'
              )}
            >
              <Filter className="w-3.5 h-3.5" />
              Filters
              {hasActiveFilters && (
                <span className="ml-1 h-4 min-w-4 text-[10px] font-bold bg-primary text-primary-foreground rounded-full flex items-center justify-center px-1">
                  {[search, filters.clientIp, filters.apiKey, filters.url, filters.statusCode].filter(v => v.trim()).length}
                </span>
              )}
            </button>

            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors border border-border"
                title="Clear all filters"
              >
                <X className="w-3.5 h-3.5" /> Clear
              </button>
            )}
          </div>
        </div>

        {/* Expandable filter panel */}
        {showFilters && (
          <div className="pb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Client IP</label>
              <input
                type="text"
                placeholder="e.g. 192.168.1"
                value={filters.clientIp}
                onChange={e => setFilter('clientIp', e.target.value)}
                className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                <span className="flex items-center gap-1"><Key className="w-3 h-3" /> X-API-Key</span>
              </label>
              <input
                type="text"
                placeholder="Partial key value…"
                value={filters.apiKey}
                onChange={e => setFilter('apiKey', e.target.value)}
                className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">URL contains</label>
              <input
                type="text"
                placeholder="e.g. /api/v1"
                value={filters.url}
                onChange={e => setFilter('url', e.target.value)}
                className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Status code</label>
              <input
                type="text"
                placeholder="e.g. 200, 4, 50"
                value={filters.statusCode}
                onChange={e => setFilter('statusCode', e.target.value)}
                className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all"
              />
              <p className="text-[10px] text-muted-foreground">Prefix match — "4" matches all 4xx</p>
            </div>
          </div>
        )}
      </CardHeader>

      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-muted/30 text-muted-foreground border-b border-border/50">
            <tr>
              <th className="px-4 py-3 font-medium uppercase tracking-wider text-[11px] whitespace-nowrap">Timestamp</th>
              <th className="px-4 py-3 font-medium uppercase tracking-wider text-[11px] whitespace-nowrap">Client IP</th>
              <th className="px-4 py-3 font-medium uppercase tracking-wider text-[11px] whitespace-nowrap">Method</th>
              <th className="px-4 py-3 font-medium uppercase tracking-wider text-[11px]">URL</th>
              <th className="px-4 py-3 font-medium uppercase tracking-wider text-[11px] whitespace-nowrap text-center">Status</th>
              <th className="px-4 py-3 font-medium uppercase tracking-wider text-[11px] whitespace-nowrap">
                <span className="flex items-center gap-1"><Key className="w-3 h-3" />X-API-Key</span>
              </th>
              <th className="px-4 py-3 font-medium uppercase tracking-wider text-[11px] whitespace-nowrap">SSL-CN</th>
              <th className="px-4 py-3 font-medium uppercase tracking-wider text-[11px] whitespace-nowrap text-right">Duration</th>
              <th className="px-4 py-3 font-medium uppercase tracking-wider text-[11px] whitespace-nowrap text-right">Bytes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {paginated.map((conn, i) => (
              <tr key={i} className="hover:bg-muted/20 transition-colors text-xs group">
                <td className="px-4 py-2.5 text-muted-foreground font-mono whitespace-nowrap">
                  {conn.timestamp.slice(0, 23)}
                </td>
                <td className="px-4 py-2.5 text-primary/90 font-mono font-medium whitespace-nowrap">
                  {conn.clientIp}
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap">
                  <MethodBadge method={conn.httpMethod} />
                </td>
                <td className="px-4 py-2.5 font-mono text-foreground/80 max-w-[420px] truncate" title={conn.httpUrl ?? ''}>
                  {conn.httpUrl ?? '—'}
                </td>
                <td className="px-4 py-2.5 text-center whitespace-nowrap">
                  <StatusCodeBadge code={conn.httpStatusCode} />
                </td>
                <td className="px-4 py-2.5 font-mono whitespace-nowrap max-w-[160px]">
                  {conn.apiKey ? (
                    <span
                      className="bg-amber-500/20 text-amber-700 border border-amber-500/40 text-[10px] px-1.5 py-0.5 rounded truncate block"
                      title={conn.apiKey}
                    >
                      {conn.apiKey}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap max-w-[140px]">
                  {conn.sslCn ? (
                    <span
                      className="bg-emerald-500/20 text-emerald-700 border border-emerald-500/40 font-mono text-[10px] px-1.5 py-0.5 rounded truncate block"
                      title={conn.sslCn}
                    >
                      {conn.sslCn}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right font-mono whitespace-nowrap text-muted-foreground">
                  {conn.responseTimeMs >= 1000
                    ? `${(conn.responseTimeMs / 1000).toFixed(1)}s`
                    : `${conn.responseTimeMs}ms`}
                </td>
                <td className="px-4 py-2.5 text-right font-mono whitespace-nowrap text-muted-foreground">
                  {formatBytes(conn.bytesTransferred)}
                </td>
              </tr>
            ))}
            {paginated.length === 0 && (
              <tr>
                <td colSpan={9} className="px-6 py-16 text-center">
                  <p className="text-muted-foreground text-sm">
                    {httpConnections.length === 0
                      ? 'No HTTP traffic found in the current log.'
                      : 'No entries match your filters.'}
                  </p>
                  {hasActiveFilters && httpConnections.length > 0 && (
                    <button
                      onClick={clearFilters}
                      className="mt-3 text-xs text-primary hover:underline"
                    >
                      Clear all filters
                    </button>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Pagination bar */}
        <div className="px-4 py-3 border-t border-border/50 flex flex-wrap items-center justify-between gap-3 bg-muted/10">
          <div className="text-xs text-muted-foreground">
            Showing{' '}
            <span className="font-medium text-foreground">{start}</span>–<span className="font-medium text-foreground">{end}</span>{' '}
            of <span className="font-medium text-foreground">{filtered.length}</span> requests
            {filtered.length !== httpConnections.length && (
              <span className="ml-1 text-muted-foreground">(filtered from {httpConnections.length})</span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Page size */}
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>Rows</span>
              <select
                value={pageSize}
                onChange={e => { setPageSize(Number(e.target.value)); resetPage(); }}
                className="bg-background border border-border rounded px-1.5 py-1 text-xs text-foreground focus:outline-none focus:border-primary cursor-pointer"
              >
                {PAGE_SIZE_OPTIONS.map(n => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>

            {/* Page nav */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Page {safePage} / {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={safePage === 1}
                className="p-1.5 rounded bg-background border border-border text-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
                className="p-1.5 rounded bg-background border border-border text-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
