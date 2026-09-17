// components/CustomerOutstandingChart.tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts';
import { ChartEmptyState } from './ChartEmptyState';
import { formatPeso } from '../utils';
import type { NamedAmount } from '../types';

interface CustomerOutstandingChartProps {
  data: NamedAmount[];
  isFiltered?: boolean;
}

const BAR_COLORS = [
  '#6366f1','#8b5cf6','#a78bfa','#818cf8','#7c3aed',
  '#9333ea','#a855f7','#c084fc','#7e22ce','#6d28d9',
];

export function CustomerOutstandingChart({ data, isFiltered = false }: CustomerOutstandingChartProps) {
  const isEmpty = isFiltered && data.length === 0;
  const top10   = data.slice(0, 10);

  return (
    <Card className="shadow-none min-w-0 overflow-hidden w-full">
      <CardHeader className="border-b border-border/50 pb-3">
        <CardTitle className="text-sm font-semibold">Outstanding by Customer</CardTitle>
      </CardHeader>
      <CardContent className="pt-4 h-[260px] min-w-0 w-full">
        {isEmpty ? (
          <ChartEmptyState message="No customer data for the selected filters." />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={top10} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(128,128,128,0.1)" />
              <XAxis
                type="number"
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'currentColor', fontSize: 10, opacity: 0.5 }}
                tickFormatter={(v) =>
                  `₱${v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                }
              />
              <YAxis
                type="category"
                dataKey="name"
                axisLine={false}
                tickLine={false}
                width={150}
                tick={{ fill: 'currentColor', fontSize: 10, opacity: 0.7 }}
                tickFormatter={(v: string) => v.length > 20 ? v.slice(0, 20) + '…' : v}
              />
              <Tooltip
                cursor={{ fill: 'rgba(128,128,128,0.05)' }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div className="bg-popover border border-border rounded-lg shadow-lg px-3 py-2 text-xs">
                      <p className="font-bold text-foreground mb-1">{label}</p>
                      <p className="font-semibold" style={{ color: '#8b5cf6' }}>
                        {formatPeso(payload[0].value as number)}
                      </p>
                    </div>
                  );
                }}
              />
              <Bar dataKey="amount" radius={[0, 4, 4, 0]} maxBarSize={20}>
                {top10.map((_, i) => (
                  <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}