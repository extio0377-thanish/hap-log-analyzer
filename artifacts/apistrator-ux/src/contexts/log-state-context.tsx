import React, { createContext, useContext } from 'react';
import { useLogState } from '@/hooks/use-log-state';

type LogStateContextValue = ReturnType<typeof useLogState>;

const LogStateContext = createContext<LogStateContextValue | null>(null);

export function LogStateProvider({ children }: { children: React.ReactNode }) {
  const state = useLogState();
  return <LogStateContext.Provider value={state}>{children}</LogStateContext.Provider>;
}

export function useLogStateContext(): LogStateContextValue {
  const ctx = useContext(LogStateContext);
  if (!ctx) throw new Error('useLogStateContext must be used within LogStateProvider');
  return ctx;
}
