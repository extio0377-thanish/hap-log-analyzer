import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useLogStateContext } from '@/contexts/log-state-context';
import { DashboardView } from '@/components/DashboardView';
import { Layout } from '@/components/Layout';
import { Link } from 'wouter';
import { Loader2, Settings, WifiOff, RefreshCw } from 'lucide-react';

export default function Home() {
  const {
    report,
    isLive,
    livePath,
    isParsing,
    autoRefresh,
    startLiveTail,
    stopLiveTail,
    clearData,
    toggleAutoRefresh,
    manualRefresh,
  } = useLogStateContext();

  const [initState, setInitState] = useState<'loading' | 'connected' | 'error' | 'cleared'>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const didAutoStart = useRef(false);

  const runAutoStart = useCallback(() => {
    const base = import.meta.env.BASE_URL.replace(/\/$/, '');
    fetch(`${base}/api/app-config`)
      .then(r => r.json())
      .then(cfg => {
        const path = cfg.defaultLogPath || '/var/log/extio-engine.log';
        startLiveTail(path);
        setInitState('connected');
      })
      .catch(() => {
        setErrorMsg('Could not reach server to fetch log configuration.');
        setInitState('error');
      });
  }, [startLiveTail]);

  useEffect(() => {
    if (didAutoStart.current || report || isLive) {
      if (isLive || report) setInitState('connected');
      return;
    }
    didAutoStart.current = true;
    runAutoStart();
  }, []);

  const handleClear = useCallback(() => {
    clearData();
    setInitState('cleared');
  }, [clearData]);

  const handleReconnect = useCallback(() => {
    setInitState('loading');
    runAutoStart();
  }, [runAutoStart]);

  return (
    <Layout>
      {report ? (
        <DashboardView
          report={report}
          isLive={isLive}
          livePath={livePath}
          onClear={handleClear}
          onStopLive={stopLiveTail}
          autoRefresh={autoRefresh}
          onToggleAutoRefresh={toggleAutoRefresh}
          onManualRefresh={manualRefresh}
        />
      ) : initState === 'error' ? (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center">
          <div className="h-16 w-16 rounded-2xl bg-destructive/10 flex items-center justify-center">
            <WifiOff className="w-8 h-8 text-destructive" />
          </div>
          <div>
            <h2 className="text-xl font-semibold mb-1">Connection Failed</h2>
            <p className="text-muted-foreground text-sm max-w-md">{errorMsg}</p>
          </div>
          <Link
            href="/log-config"
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            <Settings size={15} /> Configure Log Source
          </Link>
        </div>
      ) : initState === 'cleared' ? (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center">
          <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center">
            <RefreshCw className="w-8 h-8 text-muted-foreground" />
          </div>
          <div>
            <h2 className="text-xl font-semibold mb-1">Dashboard Cleared</h2>
            <p className="text-muted-foreground text-sm max-w-md">
              Reconnect to the live log or upload a log file to start a new session.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleReconnect}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              <RefreshCw size={15} /> Reconnect to Live Log
            </button>
            <Link
              href="/log-config"
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors"
            >
              <Settings size={15} /> Log Configuration
            </Link>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center">
          <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
          <div>
            <h2 className="text-xl font-semibold mb-1">
              {isLive ? 'Waiting for log data…' : 'Connecting to live log…'}
            </h2>
            <p className="text-muted-foreground text-sm max-w-md">
              {isLive
                ? 'Connected — events will appear as they arrive.'
                : 'Starting live fetch from server default path.'}
            </p>
          </div>
          <Link
            href="/log-config"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <Settings size={14} /> Change log source
          </Link>
        </div>
      )}
    </Layout>
  );
}
