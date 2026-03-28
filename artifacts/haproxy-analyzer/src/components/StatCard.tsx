import React from 'react';
import { Card, CardContent } from './ui/card';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ElementType;
  trend?: string;
  trendUp?: boolean;
  alert?: boolean;
  delay?: number;
}

export function StatCard({ title, value, icon: Icon, trend, trendUp, alert, delay = 0 }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
    >
      <Card className={cn("relative overflow-hidden transition-all duration-300 hover:border-primary/30 group", alert && "border-destructive/50 bg-destructive/5")}>
        {alert && <div className="absolute top-0 left-0 w-full h-1 bg-destructive" />}
        <CardContent className="p-6">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">{title}</p>
              <h4 className={cn("text-3xl font-bold tracking-tight font-mono", alert ? "text-destructive" : "text-foreground")}>
                {value}
              </h4>
            </div>
            <div className={cn(
              "p-3 rounded-xl transition-colors", 
              alert ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary group-hover:bg-primary/20"
            )}>
              <Icon className="w-5 h-5" />
            </div>
          </div>
          {trend && (
            <div className="mt-4 text-xs font-medium">
              <span className={trendUp ? "text-green-400" : "text-red-400"}>
                {trend}
              </span>
              <span className="text-muted-foreground ml-2">vs previous period</span>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
