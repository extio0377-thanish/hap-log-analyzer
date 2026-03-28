import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Server, Zap } from 'lucide-react';
import type { BackendStat } from '@workspace/api-client-react';
import { formatBytes } from '@/lib/utils';

export function BackendTable({ backends }: { backends: BackendStat[] }) {
  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2">
          <Server className="w-5 h-5 text-primary" />
          Backend Statistics
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-muted/30 text-muted-foreground border-y border-border/50">
            <tr>
              <th className="px-6 py-4 font-medium uppercase tracking-wider text-xs">Backend Name</th>
              <th className="px-6 py-4 font-medium uppercase tracking-wider text-xs text-right">Connections</th>
              <th className="px-6 py-4 font-medium uppercase tracking-wider text-xs text-right">Data Transferred</th>
              <th className="px-6 py-4 font-medium uppercase tracking-wider text-xs text-right">Avg Response</th>
              <th className="px-6 py-4 font-medium uppercase tracking-wider text-xs">Servers pool</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {backends.map((b, i) => (
              <tr key={i} className="hover:bg-muted/20 transition-colors group">
                <td className="px-6 py-4 font-mono text-primary font-medium">{b.name}</td>
                <td className="px-6 py-4 text-right font-mono">{b.connections.toLocaleString()}</td>
                <td className="px-6 py-4 text-right font-mono text-muted-foreground">{formatBytes(b.totalBytes)}</td>
                <td className="px-6 py-4 text-right font-mono flex items-center justify-end gap-2">
                  {b.avgResponseTimeMs > 500 && <Zap className="w-3 h-3 text-orange-400" />}
                  <span className={b.avgResponseTimeMs > 500 ? "text-orange-400" : ""}>{b.avgResponseTimeMs} ms</span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex gap-1.5 flex-wrap max-w-xs">
                    {b.servers.map((s, idx) => (
                      <Badge variant="outline" key={idx} className="font-mono bg-background/50 border-border/60 text-[10px]">
                        {s}
                      </Badge>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
            {backends.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">
                  No backend data available
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
