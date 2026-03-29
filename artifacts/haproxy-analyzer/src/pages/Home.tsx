import React, { useEffect, useRef, useState } from 'react';
import { useLogState } from '@/hooks/use-log-state';
import { DashboardView } from '@/components/DashboardView';
import { Layout } from '@/components/Layout';
import { Link } from 'wouter';
import { Loader2, Settings, WifiOff } from 'lucide-react';

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
  } = useLogState();

  const [initState, setInitState] = useState<'loading' | 'connected' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const didAutoStart = useRef(false);

  useEffect(() => {
    if (didAutoStart.current || report || isLive) {
      if (isLive || report) setInitState('connected');
      return;
    }
    didAutoStart.current = true;

    const base = import.meta.env.BASE_URL.replace(/\/$/, '');
    fetch(`${base}/api/app-config`)
      .then(r => r.json())
      .then(cfg => {
        const path = cfg.defaultLogPath || '/var/log/haproxy.log';
        startLiveTail(path);
        setInitState('connected');
      })
      .catch(() => {
        setErrorMsg('Could not reach server to fetch log configuration.');
        setInitState('error');
      });
  }, []);

  return (
    <Layout>
      {report ? (
        <DashboardView
          report={report}
          isLive={isLive}
          livePath={livePath}
          onClear={clearData}
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
          <Link href="/log-config">
            <a className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity">
              <Settings size={15} /> Configure Log Source
            </a>
          </Link>
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
                : 'Starting live tail from server default path.'}
            </p>
          </div>
          <Link href="/log-config">
            <a className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <Settings size={14} /> Change log source
            </a>
          </Link>
        </div>
      )}
    </Layout>
  );
}
