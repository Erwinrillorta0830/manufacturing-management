// components/APAgingChart.tsx — Bar chart for AP aging buckets (0-30, 31-60, 61-90, 91+)

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { ChartEmptyState } from './ChartEmptyState';
import { formatPeso } from '../utils';
import type { AgingBucket } from '../types';

const AGING_COLORS = ['#3b82f6', '#f59e0b', '#f97316', '#ef4444'];

interface APAgingChartProps {
  data:       AgingBucket[];
  isFiltered?: boolean;
}

export function APAgingChart({ data, isFiltered = false }: APAgingChartProps) {
  const hasData = data.some((d) => d.amount > 0);
  const isEmpty = isFiltered && !hasData;

  return (
    <Card className="shadow-none border-border h-full">
      <CardHeader className="border-b border-border/50 pb-3">
        <CardTitle className="text-sm font-bold">AP Aging Analysis</CardTitle>
      </CardHeader>
      <CardContent className="pt-4 h-[calc(100%-3.5rem)]">
        {isEmpty ? (
          <ChartEmptyState message="No aging data for the selected filters." />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ left: 8, right: 8, top: 4 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(128,128,128,0.1)" />
              <XAxis dataKey="range" fontSize={11} tick={{ fill: 'currentColor' }} />
              <YAxis
                fontSize={10}
                width={100}
                tickFormatter={(v) =>
                  v >= 1_000_000 ? `₱${(v / 1_000_000).toFixed(1)}M`
                  : v >= 1000    ? `₱${(v / 1000).toFixed(0)}k`
                  : `₱${v}`
                }
              />
              <Tooltip
                formatter={(val: number) => [formatPeso(val), 'Outstanding']}
                contentStyle={{
                  background: 'hsl(var(--popover))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 8,
                  fontSize: 12,
                  color: 'hsl(var(--popover-foreground))',
                }}
                labelStyle={{ color: 'hsl(var(--popover-foreground))', fontWeight: 600 }}
                itemStyle={{ color: 'hsl(var(--muted-foreground))' }}
              />
              <Bar dataKey="amount" radius={[4, 4, 0, 0]} maxBarSize={60}>
                {data.map((_, i) => (
                  <Cell key={i} fill={AGING_COLORS[i % AGING_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}