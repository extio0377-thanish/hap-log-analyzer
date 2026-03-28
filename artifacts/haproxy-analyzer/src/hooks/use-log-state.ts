import { useState, useCallback, useRef, useEffect } from 'react';
import { useParseLogs } from '@workspace/api-client-react';
import type { LogReport } from '@workspace/api-client-react';
import { useToast } from '@/hooks/use-toast';

export function useLogState() {
  const [report, setReport] = useState<LogReport | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [livePath, setLivePath] = useState('');
  const eventSourceRef = useRef<EventSource | null>(null);
  const accumulatedLinesRef = useRef<string[]>([]);
  const { toast } = useToast();

  const { mutateAsync: parseLogFile, isPending: isParsing } = useParseLogs();

  const handleFileUpload = async (file: File) => {
    try {
      const text = await file.text();
      const result = await parseLogFile({ data: { content: text } });
      setReport(result);
      setIsLive(false);
      toast({
        title: 'Log parsed successfully',
        description: `Analyzed ${result.connections.length} connections.`,
      });
    } catch (error) {
      console.error(error);
      toast({
        title: 'Failed to parse log',
        description: 'Ensure the file is a valid HAProxy log format.',
        variant: 'destructive',
      });
    }
  };

  const startLiveTail = useCallback((path: string) => {
    if (!path) return;
    setLivePath(path);
    setIsLive(true);
    setReport(null);
    accumulatedLinesRef.current = [];

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const url = `/api/logs/stream?file=${encodeURIComponent(path)}`;
    const es = new EventSource(url);
    eventSourceRef.current = es;

    let parseDebounce: ReturnType<typeof setTimeout> | null = null;

    const triggerParse = () => {
      if (parseDebounce) clearTimeout(parseDebounce);
      parseDebounce = setTimeout(async () => {
        const content = accumulatedLinesRef.current.join('\n');
        if (!content.trim()) return;
        try {
          const result = await parseLogFile({ data: { content } });
          setReport(result);
        } catch (err) {
          console.error('Live parse failed', err);
        }
      }, 1500);
    };

    es.onmessage = (e) => {
      try {
        const line = JSON.parse(e.data) as string;
        if (line && typeof line === 'string') {
          accumulatedLinesRef.current.push(line);
          triggerParse();
        }
      } catch (err) {
        console.error('SSE Parse error', err);
      }
    };

    es.onerror = (error) => {
      console.error('EventSource failed:', error);
      toast({
        title: 'Live tail connection error',
        description: 'Lost connection to the log stream.',
        variant: 'destructive',
      });
      es.close();
      setIsLive(false);
    };
  }, [toast, parseLogFile]);

  const stopLiveTail = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsLive(false);
    toast({ title: 'Live tail stopped' });
  }, [toast]);

  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  const clearData = useCallback(() => {
    stopLiveTail();
    setReport(null);
    accumulatedLinesRef.current = [];
  }, [stopLiveTail]);

  return {
    report,
    isLive,
    livePath,
    isParsing,
    handleFileUpload,
    startLiveTail,
    stopLiveTail,
    clearData,
  };
}
