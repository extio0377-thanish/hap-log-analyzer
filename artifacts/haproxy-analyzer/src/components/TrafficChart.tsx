import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Brush,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Activity, TrendingUp, TrendingDown } from 'lucide-react';
import type { ConnectionEntry } from '@workspace/api-client-react';

/* ── colours ─────────────────────────────────────────────────────────────── */
const STATUS_COLORS = {
  s2xx:  '#22c55e', // green   — success
  s4xx:  '#ef4444', // red     — client errors
  s5xx:  '#f97316', // orange  — server errors
  other: '#6b7280', // grey    — 1xx / 3xx / unknown
} as const;

type StatusKey = keyof typeof STATUS_COLORS;

const STATUS_LABELS: Record<StatusKey, string> = {
  s2xx:  '2xx Success',
  s4xx:  '4xx Client Err',
  s5xx:  '5xx Server Err',
  other: 'Other',
};

const ALL_KEYS: StatusKey[] = ['s2xx', 's4xx', 's5xx', 'other'];

/* ── bucketing ────────────────────────────────────────────────────────────── */
interface StatusBucket {
  time:  string;
  label: string; // full date+time for tooltip
  s2xx:  number;
  s4xx:  number;
  s5xx:  number;
  other: number;
}

function classify(code?: number): StatusKey {
  if (!code)       return 'other';
  if (code < 300)  return 's2xx';
  if (code < 400)  return 'other'; // 3xx → other
  if (code < 500)  return 's4xx';
  if (code < 600)  return 's5xx';
  return 'other';
}

function buildBuckets(connections: ConnectionEntry[]): StatusBucket[] {
  const jsonConns = (connections ?? []).filter(c => c.isJsonLog);
  if (jsonConns.length === 0) return [];

  const map = new Map<string, StatusBucket>();

  for (const c of jsonConns) {
    let sortKey = '0000-00-00 00:00';
    let label   = '—';

    try {
      const ts = c.timestamp ?? '';
      // ISO: "2026-03-29T09:43:46.676065+03:00"
      const [datePart, rest] = ts.includes('T') ? ts.split('T') : ['', ts];
      const timeMin = rest.substring(0, 5); // "09:43"
      // bucket key sortable: "YYYY-MM-DD HH:MM"
      sortKey = `${datePart} ${timeMin}`;
      // display label on axis: "03/29 09:43"
      const [yyyy, mm, dd] = datePart.split('-');
      label = `${mm}/${dd} ${timeMin}`;
    } catch { /* keep defaults */ }

    if (!map.has(sortKey)) {
      map.set(sortKey, { time: label, label, s2xx: 0, s4xx: 0, s5xx: 0, other: 0 });
    }
    map.get(sortKey)![classify(c.httpStatusCode)]++;
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => v);
}

/* ── stats summary ────────────────────────────────────────────────────────── */
interface Stats {
  total:       number;
  successRate: number; // 0-100
  errorRate:   number; // 0-100 (4xx+5xx)
  success:     number;
  errors:      number;
}

function computeStats(connections: ConnectionEntry[]): Stats {
  const jsonConns = (connections ?? []).filter(c => c.isJsonLog);
  const total   = jsonConns.length;
  if (total === 0) return { total: 0, successRate: 0, errorRate: 0, success: 0, errors: 0 };
  const success = jsonConns.filter(c => (c.httpStatusCode ?? 0) >= 200 && (c.httpStatusCode ?? 0) < 300).length;
  const errors  = jsonConns.filter(c => (c.httpStatusCode ?? 0) >= 400).length;
  return {
    total,
    success,
    errors,
    successRate: (success / total) * 100,
    errorRate:   (errors  / total) * 100,
  };
}

/* ── tooltip ──────────────────────────────────────────────────────────────── */
interface TooltipProps {
  active?:  boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?:   string;
}

function CustomTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const entries = payload.filter(p => p.value > 0).sort((a, b) => b.value - a.value);
  if (entries.length === 0) return null;
  const total = entries.reduce((s, e) => s + e.value, 0);
  return (
    <div className="bg-card border border-border rounded-lg shadow-xl p-3 text-xs min-w-[190px]">
      <p className="font-mono text-muted-foreground mb-2 pb-1.5 border-b border-border">{label}</p>
      {entries.map(e => (
        <div key={e.name} className="flex items-center justify-between gap-4 py-[3px]">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: e.color }} />
            <span className="text-foreground/90">{STATUS_LABELS[e.name as StatusKey] ?? e.name}</span>
          </span>
          <span className="flex items-center gap-1.5 font-bold tabular-nums" style={{ color: e.color }}>
            {e.value}
            <span className="text-muted-foreground font-normal">
              ({((e.value / total) * 100).toFixed(0)}%)
            </span>
          </span>
        </div>
      ))}
      <div className="mt-1.5 pt-1.5 border-t border-border flex justify-between text-muted-foreground">
        <span>Total</span>
        <span className="font-bold text-foreground">{total}</span>
      </div>
    </div>
  );
}

/* ── main component ───────────────────────────────────────────────────────── */
export function TrafficChart({ connections }: { connections: ConnectionEntry[] }) {
  // Internal tick every 5 s to keep chart refreshing even without new SSE events
  const [tick, setTick] = useState(0);
  const connectionsRef = useRef(connections);
  connectionsRef.current = connections;

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 5000);
    return () => clearInterval(id);
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const data  = useMemo(() => buildBuckets(connectionsRef.current), [connections, tick]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stats = useMemo(() => computeStats(connectionsRef.current),  [connections, tick]);

  const activeKeys = useMemo(
    () => ALL_KEYS.filter(k => data.some(d => d[k] > 0)),
    [data],
  );

  /* empty state */
  if (data.length === 0) {
    return (
      <Card className="h-full flex flex-col">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="w-4 h-4 text-primary" />
            HTTP Status Over Time
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col items-center justify-center gap-2 text-muted-foreground text-sm">
          <Activity className="w-8 h-8 opacity-20" />
          No traffic data yet
        </CardContent>
      </Card>
    );
  }

  const successRateStr = stats.successRate.toFixed(1);
  const errorRateStr   = stats.errorRate.toFixed(1);
  const isHealthy      = stats.successRate >= 95;

  return (
    <Card className="h-full flex flex-col overflow-hidden">
      <CardHeader className="pb-0 pt-4 px-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          {/* Left: stat badges */}
          <div className="flex items-start gap-5">
            {/* Success rate */}
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-0.5">Success Rate (2xx)</p>
              <div className="flex items-center gap-1.5">
                {isHealthy
                  ? <TrendingUp className="w-4 h-4 text-green-400" />
                  : <TrendingDown className="w-4 h-4 text-red-400" />
                }
                <span
                  className="text-2xl font-bold tabular-nums leading-none"
                  style={{ color: isHealthy ? '#22c55e' : '#ef4444' }}
                >
                  {successRateStr}%
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {stats.success.toLocaleString()} of {stats.total.toLocaleString()} requests
              </p>
            </div>

            {/* Error breakdown */}
            <div className="pl-4 border-l border-border">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-0.5">Errors (4xx + 5xx)</p>
              <span className="text-2xl font-bold tabular-nums leading-none text-red-400">
                {errorRateStr}%
              </span>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {stats.errors.toLocaleString()} errors · live ↻ 5s
              </p>
            </div>
          </div>

          {/* Right: title */}
          <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground font-normal self-start">
            <Activity className="w-4 h-4 text-primary" />
            HTTP Status Over Time
          </CardTitle>
        </div>
      </CardHeader>

      <CardContent className="flex-1 min-h-[220px] pt-3 pb-1 px-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
            <defs>
              {ALL_KEYS.map(key => (
                <linearGradient key={key} id={`grad-${key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={STATUS_COLORS[key]} stopOpacity={key === 's2xx' ? 0.35 : 0.45} />
                  <stop offset="100%" stopColor={STATUS_COLORS[key]} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />

            <XAxis
              dataKey="time"
              stroke="hsl(var(--muted-foreground))"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              minTickGap={60}
            />
            <YAxis
              stroke="hsl(var(--muted-foreground))"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              width={32}
              tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)}
            />

            <Tooltip
              content={<CustomTooltip />}
              cursor={{ stroke: 'hsl(var(--border))', strokeWidth: 1, strokeDasharray: '4 2' }}
            />

            <Legend
              wrapperStyle={{ fontSize: '11px', paddingTop: '2px' }}
              formatter={value => (
                <span style={{ color: STATUS_COLORS[value as StatusKey] ?? '#888', fontWeight: 700, fontSize: 11 }}>
                  {STATUS_LABELS[value as StatusKey] ?? value}
                </span>
              )}
            />

            {/* Render 2xx last so it sits on top visually */}
            {activeKeys.filter(k => k !== 's2xx').map(key => (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                name={key}
                stroke={STATUS_COLORS[key]}
                strokeWidth={2}
                fill={`url(#grad-${key})`}
                fillOpacity={1}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: 'hsl(var(--card))', fill: STATUS_COLORS[key] }}
                animationDuration={350}
                animationEasing="ease-out"
              />
            ))}
            {activeKeys.includes('s2xx') && (
              <Area
                key="s2xx"
                type="monotone"
                dataKey="s2xx"
                name="s2xx"
                stroke={STATUS_COLORS.s2xx}
                strokeWidth={2.5}
                fill="url(#grad-s2xx)"
                fillOpacity={1}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: 'hsl(var(--card))', fill: STATUS_COLORS.s2xx }}
                animationDuration={350}
                animationEasing="ease-out"
              />
            )}

            {/* Mini navigator at bottom (like the reference image) */}
            <Brush
              dataKey="time"
              height={28}
              stroke="hsl(var(--border))"
              fill="hsl(var(--card))"
              travellerWidth={6}
              startIndex={Math.max(0, data.length - 30)}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
