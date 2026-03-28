import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Search, List, ChevronLeft, ChevronRight } from 'lucide-react';
import type { ConnectionEntry } from '@workspace/api-client-react';
import { formatBytes, cn } from '@/lib/utils';

const HTTP_FRONTEND_PATTERN = /LBS-2Way-UG-frontend/i;

function StatusCodeBadge({ code }: { code?: number }) {
  if (!code) return <span className="text-muted-foreground font-mono">—</span>;

  let colorClass = '';
  let label = String(code);

  if (code >= 200 && code < 300) {
    colorClass = 'bg-green-500/15 text-green-400 border border-green-500/30';
  } else if (code >= 300 && code < 400) {
    colorClass = 'bg-blue-500/15 text-blue-400 border border-blue-500/30';
  } else if (code >= 400 && code < 500) {
    colorClass = 'bg-orange-500/15 text-orange-400 border border-orange-500/30';
  } else if (code >= 500) {
    colorClass = 'bg-red-500/15 text-red-400 border border-red-500/30';
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
    GET:     'text-cyan-400',
    POST:    'text-violet-400',
    PUT:     'text-yellow-400',
    PATCH:   'text-orange-400',
    DELETE:  'text-red-400',
    HEAD:    'text-muted-foreground',
    OPTIONS: 'text-muted-foreground',
  };

  return (
    <span className={cn('font-mono font-bold text-[11px] uppercase', colors[method] ?? 'text-foreground')}>
      {method}
    </span>
  );
}

export function ConnectionsTable({ connections }: { connections: ConnectionEntry[] }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const rowsPerPage = 20;

  // Filter to HTTP traffic only (frontend matches LBS-2Way-UG-frontend pattern)
  const httpConnections = useMemo(
    () => connections.filter(c => c.isHttp && HTTP_FRONTEND_PATTERN.test(c.frontend)),
    [connections]
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return httpConnections;
    const lower = search.toLowerCase();
    return httpConnections.filter(c =>
      c.clientIp.toLowerCase().includes(lower) ||
      (c.httpUrl ?? '').toLowerCase().includes(lower) ||
      (c.httpMethod ?? '').toLowerCase().includes(lower) ||
      String(c.httpStatusCode ?? '').includes(lower)
    );
  }, [httpConnections, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const paginated = filtered.slice((page - 1) * rowsPerPage, page * rowsPerPage);

  const start = (page - 1) * rowsPerPage + (filtered.length > 0 ? 1 : 0);
  const end = Math.min(page * rowsPerPage, filtered.length);

  return (
    <Card>
      <CardHeader className="pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/50">
        <div className="flex items-center gap-3">
          <CardTitle className="flex items-center gap-2">
            <List className="w-5 h-5 text-primary" />
            HTTP Traffic Log
          </CardTitle>
          <span className="text-xs text-muted-foreground bg-muted/40 px-2 py-0.5 rounded font-mono">
            LBS-2Way-UG-frontend · {httpConnections.length} requests
          </span>
        </div>
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search IP, URL, method, status..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full bg-background border border-border rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all font-mono placeholder:font-sans"
          />
        </div>
      </CardHeader>

      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-muted/30 text-muted-foreground border-b border-border/50">
            <tr>
              <th className="px-4 py-3 font-medium uppercase tracking-wider text-[11px] whitespace-nowrap">Timestamp</th>
              <th className="px-4 py-3 font-medium uppercase tracking-wider text-[11px] whitespace-nowrap">Client IP</th>
              <th className="px-4 py-3 font-medium uppercase tracking-wider text-[11px] whitespace-nowrap">Method</th>
              <th className="px-4 py-3 font-medium uppercase tracking-wider text-[11px]">Operation / URL</th>
              <th className="px-4 py-3 font-medium uppercase tracking-wider text-[11px] whitespace-nowrap text-center">Status</th>
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
                <td colSpan={7} className="px-6 py-16 text-center">
                  <p className="text-muted-foreground text-sm">
                    {httpConnections.length === 0
                      ? 'No HTTP traffic found. Upload a log containing LBS-2Way-UG-frontend entries.'
                      : 'No entries match your search.'}
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Pagination */}
        <div className="px-5 py-3 border-t border-border/50 flex items-center justify-between bg-muted/10">
          <div className="text-xs text-muted-foreground">
            Showing{' '}
            <span className="font-medium text-foreground">{start}</span> to{' '}
            <span className="font-medium text-foreground">{end}</span> of{' '}
            <span className="font-medium text-foreground">{filtered.length}</span> HTTP requests
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Page {page} / {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1.5 rounded bg-background border border-border text-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-1.5 rounded bg-background border border-border text-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
