import React, { useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Activity } from 'lucide-react';
import type { ConnectionEntry } from '@workspace/api-client-react';

const STATUS_COLORS = {
  s2xx:  '#22c55e', // green
  s3xx:  '#3b82f6', // blue
  s4xx:  '#f97316', // orange
  s5xx:  '#ef4444', // red
  other: '#6b7280', // gray
} as const;

type StatusKey = keyof typeof STATUS_COLORS;

const STATUS_LABELS: Record<StatusKey, string> = {
  s2xx:  '2xx Success',
  s3xx:  '3xx Redirect',
  s4xx:  '4xx Client Error',
  s5xx:  '5xx Server Error',
  other: 'Other',
};

const ALL_KEYS: StatusKey[] = ['s2xx', 's3xx', 's4xx', 's5xx', 'other'];

interface StatusBucket {
  time: string;
  s2xx: number;
  s3xx: number;
  s4xx: number;
  s5xx: number;
  other: number;
}

function classify(code?: number): StatusKey {
  if (!code)        return 'other';
  if (code < 300)   return 's2xx';
  if (code < 400)   return 's3xx';
  if (code < 500)   return 's4xx';
  if (code < 600)   return 's5xx';
  return 'other';
}

function buildBuckets(connections: ConnectionEntry[]): StatusBucket[] {
  const jsonConns = connections.filter(c => c.isJsonLog);
  if (jsonConns.length === 0) return [];

  const map = new Map<string, StatusBucket>();

  for (const c of jsonConns) {
    let timeKey = '??:??';
    try {
      const ts = c.timestamp ?? '';
      const timePart = ts.includes('T') ? ts.split('T')[1] : ts;
      timeKey = timePart.substring(0, 5); // "HH:MM"
    } catch { /* keep default */ }

    if (!map.has(timeKey)) {
      map.set(timeKey, { time: timeKey, s2xx: 0, s3xx: 0, s4xx: 0, s5xx: 0, other: 0 });
    }
    map.get(timeKey)![classify(c.httpStatusCode)]++;
  }

  return Array.from(map.values()).sort((a, b) => a.time.localeCompare(b.time));
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const entries = payload.filter(p => p.value > 0).sort((a, b) => b.value - a.value);
  if (entries.length === 0) return null;
  return (
    <div className="bg-card border border-border rounded-lg shadow-xl p-3 text-sm min-w-[180px]">
      <p className="text-muted-foreground text-xs font-mono mb-2 border-b border-border pb-1.5">{label}</p>
      {entries.map(e => (
        <div key={e.name} className="flex items-center justify-between gap-6 py-0.5">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: e.color }} />
            <span className="text-foreground/90">{STATUS_LABELS[e.name as StatusKey] ?? e.name}</span>
          </span>
          <span className="font-bold tabular-nums" style={{ color: e.color }}>{e.value}</span>
        </div>
      ))}
    </div>
  );
}

export function TrafficChart({ connections }: { connections: ConnectionEntry[] }) {
  const data = useMemo(() => buildBuckets(connections), [connections]);

  const activeKeys = useMemo(
    () => ALL_KEYS.filter(k => data.some(d => d[k] > 0)),
    [data],
  );

  const total = useMemo(
    () => connections.filter(c => c.isJsonLog).length,
    [connections],
  );

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

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-1">
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="w-4 h-4 text-primary" />
          HTTP Status Over Time
          <span className="ml-auto text-xs font-normal text-muted-foreground tabular-nums">
            {total.toLocaleString()} requests
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 min-h-[280px] pt-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <defs>
              {ALL_KEYS.map(key => (
                <linearGradient key={key} id={`grad-${key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={STATUS_COLORS[key]} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={STATUS_COLORS[key]} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />

            <XAxis
              dataKey="time"
              stroke="hsl(var(--muted-foreground))"
              fontSize={11}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="hsl(var(--muted-foreground))"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              width={36}
              tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)}
            />

            <Tooltip
              content={<CustomTooltip />}
              cursor={{ stroke: 'hsl(var(--border))', strokeWidth: 1, strokeDasharray: '4 2' }}
            />

            <Legend
              wrapperStyle={{ fontSize: '11px', paddingTop: '4px' }}
              formatter={value => (
                <span style={{ color: STATUS_COLORS[value as StatusKey] ?? 'hsl(var(--foreground))', fontWeight: 600 }}>
                  {STATUS_LABELS[value as StatusKey] ?? value}
                </span>
              )}
            />

            {activeKeys.map(key => (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                name={key}
                stroke={STATUS_COLORS[key]}
                strokeWidth={2.5}
                fill={`url(#grad-${key})`}
                fillOpacity={1}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: 'hsl(var(--card))', fill: STATUS_COLORS[key] }}
                animationDuration={400}
                animationEasing="ease-out"
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
