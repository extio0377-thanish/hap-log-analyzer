import React from 'react';
import { motion } from 'framer-motion';
import { Download, X, Activity, HardDrive, AlertTriangle, Globe, Clock, Users } from 'lucide-react';
import { StatCard } from './StatCard';
import { TrafficChart } from './TrafficChart';
import { ServerEvents } from './ServerEvents';
import { BackendTable } from './BackendTable';
import { ConnectionsTable } from './ConnectionsTable';
import type { LogReport } from '@workspace/api-client-react';
import { formatBytes } from '@/lib/utils';

interface DashboardViewProps {
  report: LogReport;
  isLive: boolean;
  livePath: string;
  onClear: () => void;
  onStopLive: () => void;
}

export function DashboardView({ report, isLive, livePath, onClear, onStopLive }: DashboardViewProps) {
  
  const handleExport = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(report, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `haproxy-analysis-${new Date().getTime()}.json`);
    document.body.appendChild(downloadAnchorNode); 
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const s = report.summary;

  return (
    <div className="w-full max-w-[1600px] mx-auto pb-20">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 pt-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
            HAProxy Log Analysis
            {isLive && (
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-500/10 border border-green-500/20 text-green-400 text-xs font-bold uppercase tracking-wider mt-1">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
                LIVE TAIL
              </span>
            )}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm font-mono">
            {isLive ? `Tailing: ${livePath}` : `Analyzed period: ${s.timeRange.start} — ${s.timeRange.end}`}
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-card border border-border text-foreground hover:bg-accent transition-colors font-medium text-sm"
          >
            <Download className="w-4 h-4" />
            Export JSON
          </button>
          {isLive ? (
            <button 
              onClick={onStopLive}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors font-medium text-sm"
            >
              <X className="w-4 h-4" />
              Stop Tail
            </button>
          ) : (
             <button 
              onClick={onClear}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-card border border-border text-foreground hover:bg-accent hover:text-destructive transition-colors font-medium text-sm"
            >
              <X className="w-4 h-4" />
              Clear
            </button>
          )}
        </div>
      </header>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
        <StatCard delay={0.1} title="Total Conns" value={s.totalConnections.toLocaleString()} icon={Activity} />
        <StatCard delay={0.15} title="Data Transferred" value={formatBytes(s.totalBytes)} icon={HardDrive} />
        <StatCard delay={0.2} title="Down Events" value={s.downEvents} icon={AlertTriangle} alert={s.downEvents > 0} />
        <StatCard delay={0.25} title="Unique Backends" value={s.uniqueBackends} icon={Globe} />
        <StatCard delay={0.3} title="Avg Response" value={`${s.avgResponseTimeMs}ms`} icon={Clock} />
        <StatCard delay={0.35} title="Unique IPs" value={s.uniqueClients.toLocaleString()} icon={Users} />
      </div>

      {/* Charts & Events */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6 h-[400px]">
        <div className="xl:col-span-2">
          <TrafficChart data={report.hourlyDistribution} />
        </div>
        <div className="xl:col-span-1">
          <ServerEvents events={report.serverEvents} />
        </div>
      </div>

      {/* Tables */}
      <div className="space-y-6">
        <BackendTable backends={report.backendStats} />
        <ConnectionsTable connections={report.connections} />
      </div>
    </div>
  );
}
