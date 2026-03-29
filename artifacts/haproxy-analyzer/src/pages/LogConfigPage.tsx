import React, { useEffect, useState } from 'react';
import { Layout } from '@/components/Layout';
import { UploadView } from '@/components/UploadView';
import { useLogState } from '@/hooks/use-log-state';
import { Link } from 'wouter';
import { Info, ArrowLeft } from 'lucide-react';

export default function LogConfigPage() {
  const { isParsing, handleFileUpload, startLiveTail } = useLogState();
  const [defaultPath, setDefaultPath] = useState<string>('');

  useEffect(() => {
    const base = import.meta.env.BASE_URL.replace(/\/$/, '');
    fetch(`${base}/api/app-config`)
      .then(r => r.json())
      .then(cfg => setDefaultPath(cfg.defaultLogPath || '/var/log/haproxy.log'))
      .catch(() => {});
  }, []);

  const handleLiveTail = (path: string) => {
    startLiveTail(path);
  };

  return (
    <Layout>
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/">
            <a className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft size={14} /> Back to Dashboard
            </a>
          </Link>
        </div>

        {defaultPath && (
          <div className="mb-6 flex items-start gap-3 px-4 py-3 rounded-lg bg-primary/5 border border-primary/20 text-sm">
            <Info size={15} className="text-primary mt-0.5 shrink-0" />
            <div>
              <span className="font-medium text-foreground">Server default:</span>{' '}
              <code className="font-mono text-primary text-xs bg-primary/10 px-1.5 py-0.5 rounded">{defaultPath}</code>
              <p className="text-muted-foreground mt-1 text-xs">
                Update <code className="font-mono">DEFAULT_LOG_PATH</code> in <code className="font-mono">artifacts/api-server/.env</code> to change the default live-tail path.
              </p>
            </div>
          </div>
        )}

        <UploadView
          onUpload={handleFileUpload}
          onLiveTail={handleLiveTail}
          isParsing={isParsing}
        />
      </div>
    </Layout>
  );
}
