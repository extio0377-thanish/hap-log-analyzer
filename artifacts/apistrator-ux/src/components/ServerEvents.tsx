import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { ServerEvent } from '@workspace/api-client-react';
import { cn } from '@/lib/utils';

export function ServerEvents({ events }: { events: ServerEvent[] }) {
  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-primary" />
          Server Health Events
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0 relative">
        {events.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-6">
            <CheckCircle2 className="w-10 h-10 text-green-500/20 mb-3" />
            <p>All servers operating normally</p>
          </div>
        ) : (
          <div className="absolute inset-0 overflow-y-auto p-6 pt-2 custom-scrollbar">
            <div className="space-y-5">
              {events.map((e, i) => (
                <div key={i} className="flex gap-4 relative group">
                  <div className="flex flex-col items-center">
                    <div className={cn(
                      "w-3 h-3 rounded-full mt-1.5 shadow-[0_0_10px_rgba(0,0,0,0.5)] z-10", 
                      e.status === 'UP' ? 'bg-green-500 shadow-green-500/50' : 'bg-destructive shadow-destructive/50'
                    )} />
                    {i !== events.length - 1 && <div className="w-px h-full bg-border mt-2 group-hover:bg-primary/30 transition-colors" />}
                  </div>
                  <div className="pb-2 flex-1 bg-card border border-transparent group-hover:bg-muted/30 group-hover:border-border/50 p-3 -mt-2 rounded-xl transition-colors">
                    <div className="flex justify-between items-start mb-1">
                      <span className={cn("text-sm font-bold tracking-wide", e.status === 'UP' ? 'text-green-400' : 'text-destructive')}>
                        SERVER {e.status}
                      </span>
                      <span className="text-xs text-muted-foreground font-mono">{e.timestamp}</span>
                    </div>
                    <div className="text-sm text-foreground">
                      <span className="font-mono text-primary/90">{e.server}</span> in <span className="font-mono text-muted-foreground">{e.backend}</span>
                    </div>
                    {e.reason && (
                      <div className="text-xs text-muted-foreground mt-2 bg-background/50 p-2 rounded border border-border/50 font-mono">
                        {e.reason} <span className="opacity-50">({e.checkDurationMs}ms check)</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
