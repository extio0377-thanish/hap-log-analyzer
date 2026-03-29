import { cn } from "@/lib/utils";
import React from "react";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'outline' | 'destructive' | 'success';
}

export function Badge({ children, variant = 'default', className, ...props }: BadgeProps) {
  return (
    <span 
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold uppercase tracking-wide transition-colors",
        variant === 'default' && "bg-primary/10 text-primary border border-primary/20",
        variant === 'outline' && "bg-transparent text-muted-foreground border border-border hover:bg-muted",
        variant === 'destructive' && "bg-destructive/10 text-destructive border border-destructive/20",
        variant === 'success' && "bg-green-500/10 text-green-400 border border-green-500/20",
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
