import React, { useMemo, useState, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { RefreshCw, Key, Globe2 } from 'lucide-react';
interface ConnectionEntry {
  timestamp: string;
  apiKey: string;
  sslCn: string;
  httpUrl: string;
  isJsonLog: boolean;
  [key: string]: unknown;
}

// ─── Duration helpers ─────────────────────────────────────────────────────────

type DurationKey = '1h' | '6h' | '12h' | '1d' | '7d' | 'custom';

const DURATION_OPTIONS: { label: string; value: DurationKey; ms: number }[] = [
  { label: 'Last 1 Hour',  value: '1h',  ms: 60 * 60 * 1000 },
  { label: 'Last 6 Hours', value: '6h',  ms: 6 * 60 * 60 * 1000 },
  { label: 'Last 12 Hours',value: '12h', ms: 12 * 60 * 60 * 1000 },
  { label: 'Last 1 Day',   value: '1d',  ms: 24 * 60 * 60 * 1000 },
  { label: 'Last 7 Days',  value: '7d',  ms: 7 * 24 * 60 * 60 * 1000 },
  { label: 'Custom Range', value: 'custom', ms: 0 },
];

function toLocalDateTimeString(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const BAR_COLORS = ['#6366f1','#8b5cf6','#a78bfa','#c4b5fd','#818cf8','#7c3aed','#9333ea','#a855f7','#c026d3','#db2777'];

// ─── Shared filter state type ─────────────────────────────────────────────────

interface FilterState {
  duration: DurationKey;
  customFrom: string;
  customTo: string;
  rev: number;
}

function initFilter(): FilterState {
  const now = new Date();
  const from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return {
    duration: '1d',
    customFrom: toLocalDateTimeString(from),
    customTo: toLocalDateTimeString(now),
    rev: 0,
  };
}

function filterConnections(connections: ConnectionEntry[], filter: FilterState): ConnectionEntry[] {
  const jsonOnly = connections.filter(c => c.isJsonLog);
  const now = Date.now();
  let fromMs: number;
  let toMs: number;

  if (filter.duration === 'custom') {
    fromMs = new Date(filter.customFrom).getTime() || 0;
    toMs   = new Date(filter.customTo).getTime()   || now;
  } else {
    const opt = DURATION_OPTIONS.find(o => o.value === filter.duration);
    fromMs = now - (opt?.ms ?? 24 * 60 * 60 * 1000);
    toMs   = now;
  }

  return jsonOnly.filter(c => {
    const ts = new Date(c.timestamp).getTime();
    return !isNaN(ts) && ts >= fromMs && ts <= toMs;
  });
}

// ─── Duration Picker ──────────────────────────────────────────────────────────

function DurationPicker({ filter, onChange }: {
  filter: FilterState;
  onChange: (f: FilterState) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex gap-1 flex-wrap">
        {DURATION_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => onChange({ ...filter, duration: opt.value })}
            className={`px-2.5 py-1 text-xs rounded-md border transition-colors font-medium
              ${filter.duration === opt.value
                ? 'bg-primary/15 border-primary/50 text-primary'
                : 'bg-card border-border text-muted-foreground hover:bg-accent hover:text-foreground'}`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {filter.duration === 'custom' && (
        <div className="flex items-center gap-2 text-xs">
          <input
            type="datetime-local"
            value={filter.customFrom}
            onChange={e => onChange({ ...filter, customFrom: e.target.value })}
            className="px-2 py-1 rounded-md border border-border bg-muted text-xs"
          />
          <span className="text-muted-foreground">to</span>
          <input
            type="datetime-local"
            value={filter.customTo}
            onChange={e => onChange({ ...filter, customTo: e.target.value })}
            className="px-2 py-1 rounded-md border border-border bg-muted text-xs"
          />
        </div>
      )}
    </div>
  );
}

// ─── Top Consumers ────────────────────────────────────────────────────────────

function TopConsumers({ connections }: { connections: ConnectionEntry[] }) {
  const [filter, setFilter] = useState<FilterState>(initFilter);

  const refresh = useCallback(() => setFilter(f => ({ ...f, rev: f.rev + 1 })), []);

  const rows = useMemo(() => {
    const filtered = filterConnections(connections, filter);
    const map = new Map<string, { apiKey: string; sslCn: string; count: number }>();
    for (const c of filtered) {
      const key = c.apiKey || '(no key)';
      const existing = map.get(key);
      if (existing) {
        existing.count++;
        if (c.sslCn && existing.sslCn === '—') existing.sslCn = c.sslCn;
      } else {
        map.set(key, { apiKey: key, sslCn: c.sslCn || '—', count: 1 });
      }
    }
    return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 10);
  }, [connections, filter]);

  const chartData = rows.map(r => ({
    name: r.apiKey.length > 22 ? r.apiKey.slice(0, 20) + '…' : r.apiKey,
    count: r.count,
    full: r.apiKey,
  }));

  const total = rows.reduce((s, r) => s + r.count, 0);

  return (
    <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <Key size={16} className="text-primary" />
          Top 10 Consumers
          <span className="ml-2 text-xs font-normal text-muted-foreground">{total.toLocaleString()} requests</span>
        </h2>
        <div className="flex items-center gap-2">
          <DurationPicker filter={filter} onChange={setFilter} />
          <button onClick={refresh} title="Refresh"
            className="p-1.5 rounded-md border border-border hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">No data for the selected period.</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-1.5 px-2 text-muted-foreground font-medium">#</th>
                  <th className="text-left py-1.5 px-2 text-muted-foreground font-medium">X-API-Key</th>
                  <th className="text-left py-1.5 px-2 text-muted-foreground font-medium">SSL-CN</th>
                  <th className="text-right py-1.5 px-2 text-muted-foreground font-medium">Count</th>
                  <th className="text-right py-1.5 px-2 text-muted-foreground font-medium">Share</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.apiKey} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="py-1.5 px-2 text-muted-foreground">{i + 1}</td>
                    <td className="py-1.5 px-2 font-mono max-w-[180px] truncate" title={r.apiKey}>
                      <span style={{ color: BAR_COLORS[i % BAR_COLORS.length] }}>{r.apiKey}</span>
                    </td>
                    <td className="py-1.5 px-2 text-muted-foreground max-w-[120px] truncate">{r.sslCn}</td>
                    <td className="py-1.5 px-2 text-right font-semibold tabular-nums">{r.count.toLocaleString()}</td>
                    <td className="py-1.5 px-2 text-right text-muted-foreground tabular-nums">
                      {total > 0 ? ((r.count / total) * 100).toFixed(1) : 0}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Chart */}
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 20, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} tickLine={false}
                  tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(1)}k` : String(v)} />
                <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 10 }}
                  tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                  formatter={(val: number) => [val.toLocaleString(), 'Requests']}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.full ?? ''}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={20}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Top APIs ─────────────────────────────────────────────────────────────────

function TopApis({ connections }: { connections: ConnectionEntry[] }) {
  const [filter, setFilter] = useState<FilterState>(initFilter);

  const refresh = useCallback(() => setFilter(f => ({ ...f, rev: f.rev + 1 })), []);

  const rows = useMemo(() => {
    const filtered = filterConnections(connections, filter);
    const map = new Map<string, number>();
    for (const c of filtered) {
      const url = c.httpUrl || '(unknown)';
      map.set(url, (map.get(url) ?? 0) + 1);
    }
    return [...map.entries()]
      .map(([url, count]) => ({ url, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [connections, filter]);

  const chartData = rows.map(r => ({
    name: r.url.length > 30 ? '…' + r.url.slice(-28) : r.url,
    count: r.count,
    full: r.url,
  }));

  const total = rows.reduce((s, r) => s + r.count, 0);

  return (
    <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <Globe2 size={16} className="text-primary" />
          Top 10 APIs
          <span className="ml-2 text-xs font-normal text-muted-foreground">{total.toLocaleString()} requests</span>
        </h2>
        <div className="flex items-center gap-2">
          <DurationPicker filter={filter} onChange={setFilter} />
          <button onClick={refresh} title="Refresh"
            className="p-1.5 rounded-md border border-border hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">No data for the selected period.</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-1.5 px-2 text-muted-foreground font-medium">#</th>
                  <th className="text-left py-1.5 px-2 text-muted-foreground font-medium">URL / Endpoint</th>
                  <th className="text-right py-1.5 px-2 text-muted-foreground font-medium">Count</th>
                  <th className="text-right py-1.5 px-2 text-muted-foreground font-medium">Share</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.url} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="py-1.5 px-2 text-muted-foreground">{i + 1}</td>
                    <td className="py-1.5 px-2 font-mono max-w-[240px] truncate" title={r.url}>
                      <span style={{ color: BAR_COLORS[i % BAR_COLORS.length] }}>{r.url}</span>
                    </td>
                    <td className="py-1.5 px-2 text-right font-semibold tabular-nums">{r.count.toLocaleString()}</td>
                    <td className="py-1.5 px-2 text-right text-muted-foreground tabular-nums">
                      {total > 0 ? ((r.count / total) * 100).toFixed(1) : 0}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Chart */}
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 20, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} tickLine={false}
                  tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(1)}k` : String(v)} />
                <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 10 }}
                  tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                  formatter={(val: number) => [val.toLocaleString(), 'Requests']}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.full ?? ''}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={20}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Export ───────────────────────────────────────────────────────────────────

export function TopStats({ connections }: { connections: ConnectionEntry[] }) {
  return (
    <div className="space-y-4">
      <TopConsumers connections={connections} />
      <TopApis connections={connections} />
    </div>
  );
}
