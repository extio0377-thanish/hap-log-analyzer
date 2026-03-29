import React, { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Activity, HardDrive, AlertTriangle, Globe, Clock, Users, RefreshCw, Sun, Moon, Camera } from 'lucide-react';
import { StatCard } from './StatCard';
import { TrafficChart } from './TrafficChart';
import { ServerEvents } from './ServerEvents';
import { BackendTable } from './BackendTable';
import { ConnectionsTable } from './ConnectionsTable';
import type { LogReport } from '@workspace/api-client-react';
import { formatBytes } from '@/lib/utils';
import { useTheme } from '@/lib/theme-context';
import { InlineSpinner } from './Spinner';
import { apiRequest } from '@/lib/api-client';

interface DashboardViewProps {
  report: LogReport;
  isLive: boolean;
  livePath: string;
  onClear: () => void;
  onStopLive: () => void;
  autoRefresh: boolean;
  onToggleAutoRefresh: () => void;
  onManualRefresh: () => void;
}

export function DashboardView({
  report,
  isLive,
  livePath,
  onClear,
  onStopLive,
  autoRefresh,
  onToggleAutoRefresh,
  onManualRefresh,
}: DashboardViewProps) {
  const { theme, toggleTheme } = useTheme();
  const s = report.summary;
  const dashboardRef = useRef<HTMLDivElement>(null);
  const [screenshotting, setScreenshotting] = useState(false);

  const handleScreenshot = async () => {
    if (!dashboardRef.current || screenshotting) return;
    setScreenshotting(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(dashboardRef.current, {
        useCORS: true,
        allowTaint: true,
        scale: window.devicePixelRatio || 1,
        logging: false,
        backgroundColor: getComputedStyle(document.documentElement)
          .getPropertyValue('--background') || '#0f172a',
      });

      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);

      // Trigger browser download
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `msb-dashboard-${ts}.jpg`;
      a.click();

      // Upload to API so GET /api/screenshot can serve it
      try {
        await apiRequest('/screenshot', {
          method: 'POST',
          body: JSON.stringify({ image: dataUrl }),
        });
      } catch (err) {
        console.warn('Screenshot upload to API failed:', err);
      }
    } catch (err) {
      console.error('Screenshot capture failed:', err);
    } finally {
      setScreenshotting(false);
    }
  };

  return (
    <div ref={dashboardRef} className="w-full max-w-[1600px] mx-auto pb-20">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 pt-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
            MSB Traffic Visualizer
            {isLive && (
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-500/10 border border-green-500/20 text-green-400 text-xs font-bold uppercase tracking-wider mt-1">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
                LIVE
              </span>
            )}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm font-mono">
            {isLive ? `Tailing: ${livePath}` : `Analyzed period: ${s.timeRange.start} — ${s.timeRange.end}`}
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors text-sm font-medium"
            title={theme === 'dark' ? 'Switch to Light mode' : 'Switch to Dark mode'}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>

          {/* Screenshot button */}
          <button
            onClick={handleScreenshot}
            disabled={screenshotting}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-wait"
            title="Capture dashboard screenshot (downloads as JPG + posts to GET /api/screenshot)"
          >
            {screenshotting ? <InlineSpinner text="Thinking..." /> : <><Camera className="w-4 h-4" /> Screenshot</>}
          </button>

          {/* Auto Refresh toggle */}
          <button
            onClick={onToggleAutoRefresh}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border font-medium text-sm transition-colors ${
              autoRefresh
                ? 'bg-primary/10 border-primary/30 text-primary hover:bg-primary/20'
                : 'bg-card border-border text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
            title={autoRefresh ? 'Auto Refresh is ON — click to pause' : 'Auto Refresh is OFF — click to enable'}
          >
            <RefreshCw className={`w-4 h-4 ${autoRefresh ? 'animate-spin [animation-duration:3s]' : ''}`} />
            Auto Refresh
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${autoRefresh ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
              {autoRefresh ? 'ON' : 'OFF'}
            </span>
          </button>

          {/* Stop / Clear */}
          {isLive ? (
            <button 
              onClick={onStopLive}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors font-medium text-sm"
            >
              <X className="w-4 h-4" />
              Stop
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
          <TrafficChart connections={report.connections} />
        </div>
        <div className="xl:col-span-1">
          <ServerEvents events={report.serverEvents} />
        </div>
      </div>

      {/* Tables */}
      <div className="space-y-6">
        <BackendTable backends={report.backendStats} />
        <ConnectionsTable connections={report.connections} onRefresh={onManualRefresh} />
      </div>
    </div>
  );
}
