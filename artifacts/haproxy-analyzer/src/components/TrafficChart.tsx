import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Activity } from 'lucide-react';
import type { HourlyBucket } from '@workspace/api-client-react';

export function TrafficChart({ data }: { data: HourlyBucket[] }) {
  if (!data || data.length === 0) {
    return (
      <Card className="h-full flex flex-col">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            Traffic Overview
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex items-center justify-center text-muted-foreground">
          No traffic data available
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary" />
          Connections over Time
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 min-h-[300px] pt-4">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="colorConnections" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4}/>
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis 
              dataKey="hour" 
              stroke="hsl(var(--muted-foreground))" 
              fontSize={12} 
              tickLine={false} 
              axisLine={false} 
              tickFormatter={(val) => {
                // If it's a full ISO string, extract hour, else just return
                try { return val.split('T')[1]?.substring(0,5) || val; } catch { return val; }
              }}
            />
            <YAxis 
              stroke="hsl(var(--muted-foreground))" 
              fontSize={12} 
              tickLine={false} 
              axisLine={false} 
              tickFormatter={(value) => value > 1000 ? `${(value/1000).toFixed(1)}k` : value}
            />
            <Tooltip
              contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--foreground))' }}
              itemStyle={{ color: 'hsl(var(--primary))', fontWeight: 600 }}
              labelStyle={{ color: 'hsl(var(--muted-foreground))', marginBottom: '4px' }}
            />
            <Area 
              type="monotone" 
              dataKey="connections" 
              stroke="hsl(var(--primary))" 
              strokeWidth={3} 
              fillOpacity={1} 
              fill="url(#colorConnections)" 
              animationDuration={1500}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
