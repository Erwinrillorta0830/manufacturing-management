// components/OperationBreakdownChart.tsx
'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import { ChevronRight, ArrowLeft } from 'lucide-react';
import { formatPeso } from '../utils';
import type { OperationBreakdown, Invoice } from '../types';

interface Props {
  data: OperationBreakdown[];
  invoices: Invoice[];           // full client-side invoice list (salesType attached)
  isFiltered?: boolean;
}

const OP_COLORS = [
  'hsl(215,75%,55%)',
  'hsl(175,60%,44%)',
  'hsl(258,62%,58%)',
  'hsl(35,80%,52%)',
  'hsl(340,65%,52%)',
  'hsl(160,58%,42%)',
  'hsl(290,52%,55%)',
  'hsl(55,72%,47%)',
];

const CX_COLORS = [
  'hsl(258,62%,58%)',
  'hsl(215,75%,55%)',
  'hsl(175,60%,44%)',
  'hsl(35,80%,52%)',
  'hsl(340,65%,52%)',
  'hsl(160,58%,42%)',
  'hsl(290,52%,55%)',
  'hsl(55,72%,47%)',
];

/** Compact peso formatter for axis ticks */
function shortPeso(v: number): string {
  if (v >= 1_000_000) return `₱${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `₱${(v / 1_000).toFixed(0)}K`;
  return `₱${v.toFixed(0)}`;
}

export function OperationBreakdownChart({ data, invoices, isFiltered = false }: Props) {
  const [selectedId, setSelectedId] = useState<number | null | undefined>(undefined); // undefined = none selected

  const isEmpty = data.length === 0;

  // ── Operation bar data ───────────────────────────────────────────────────
  const opChartData = data.map((op) => ({
    id:    op.id,
    name:  op.name,
    value: op.totalOutstanding,
    count: op.count,
    code:  op.code,
  }));

  // ── Customer drill-down data ─────────────────────────────────────────────
  const drillCustomers = (() => {
    if (selectedId === undefined) return [];
    const subset = invoices.filter((inv) => inv.salesType === selectedId);
    const agg: Record<string, number> = {};
    for (const inv of subset) {
      agg[inv.customer] = (agg[inv.customer] || 0) + inv.outstanding;
    }
    return Object.entries(agg)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 12);
  })();

  const selectedOp = data.find((d) => d.id === selectedId);
  const isDrilling = selectedId !== undefined;

  // ── Row height heuristic ─────────────────────────────────────────────────
  const opH   = Math.max(140, opChartData.length * 36);
  const cxH   = Math.max(140, drillCustomers.length * 32);

  return (
    <Card className="min-w-0 overflow-hidden w-full border-border/60">
      {/* ── Compact header ── */}
      <CardHeader className="py-2 px-4 border-b border-border/40 flex flex-row items-center justify-between gap-2 space-y-0">
        <div className="flex items-center gap-2 min-w-0">
          {isDrilling && (
            <button
              onClick={() => setSelectedId(undefined)}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors shrink-0"
            >
              <ArrowLeft className="h-3 w-3" />
              Back
            </button>
          )}
          {isDrilling && <span className="text-muted-foreground/40 text-[10px]">/</span>}
          <CardTitle className="text-xs font-semibold tracking-wide uppercase text-muted-foreground truncate">
            {isDrilling
              ? <>Operation · <span className="text-foreground">{selectedOp?.name ?? '—'}</span></>
              : 'By Operation Type'}
          </CardTitle>
        </div>
        {!isDrilling && !isEmpty && (
          <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
            {data.length} ops · {data.reduce((s, o) => s + o.count, 0)} inv
          </span>
        )}
        {isDrilling && (
          <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
            {drillCustomers.length} customers · {selectedOp?.count ?? 0} inv
          </span>
        )}
      </CardHeader>

      <CardContent className="p-0">
        {isEmpty ? (
          <div className="flex items-center justify-center h-24 text-xs text-muted-foreground">
            {isFiltered ? 'No operations match the active filters.' : 'No operation data.'}
          </div>
        ) : !isDrilling ? (
          /* ── Operation bars view ── */
          <div className="px-3 pt-3 pb-2">
            <ResponsiveContainer width="100%" height={opH}>
              <BarChart
                layout="vertical"
                data={opChartData}
                margin={{ top: 0, right: 12, left: 4, bottom: 0 }}
                barCategoryGap="30%"
              >
                <CartesianGrid strokeDasharray="2 2" horizontal={false} stroke="rgba(128,128,128,0.08)" />
                <XAxis
                  type="number"
                  fontSize={9}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={shortPeso}
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  fontSize={9}
                  width={90}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  tickFormatter={(v: string) => (v.length > 14 ? v.slice(0, 14) + '…' : v)}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(128,128,128,0.06)' }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const e = payload[0].payload as typeof opChartData[0];
                    return (
                      <div className="bg-popover border border-border rounded shadow-md px-2.5 py-1.5 text-[10px] space-y-0.5">
                        <p className="font-semibold text-foreground">
                          {e.name}{e.code ? <span className="font-normal text-muted-foreground ml-1">({e.code})</span> : null}
                        </p>
                        <p className="font-mono text-primary">{formatPeso(e.value)}</p>
                        <p className="text-muted-foreground">{e.count} invoice{e.count !== 1 ? 's' : ''}</p>
                        <p className="text-muted-foreground/60 italic">Click to drill down →</p>
                      </div>
                    );
                  }}
                />
                <Bar
                  dataKey="value"
                  radius={[0, 3, 3, 0]}
                  maxBarSize={22}
                  cursor="pointer"
                  onClick={(entry) => setSelectedId((entry as typeof opChartData[0]).id)}
                >
                  {opChartData.map((_, i) => (
                    <Cell key={i} fill={OP_COLORS[i % OP_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            {/* Compact legend as clickable pills */}
            <div className="flex flex-wrap gap-1.5 mt-1 pl-1">
              {opChartData.map((op, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedId(op.id)}
                  className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] border border-border/50 hover:border-border hover:bg-muted/40 transition-colors"
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: OP_COLORS[i % OP_COLORS.length] }}
                  />
                  <span className="text-muted-foreground truncate max-w-[80px]">{op.name}</span>
                  <ChevronRight className="h-2.5 w-2.5 text-muted-foreground/40" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* ── Customer drill-down view ── */
          <div className="px-3 pt-3 pb-2">
            {drillCustomers.length === 0 ? (
              <div className="flex items-center justify-center h-20 text-xs text-muted-foreground">
                No invoices found for this operation.
              </div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={cxH}>
                  <BarChart
                    layout="vertical"
                    data={drillCustomers}
                    margin={{ top: 0, right: 12, left: 4, bottom: 0 }}
                    barCategoryGap="30%"
                  >
                    <CartesianGrid strokeDasharray="2 2" horizontal={false} stroke="rgba(128,128,128,0.08)" />
                    <XAxis
                      type="number"
                      fontSize={9}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={shortPeso}
                      tick={{ fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      fontSize={9}
                      width={110}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: 'hsl(var(--muted-foreground))' }}
                      tickFormatter={(v: string) => (v.length > 18 ? v.slice(0, 18) + '…' : v)}
                    />
                    <Tooltip
                      cursor={{ fill: 'rgba(128,128,128,0.06)' }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const e = payload[0].payload as { name: string; value: number };
                        return (
                          <div className="bg-popover border border-border rounded shadow-md px-2.5 py-1.5 text-[10px] space-y-0.5">
                            <p className="font-semibold text-foreground">{e.name}</p>
                            <p className="font-mono text-primary">{formatPeso(e.value)}</p>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="value" radius={[0, 3, 3, 0]} maxBarSize={20}>
                      {drillCustomers.map((_, i) => (
                        <Cell key={i} fill={CX_COLORS[i % CX_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>

                {/* Inline totals list under chart */}
                <div className="mt-2 border-t border-border/30 pt-2 space-y-0.5">
                  {drillCustomers.slice(0, 8).map((cx, i) => {
                    const pct = selectedOp
                      ? ((cx.value / selectedOp.totalOutstanding) * 100).toFixed(1)
                      : '0';
                    return (
                      <div key={i} className="flex items-center gap-2 text-[9px]">
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ backgroundColor: CX_COLORS[i % CX_COLORS.length] }}
                        />
                        <span className="text-muted-foreground truncate flex-1" title={cx.name}>{cx.name}</span>
                        <span className="font-mono tabular-nums text-foreground/80">{formatPeso(cx.value)}</span>
                        <span className="text-muted-foreground/50 tabular-nums w-8 text-right">{pct}%</span>
                      </div>
                    );
                  })}
                  {drillCustomers.length > 8 && (
                    <p className="text-[9px] text-muted-foreground/50 pl-3.5">
                      +{drillCustomers.length - 8} more customers
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
