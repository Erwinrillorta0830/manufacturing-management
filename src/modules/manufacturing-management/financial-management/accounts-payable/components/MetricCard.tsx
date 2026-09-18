// components/MetricCard.tsx — Polished KPI card with optional gradient accent.
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

interface MetricCardProps {
  title:    string;
  value:    string | number;
  sub?:     string;
  icon:     ReactNode;
  /** Tailwind gradient classes used for the top accent strip. */
  gradient?: string;
  /** Tailwind classes for the icon chip background. */
  iconClass?: string;
  /** Optional progress percentage (0-100) shown as a tiny bar. */
  progress?: number | null;
  /** Optional delta badge text (e.g. "+12% MoM"). */
  delta?: string;
  deltaTone?: 'up' | 'down' | 'neutral';
}

export function MetricCard({
  title, value, sub, icon, gradient, iconClass, progress, delta, deltaTone = 'neutral',
}: MetricCardProps) {
  return (
    <Card className="relative overflow-hidden shadow-none border-border group hover:border-primary/30 transition-colors">
      {gradient && (
        <div
          className={cn('absolute inset-x-0 top-0 h-1 opacity-90', gradient)}
          aria-hidden
        />
      )}
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between gap-2 mb-2.5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            {title}
          </p>
          <span
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-lg shrink-0',
              iconClass || 'bg-primary/10 text-primary',
            )}
          >
            {icon}
          </span>
        </div>
        <p className="text-2xl font-black tracking-tight tabular-nums">
          {value}
        </p>
        <div className="flex items-center justify-between gap-2 mt-1.5">
          {sub && <p className="text-[11px] text-muted-foreground leading-snug">{sub}</p>}
          {delta && (
            <span
              className={cn(
                'text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md border',
                deltaTone === 'up'   && 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30',
                deltaTone === 'down' && 'bg-red-500/10 text-red-700 border-red-500/30',
                deltaTone === 'neutral' && 'bg-muted text-muted-foreground border-border',
              )}
            >
              {delta}
            </span>
          )}
        </div>
        {progress !== null && progress !== undefined && (
          <div className="mt-3 h-1 w-full bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary to-primary/60 rounded-full transition-all"
              style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
