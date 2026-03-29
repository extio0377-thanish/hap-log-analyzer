import React, { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Cell,
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

interface StatusBucket {
  time: string;
  s2xx: number;
  s3xx: number;
  s4xx: number;
  s5xx: number;
  other: number;
}

function classify(code?: number): StatusKey {
  if (!code)              return 'other';
  if (code < 300)         return 's2xx';
  if (code < 400)         return 's3xx';
  if (code < 500)         return 's4xx';
  if (code < 600)         return 's5xx';
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
    const bucket = map.get(timeKey)!;
    bucket[classify(c.httpStatusCode)]++;
  }

  return Array.from(map.values()).sort((a, b) => a.time.localeCompare(b.time));
}

const BARS: StatusKey[] = ['s2xx', 's3xx', 's4xx', 's5xx', 'other'];

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; fill: string }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const entries = payload.filter(p => p.value > 0);
  if (entries.length === 0) return null;
  return (
    <div className="bg-card border border-border rounded-lg shadow-lg p-3 text-sm min-w-[160px]">
      <p className="text-muted-foreground text-xs font-mono mb-2">{label}</p>
      {entries.map(e => (
        <div key={e.name} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full" style={{ background: e.fill }} />
            <span className="text-foreground">{STATUS_LABELS[e.name as StatusKey] ?? e.name}</span>
          </span>
          <span className="font-bold text-foreground tabular-nums">{e.value}</span>
        </div>
      ))}
    </div>
  );
}

export function TrafficChart({ connections }: { connections: ConnectionEntry[] }) {
  const data = useMemo(() => buildBuckets(connections), [connections]);

  const activeBars = useMemo(
    () => BARS.filter(k => data.some(d => d[k] > 0)),
    [data],
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
        <CardContent className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          No traffic data yet
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="w-4 h-4 text-primary" />
          HTTP Status Over Time
          <span className="ml-auto text-xs font-normal text-muted-foreground tabular-nums">
            {connections.filter(c => c.isJsonLog).length} requests
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 min-h-[280px] pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, left: -18, bottom: 0 }} barCategoryGap="30%">
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
              tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--accent) / 0.25)' }} />
            <Legend
              wrapperStyle={{ fontSize: '11px', paddingTop: '6px' }}
              formatter={value => (
                <span style={{ color: 'hsl(var(--foreground))', opacity: 0.8 }}>
                  {STATUS_LABELS[value as StatusKey] ?? value}
                </span>
              )}
            />
            {activeBars.map((key, i) => (
              <Bar
                key={key}
                dataKey={key}
                name={key}
                stackId="stack"
                fill={STATUS_COLORS[key]}
                isAnimationActive={false}
                radius={i === activeBars.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
