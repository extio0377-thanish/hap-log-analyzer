import React from 'react';
import { Layout } from '@/components/Layout';
import { UploadView } from '@/components/UploadView';
import { useLogState } from '@/hooks/use-log-state';
import { Link } from 'wouter';
import { ArrowLeft } from 'lucide-react';

export default function LogConfigPage() {
  const { isParsing, handleFileUpload, startLiveTail } = useLogState();

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

        <UploadView
          onUpload={handleFileUpload}
          onLiveTail={startLiveTail}
          isParsing={isParsing}
        />
      </div>
    </Layout>
  );
}
