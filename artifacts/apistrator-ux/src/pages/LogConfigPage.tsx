import React from 'react';
import { Layout } from '@/components/Layout';
import { UploadView } from '@/components/UploadView';
import { useLogStateContext } from '@/contexts/log-state-context';
import { Link, useLocation } from 'wouter';
import { ArrowLeft } from 'lucide-react';

export default function LogConfigPage() {
  const { isParsing, handleFileUpload, startLiveTail } = useLogStateContext();
  const [, navigate] = useLocation();

  const handleUpload = async (file: File) => {
    await handleFileUpload(file);
    navigate('/');
  };

  const handleLiveTail = (path: string) => {
    startLiveTail(path);
    navigate('/');
  };

  return (
    <Layout>
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={14} /> Back to Dashboard
          </Link>
        </div>

        <UploadView
          onUpload={handleUpload}
          onLiveTail={handleLiveTail}
          isParsing={isParsing}
        />
      </div>
    </Layout>
  );
}
