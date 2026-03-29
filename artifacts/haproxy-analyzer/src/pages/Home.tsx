import React from 'react';
import { useLogState } from '@/hooks/use-log-state';
import { UploadView } from '@/components/UploadView';
import { DashboardView } from '@/components/DashboardView';
import { Layout } from '@/components/Layout';

export default function Home() {
  const {
    report,
    isLive,
    livePath,
    isParsing,
    autoRefresh,
    handleFileUpload,
    startLiveTail,
    stopLiveTail,
    clearData,
    toggleAutoRefresh,
    manualRefresh,
  } = useLogState();

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
      ) : (
        <UploadView
          onUpload={handleFileUpload}
          onLiveTail={startLiveTail}
          isParsing={isParsing}
        />
      )}
    </Layout>
  );
}
