// components/CategorySplitHeader.tsx — Hero header that shows the
// Trade vs Non-Trade split at a glance with a side-by-side card.

import { Briefcase, Wallet, PhilippinePeso, AlertCircle, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatPeso } from '../utils';
import type { APCategoryBreakdown } from '../types';

interface CategorySplitHeaderProps {
  trade:     APCategoryBreakdown;
  nonTrade:  APCategoryBreakdown;
}

function CategoryCard({ data, label, icon, gradient }: {
  data:      APCategoryBreakdown;
  label:     'Trade' | 'Non-Trade';
  icon:      React.ReactNode;
  gradient:  string;
}) {
  const { totalPayable, totalPaid, totalOutstanding, totalRecords, overdueCount, paidPct } = data;
  const deltaTone = paidPct >= 80 ? 'up' : paidPct >= 40 ? 'neutral' : 'down';

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-card shadow-none">
      {/* Gradient backdrop */}
      <div
        className={cn(
          'absolute inset-0 opacity-[0.07] pointer-events-none',
          gradient,
        )}
        aria-hidden
      />
      <div className="relative p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-lg text-white shrink-0',
              gradient,
            )}
          >
            {icon}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              {label} Payables
            </p>
            <p className="text-xl sm:text-2xl font-black tracking-tight tabular-nums leading-tight">
              {formatPeso(totalOutstanding)}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mt-4">
          <Stat
            icon={<PhilippinePeso className="h-3 w-3" />}
            label="Payable"
            value={formatPeso(totalPayable)}
          />
          <Stat
            icon={<Wallet className="h-3 w-3" />}
            label="Paid"
            value={formatPeso(totalPaid)}
            tone="up"
          />
          <Stat
            icon={overdueCount > 0 ? <AlertCircle className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
            label={overdueCount > 0 ? 'Overdue' : 'Healthy'}
            value={`${overdueCount} inv`}
            tone={overdueCount > 0 ? 'down' : 'up'}
          />
        </div>

        <div className="mt-3.5">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
            <span>Settlement Rate</span>
            <span className="tabular-nums text-foreground">{paidPct.toFixed(1)}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                deltaTone === 'up'      && 'bg-gradient-to-r from-emerald-500 to-emerald-400',
                deltaTone === 'down'    && 'bg-gradient-to-r from-red-500 to-red-400',
                deltaTone === 'neutral' && 'bg-gradient-to-r from-amber-500 to-amber-400',
              )}
              style={{ width: `${Math.max(0, Math.min(100, paidPct))}%` }}
            />
          </div>
        </div>

        <p className="mt-3 text-[10px] text-muted-foreground">
          <span className="font-bold text-foreground">{totalRecords}</span>{' '}
          record{totalRecords !== 1 ? 's' : ''} on file
        </p>
      </div>
    </div>
  );
}

function Stat({ icon, label, value, tone }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: 'up' | 'down' | 'neutral';
}) {
  return (
    <div className="rounded-md border border-border/60 bg-background/60 px-2 py-1.5">
      <div className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <p
        className={cn(
          'text-[11px] font-bold tabular-nums truncate',
          tone === 'up'   && 'text-emerald-700',
          tone === 'down' && 'text-red-700',
          (!tone || tone === 'neutral') && 'text-foreground',
        )}
        title={value}
      >
        {value}
      </p>
    </div>
  );
}

export function CategorySplitHeader({ trade, nonTrade }: CategorySplitHeaderProps) {
  const total = trade.totalOutstanding + nonTrade.totalOutstanding;
  const tradePct = total > 0 ? (trade.totalOutstanding / total) * 100 : 0;
  const nonTradePct = total > 0 ? (nonTrade.totalOutstanding / total) * 100 : 0;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <CategoryCard
          data={trade}
          label="Trade"
          icon={<Briefcase className="h-4 w-4" />}
          gradient="bg-gradient-to-br from-sky-500 to-indigo-500"
        />
        <CategoryCard
          data={nonTrade}
          label="Non-Trade"
          icon={<Wallet className="h-4 w-4" />}
          gradient="bg-gradient-to-br from-amber-500 to-rose-500"
        />
      </div>

      {/* Stacked bar showing relative weight of each category */}
      <div className="rounded-lg border border-border bg-card px-4 py-3">
        <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5">
          <span>Composition by Outstanding Amount</span>
          <span className="text-foreground tabular-nums">{formatPeso(total)} total</span>
        </div>
        <div className="h-2.5 w-full rounded-full overflow-hidden bg-muted flex">
          <div
            className="h-full bg-gradient-to-r from-sky-500 to-indigo-500"
            style={{ width: `${tradePct}%` }}
            title={`Trade: ${tradePct.toFixed(1)}%`}
          />
          <div
            className="h-full bg-gradient-to-r from-amber-500 to-rose-500"
            style={{ width: `${nonTradePct}%` }}
            title={`Non-Trade: ${nonTradePct.toFixed(1)}%`}
          />
        </div>
        <div className="flex items-center justify-between mt-1.5 text-[10px]">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="inline-block w-2 h-2 rounded-full bg-gradient-to-br from-sky-500 to-indigo-500" />
            Trade <span className="font-bold text-foreground tabular-nums">{tradePct.toFixed(1)}%</span>
          </span>
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="inline-block w-2 h-2 rounded-full bg-gradient-to-br from-amber-500 to-rose-500" />
            Non-Trade <span className="font-bold text-foreground tabular-nums">{nonTradePct.toFixed(1)}%</span>
          </span>
        </div>
      </div>
    </div>
  );
}
