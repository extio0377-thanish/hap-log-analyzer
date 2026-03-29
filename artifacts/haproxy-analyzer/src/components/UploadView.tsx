import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Activity, UploadCloud, Terminal, Sun, Moon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from './ui/card';
import { useTheme } from '@/lib/theme-context';
import { InlineSpinner } from './Spinner';

interface UploadViewProps {
  onUpload: (file: File) => void;
  onLiveTail: (path: string) => void;
  isParsing: boolean;
}

export function UploadView({ onUpload, onLiveTail, isParsing }: UploadViewProps) {
  const [dragging, setDragging] = useState(false);
  const [path, setPath] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { theme, toggleTheme } = useTheme();

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onUpload(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onUpload(e.target.files[0]);
    }
  };

  const handleLiveSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (path.trim()) {
      onLiveTail(path.trim());
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto mt-20">
      {/* Theme toggle in top-right */}
      <div className="flex justify-end mb-4">
        <button
          onClick={toggleTheme}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors text-sm font-medium"
          title={theme === 'dark' ? 'Switch to Light mode' : 'Switch to Dark mode'}
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          {theme === 'dark' ? 'Light' : 'Dark'}
        </button>
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }} 
        animate={{ opacity: 1, y: 0 }} 
        transition={{ duration: 0.5 }}
        className="text-center mb-12"
      >
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 text-primary mb-6 shadow-[0_0_30px_hsl(var(--primary)/0.2)]">
          <Terminal className="w-8 h-8" />
        </div>
        <h1 className="text-4xl font-bold text-foreground mb-4">Extio APISTRATOR</h1>
        <p className="text-lg text-muted-foreground">Drop a log file to parse instantly, or connect to a live stream.</p>
      </motion.div>

      <Card className="bg-card/50 backdrop-blur-xl border-border/60">
        <CardContent className="p-8">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={cn(
              "relative border-2 border-dashed rounded-xl p-12 text-center transition-all duration-300 group",
              dragging ? "border-primary bg-primary/5" : "border-border/80 hover:border-primary/50 hover:bg-accent/30",
              isParsing && "opacity-50 pointer-events-none"
            )}
          >
            <UploadCloud className={cn("w-12 h-12 mx-auto mb-4 transition-colors duration-300", dragging ? "text-primary" : "text-muted-foreground group-hover:text-primary/70")} />
            <h3 className="text-xl font-medium mb-2 text-foreground">Upload HAProxy Log</h3>
            <p className="text-muted-foreground mb-6 text-sm">Drag and drop your .log file here</p>
            <input 
              type="file" 
              className="hidden" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              accept=".log,.txt" 
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={isParsing}
              className="bg-primary text-primary-foreground px-6 py-2.5 rounded-lg font-medium cursor-pointer hover:bg-primary/90 transition-all hover:shadow-[0_0_20px_hsl(var(--primary)/0.3)] hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50"
            >
              {isParsing ? <InlineSpinner text="Thinking..." /> : "Browse Files"}
            </button>
          </div>

          <div className="relative my-10">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border/50"></span>
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-4 text-muted-foreground font-semibold tracking-wider">Or</span>
            </div>
          </div>

          <div className="bg-background/50 rounded-xl p-6 border border-border/50">
            <h3 className="text-base font-medium mb-4 flex items-center gap-2 text-foreground">
              <Activity className="w-5 h-5 text-primary" />
              Live Log Tail
            </h3>
            <form onSubmit={handleLiveSubmit} className="flex gap-3">
              <input
                type="text"
                placeholder="/var/log/haproxy.log"
                className="flex-1 bg-card border border-border rounded-lg px-4 py-2.5 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 font-mono text-sm text-foreground placeholder:text-muted-foreground/50 transition-all shadow-inner"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                disabled={isParsing}
              />
              <button 
                type="submit" 
                disabled={!path.trim() || isParsing}
                className="bg-secondary text-secondary-foreground border border-border px-6 py-2.5 rounded-lg font-medium hover:bg-accent hover:text-foreground transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Connect
              </button>
            </form>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
