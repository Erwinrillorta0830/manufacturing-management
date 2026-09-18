// components/DrilldownChart.tsx
// 4-level interactive drill-down: Operation → Division → Salesman → Customer
'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import { ChevronRight, LayoutGrid } from 'lucide-react';
import { formatPeso } from '../utils';
import type { OperationBreakdown, Invoice } from '../types';

interface Props {
  operationData: OperationBreakdown[];
  invoices: Invoice[];
  isFiltered?: boolean;
}

type Level = 'operation' | 'division' | 'salesman' | 'customer';

interface Crumb {
  level: Level;
  label: string;
  filterSalesType?: number | null;
  filterDivision?: string;
  filterSalesman?: string;
}

const PALETTES: Record<Level, string[]> = {
  operation: [
    'hsl(215,78%,56%)', 'hsl(175,62%,44%)', 'hsl(258,64%,60%)',
    'hsl(35,82%,52%)',  'hsl(340,66%,52%)', 'hsl(160,60%,43%)',
    'hsl(290,54%,56%)', 'hsl(55,74%,48%)',
  ],
  division: [
    'hsl(175,62%,44%)', 'hsl(158,58%,40%)', 'hsl(192,66%,48%)',
    'hsl(140,52%,42%)', 'hsl(210,60%,50%)', 'hsl(165,56%,38%)',
  ],
  salesman: [
    'hsl(258,64%,60%)', 'hsl(280,58%,54%)', 'hsl(235,60%,58%)',
    'hsl(305,52%,52%)', 'hsl(245,62%,56%)', 'hsl(270,56%,50%)',
  ],
  customer: [
    'hsl(35,82%,52%)',  'hsl(20,80%,50%)',  'hsl(50,78%,48%)',
    'hsl(15,76%,48%)',  'hsl(45,80%,45%)',  'hsl(30,74%,46%)',
  ],
};

const LEVEL_ORDER: Level[] = ['operation', 'division', 'salesman', 'customer'];
const LEVEL_LABELS: Record<Level, string> = {
  operation: 'Operation',
  division:  'Division',
  salesman:  'Salesman',
  customer:  'Customer',
};

function shortPeso(v: number): string {
  if (v >= 1_000_000_000) return `₱${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000)     return `₱${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)         return `₱${(v / 1_000).toFixed(0)}K`;
  return `₱${v.toFixed(0)}`;
}

function aggregate(invs: Invoice[], key: (inv: Invoice) => string): { name: string; value: number; count: number }[] {
  const agg: Record<string, { value: number; count: number }> = {};
  for (const inv of invs) {
    const k = key(inv) || '—';
    if (!agg[k]) agg[k] = { value: 0, count: 0 };
    agg[k].value += inv.outstanding;
    agg[k].count += 1;
  }
  return Object.entries(agg)
    .map(([name, d]) => ({ name, ...d }))
    .sort((a, b) => b.value - a.value);
}

type DrillRow = { name: string; value: number; count: number; _opId?: number | null };

export function DrilldownChart({ operationData, invoices, isFiltered = false }: Props) {
  const [crumbs, setCrumbs] = useState<Crumb[]>([
    { level: 'operation', label: 'All Operations' },
  ]);

  const currentCrumb = crumbs[crumbs.length - 1];
  const currentLevel = currentCrumb.level;
  const nextLevel    = LEVEL_ORDER[LEVEL_ORDER.indexOf(currentLevel) + 1] as Level | undefined;
  const palette      = PALETTES[currentLevel];

  const scopedInvoices = useMemo(() => {
    let set = invoices;
    for (const c of crumbs) {
      if (c.filterSalesType !== undefined)
        set = set.filter((inv) => inv.salesType === c.filterSalesType);
      if (c.filterDivision !== undefined)
        set = set.filter((inv) => inv.division === c.filterDivision);
      if (c.filterSalesman !== undefined)
        set = set.filter((inv) => inv.salesman === c.filterSalesman);
    }
    return set;
  }, [invoices, crumbs]);

  const rows: DrillRow[] = useMemo(() => {
    if (currentLevel === 'operation') {
      return operationData.map((op) => ({
        name: op.name,
        value: op.totalOutstanding,
        count: op.count,
        _opId: op.id,
      })).sort((a, b) => b.value - a.value);
    }
    if (currentLevel === 'division')
      return aggregate(scopedInvoices, (inv) => inv.division).map((r) => ({ ...r, _opId: undefined }));
    if (currentLevel === 'salesman')
      return aggregate(scopedInvoices, (inv) => inv.salesman).map((r) => ({ ...r, _opId: undefined }));
    return aggregate(scopedInvoices, (inv) => inv.customer).map((r) => ({ ...r, _opId: undefined }));
  }, [currentLevel, operationData, scopedInvoices]);

  const total = rows.reduce((s, r) => s + r.value, 0);
  const chartH = Math.max(120, Math.min(rows.length, 12) * 32);
  const isLeaf = currentLevel === 'customer' || !nextLevel;

  function drillInto(row: DrillRow) {
    if (isLeaf) return;
    const next = nextLevel!;
    const newCrumb: Crumb = { level: next, label: row.name };
    if (currentLevel === 'operation') newCrumb.filterSalesType = row._opId ?? null;
    if (currentLevel === 'division')  newCrumb.filterDivision  = row.name;
    if (currentLevel === 'salesman')  newCrumb.filterSalesman  = row.name;
    setCrumbs([...crumbs, newCrumb]);
  }

  function navTo(idx: number) {
    setCrumbs(crumbs.slice(0, idx + 1));
  }

  const isEmpty = rows.length === 0;

  return (
    <Card className="min-w-0 overflow-hidden w-full border-border/50 shadow-sm">
      <CardHeader className="p-0 border-b border-border/40">
        <div className="flex items-center justify-between px-4 py-2.5 gap-2">
          <div className="flex items-center gap-1 min-w-0 flex-wrap">
            <LayoutGrid className="h-3 w-3 text-muted-foreground/50 shrink-0" />
            {crumbs.map((c, idx) => {
              const isLast = idx === crumbs.length - 1;
              return (
                <span key={idx} className="flex items-center gap-1 min-w-0">
                  {idx > 0 && <ChevronRight className="h-2.5 w-2.5 text-muted-foreground/30 shrink-0" />}
                  <button
                    onClick={() => navTo(idx)}
                    disabled={isLast}
                    className={`text-[10px] font-medium truncate max-w-[120px] transition-colors ${
                      isLast
                        ? 'text-foreground cursor-default'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {idx === 0 ? LEVEL_LABELS[c.level] : c.label}
                  </button>
                </span>
              );
            })}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {!isLeaf && (
              <span className="text-[9px] text-muted-foreground/50 hidden sm:block">
                click bar to drill down
              </span>
            )}
            <span className="text-[10px] tabular-nums font-mono text-muted-foreground border border-border/40 rounded px-1.5 py-0.5">
              {rows.length} {LEVEL_LABELS[currentLevel].toLowerCase()}{rows.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        <div className="flex border-t border-border/30">
          {LEVEL_ORDER.map((lv, idx) => {
            const reached = crumbs.some((c) => c.level === lv);
            const active  = currentLevel === lv;
            const reachable = idx <= crumbs.length - 1;
            return (
              <button
                key={lv}
                disabled={!reachable}
                onClick={() => reachable ? navTo(Math.min(idx, crumbs.length - 1)) : undefined}
                className={`flex-1 py-1 text-[9px] font-semibold uppercase tracking-wider transition-colors border-b-2 ${
                  active
                    ? 'border-primary text-primary'
                    : reached
                    ? 'border-transparent text-muted-foreground hover:text-foreground'
                    : 'border-transparent text-muted-foreground/30 cursor-not-allowed'
                }`}
              >
                {LEVEL_LABELS[lv]}
              </button>
            );
          })}
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {isEmpty ? (
          <div className="flex items-center justify-center h-24 text-[11px] text-muted-foreground">
            {isFiltered ? 'No data for current filters.' : 'No data available.'}
          </div>
        ) : (
          <div className="px-3 pt-3 pb-3">
            <ResponsiveContainer width="100%" height={chartH}>
              <BarChart
                layout="vertical"
                data={rows}
                margin={{ top: 0, right: 14, left: 4, bottom: 0 }}
                barCategoryGap="28%"
              >
                <CartesianGrid strokeDasharray="2 3" horizontal={false} stroke="rgba(128,128,128,0.07)" />
                <XAxis type="number" fontSize={9} tickLine={false} axisLine={false} tickFormatter={shortPeso} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis type="category" dataKey="name" fontSize={9} width={100} tickLine={false} axisLine={false} tick={{ fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(v: string) => v.length > 15 ? v.slice(0, 15) + '…' : v} />
                <Tooltip
                  cursor={{ fill: 'rgba(128,128,128,0.05)' }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const e = payload[0].payload as DrillRow;
                    const pct = total > 0 ? ((e.value / total) * 100).toFixed(1) : '0';
                    return (
                      <div className="bg-popover border border-border rounded-md shadow-lg px-3 py-2 text-[10px] space-y-1">
                        <p className="font-semibold text-foreground leading-tight">{e.name}</p>
                        <p className="font-mono font-bold text-primary">{formatPeso(e.value)}</p>
                        <div className="flex items-center gap-3 text-muted-foreground">
                          <span>{e.count} inv</span>
                          <span>{pct}% of total</span>
                        </div>
                        {!isLeaf && (
                          <p className="text-muted-foreground/50 italic border-t border-border/40 pt-1 mt-1">
                            Click → {LEVEL_LABELS[nextLevel!]}
                          </p>
                        )}
                      </div>
                    );
                  }}
                />
                <Bar
                  dataKey="value"
                  radius={[0, 3, 3, 0]}
                  maxBarSize={20}
                  cursor={isLeaf ? 'default' : 'pointer'}
                  onClick={isLeaf ? undefined : (entry) => drillInto(entry as DrillRow)}
                >
                  {rows.map((_, i) => (
                    <Cell key={i} fill={palette[i % palette.length]} opacity={0.9} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            <div className="mt-3 border-t border-border/30 pt-2.5 space-y-1">
              {rows.slice(0, 10).map((row, i) => {
                const pct = total > 0 ? (row.value / total) * 100 : 0;
                const barW = Math.max(2, pct);
                return (
                  <div key={i} className="group">
                    <button
                      disabled={isLeaf}
                      onClick={() => !isLeaf && drillInto(row)}
                      className={`w-full flex items-center gap-2 text-[9px] rounded px-1 py-0.5 -mx-1 transition-colors ${
                        isLeaf ? 'cursor-default' : 'hover:bg-muted/40 cursor-pointer'
                      }`}
                    >
                      <span className="text-muted-foreground/40 tabular-nums w-3.5 text-right shrink-0">{i + 1}</span>
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: palette[i % palette.length] }} />
                      <span className="text-muted-foreground truncate flex-1 text-left" title={row.name}>{row.name}</span>
                      <span className="hidden sm:block w-16 shrink-0">
                        <span className="block h-1 rounded-full bg-muted overflow-hidden">
                          <span className="block h-full rounded-full transition-all" style={{ width: `${barW}%`, backgroundColor: palette[i % palette.length], opacity: 0.7 }} />
                        </span>
                      </span>
                      <span className="text-muted-foreground/60 tabular-nums w-8 text-right shrink-0">{pct.toFixed(1)}%</span>
                      <span className="font-mono tabular-nums text-foreground/80 text-right shrink-0 min-w-[80px]">{formatPeso(row.value)}</span>
                      {!isLeaf && <ChevronRight className="h-2.5 w-2.5 text-muted-foreground/20 group-hover:text-muted-foreground/60 shrink-0 transition-colors" />}
                    </button>
                  </div>
                );
              })}
              {rows.length > 10 && (
                <p className="text-[9px] text-muted-foreground/40 pl-6 pt-0.5">
                  +{rows.length - 10} more {LEVEL_LABELS[currentLevel].toLowerCase()}s not shown
                </p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
