import React from 'react';

interface SpinnerProps {
  text?: string;
  size?: 'sm' | 'md' | 'lg';
  fullScreen?: boolean;
}

export function Spinner({ text = 'Thinking...', size = 'md', fullScreen = false }: SpinnerProps) {
  const sizeMap = {
    sm: 'h-4 w-4 border-2',
    md: 'h-6 w-6 border-2',
    lg: 'h-10 w-10 border-[3px]',
  };

  const spinner = (
    <div className="flex flex-col items-center gap-2">
      <div
        className={`animate-spin rounded-full border-primary border-t-transparent ${sizeMap[size]}`}
        role="status"
        aria-label="Loading"
      />
      {text && (
        <span className="text-sm text-muted-foreground animate-pulse">{text}</span>
      )}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
        {spinner}
      </div>
    );
  }

  return spinner;
}

export function InlineSpinner({ text = 'Thinking...' }: { text?: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      <span className="text-sm text-muted-foreground animate-pulse">{text}</span>
    </span>
  );
}
