import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Search, List, ChevronLeft, ChevronRight } from 'lucide-react';
import type { ConnectionEntry } from '@workspace/api-client-react';
import { formatBytes, cn } from '@/lib/utils';

export function ConnectionsTable({ connections }: { connections: ConnectionEntry[] }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const rowsPerPage = 20;

  const filtered = useMemo(() => {
    if (!search.trim()) return connections;
    const lower = search.toLowerCase();
    return connections.filter(c => 
      c.clientIp.toLowerCase().includes(lower) ||
      c.backend.toLowerCase().includes(lower) ||
      c.server.toLowerCase().includes(lower) ||
      c.frontend.toLowerCase().includes(lower) ||
      c.terminationState.toLowerCase().includes(lower)
    );
  }, [connections, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const paginated = filtered.slice((page - 1) * rowsPerPage, page * rowsPerPage);

  const getTerminationColor = (state: string) => {
    if (state.includes('----')) return 'success';
    if (state.includes('c') || state.includes('s') || state.includes('C') || state.includes('S')) return 'destructive';
    return 'outline';
  };

  return (
    <Card>
      <CardHeader className="pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/50">
        <CardTitle className="flex items-center gap-2">
          <List className="w-5 h-5 text-primary" />
          Raw Connections log
        </CardTitle>
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input 
            type="text" 
            placeholder="Search IP, backend, state..." 
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full bg-background border border-border rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all font-mono placeholder:font-sans"
          />
        </div>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-left whitespace-nowrap">
          <thead className="bg-muted/30 text-muted-foreground border-b border-border/50">
            <tr>
              <th className="px-5 py-3 font-medium uppercase tracking-wider text-[11px]">Timestamp</th>
              <th className="px-5 py-3 font-medium uppercase tracking-wider text-[11px]">Client IP</th>
              <th className="px-5 py-3 font-medium uppercase tracking-wider text-[11px]">Frontend</th>
              <th className="px-5 py-3 font-medium uppercase tracking-wider text-[11px]">Backend</th>
              <th className="px-5 py-3 font-medium uppercase tracking-wider text-[11px]">Server</th>
              <th className="px-5 py-3 font-medium uppercase tracking-wider text-[11px] text-right">Time</th>
              <th className="px-5 py-3 font-medium uppercase tracking-wider text-[11px] text-right">Bytes</th>
              <th className="px-5 py-3 font-medium uppercase tracking-wider text-[11px]">State</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {paginated.map((conn, i) => (
              <tr key={i} className="hover:bg-muted/20 transition-colors font-mono text-xs">
                <td className="px-5 py-2.5 text-muted-foreground">{conn.timestamp}</td>
                <td className="px-5 py-2.5 text-primary/90 font-medium">{conn.clientIp}</td>
                <td className="px-5 py-2.5">{conn.frontend}</td>
                <td className="px-5 py-2.5">{conn.backend}</td>
                <td className="px-5 py-2.5">{conn.server}</td>
                <td className="px-5 py-2.5 text-right">{conn.responseTimeMs}ms</td>
                <td className="px-5 py-2.5 text-right text-muted-foreground">{formatBytes(conn.bytesTransferred)}</td>
                <td className="px-5 py-2.5">
                  <Badge variant={getTerminationColor(conn.terminationState)} className="font-mono text-[10px] px-1.5 py-0">
                    {conn.terminationState}
                  </Badge>
                </td>
              </tr>
            ))}
            {paginated.length === 0 && (
              <tr>
                <td colSpan={8} className="px-6 py-12 text-center text-muted-foreground">
                  No connections found matching your search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        
        {/* Pagination */}
        <div className="px-5 py-3 border-t border-border/50 flex items-center justify-between bg-muted/10">
          <div className="text-xs text-muted-foreground">
            Showing <span className="font-medium text-foreground">{(page - 1) * rowsPerPage + (filtered.length > 0 ? 1 : 0)}</span> to <span className="font-medium text-foreground">{Math.min(page * rowsPerPage, filtered.length)}</span> of <span className="font-medium text-foreground">{filtered.length}</span> results
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1.5 rounded bg-background border border-border text-foreground hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-1.5 rounded bg-background border border-border text-foreground hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
