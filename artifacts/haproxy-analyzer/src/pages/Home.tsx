import React from 'react';
import { useLogState } from '@/hooks/use-log-state';
import { UploadView } from '@/components/UploadView';
import { DashboardView } from '@/components/DashboardView';

export default function Home() {
  const { 
    report, 
    isLive, 
    livePath, 
    isParsing, 
    handleFileUpload, 
    startLiveTail, 
    stopLiveTail, 
    clearData 
  } = useLogState();

  return (
    <main className="min-h-screen p-4 md:p-8">
      {report ? (
        <DashboardView 
          report={report} 
          isLive={isLive} 
          livePath={livePath} 
          onClear={clearData} 
          onStopLive={stopLiveTail} 
        />
      ) : (
        <UploadView 
          onUpload={handleFileUpload} 
          onLiveTail={startLiveTail} 
          isParsing={isParsing} 
        />
      )}
    </main>
  );
}
