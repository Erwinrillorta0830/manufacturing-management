// components/APSupplierChart.tsx — Horizontal bar chart: payables per supplier (full width)

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList,
} from 'recharts';
import { ChartEmptyState } from './ChartEmptyState';
import { formatPeso, COLORS } from '../utils';
import type { SupplierEntry } from '../types';

interface APSupplierChartProps {
  data:        SupplierEntry[];
  isFiltered?: boolean;
}

export function APSupplierChart({ data, isFiltered = false }: APSupplierChartProps) {
  const isEmpty  = isFiltered && data.length === 0;
  // Dynamic height: 48px per bar minimum, at least 300px
  const chartH   = Math.max(300, data.length * 48);

  return (
    <Card className="shadow-none border-border w-full">
      <CardHeader className="border-b border-border/50 pb-3">
        <CardTitle className="text-sm font-bold">Payables per Supplier</CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        {isEmpty ? (
          <div className="h-[300px]">
            <ChartEmptyState message="No supplier data for the selected filters." />
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={chartH}>
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 4, right: 160, left: 8, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(128,128,128,0.1)" />
              <XAxis
                type="number"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, opacity: 0.5 }}
                tickFormatter={(v) =>
                  v >= 1_000_000 ? `₱${(v / 1_000_000).toFixed(1)}M`
                  : v >= 1000    ? `₱${(v / 1000).toFixed(0)}k`
                  : `₱${v}`
                }
              />
              <YAxis
                type="category"
                dataKey="name"
                axisLine={false}
                tickLine={false}
                width={180}
                tick={{ fontSize: 11, fill: 'currentColor', opacity: 0.8 }}
                tickFormatter={(v: string) => v.length > 22 ? v.slice(0, 22) + '…' : v}
              />
              <Tooltip
                cursor={{ fill: 'rgba(128,128,128,0.05)' }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div className="bg-popover border border-border rounded-lg shadow-lg px-3 py-2 text-xs space-y-0.5">
                      <p className="font-bold text-foreground">{label}</p>
                      <p className="text-muted-foreground">
                        Outstanding : <span className="font-semibold text-foreground">{formatPeso(payload[0].value as number)}</span>
                      </p>
                    </div>
                  );
                }}
              />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={28} minPointSize={3}>
                {data.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
                <LabelList
                  dataKey="value"
                  position="right"
                  offset={8}
                  fontSize={11}
                  formatter={(v: number) =>
                    v >= 1_000_000 ? `₱${(v / 1_000_000).toFixed(2)}M`
                    : v >= 1000    ? `₱${(v / 1000).toFixed(1)}k`
                    : formatPeso(v)
                  }
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}