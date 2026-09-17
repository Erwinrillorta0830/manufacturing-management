// components/APStatusPieChart.tsx — Donut pie chart: invoice distribution by payment status

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { ChartEmptyState } from './ChartEmptyState';
import type { StatusEntry } from '../types';

const ALL_STATUSES: { name: string; color: string }[] = [
  { name: 'Paid',                     color: '#10b981' },
  { name: 'Unpaid',                   color: '#94a3b8' },
  { name: 'Partially Paid',           color: '#f59e0b' },
  { name: 'Unpaid | Overdue',         color: '#ef4444' },
  { name: 'Partially Paid | Overdue', color: '#f97316' },
  { name: 'Overdue',                  color: '#dc2626' },
];

interface APStatusPieChartProps {
  data:        StatusEntry[];
  isFiltered?: boolean;
}

export function APStatusPieChart({ data, isFiltered = false }: APStatusPieChartProps) {
  const isEmpty = isFiltered && data.length === 0;
  const total   = data.reduce((s, d) => s + d.value, 0);

  // Merge data into all-statuses list so all 4 always show in legend
  const legendEntries = ALL_STATUSES.map((s) => {
    const found = data.find((d) => d.name === s.name);
    return { ...s, value: found?.value ?? 0 };
  });

  // Only pass non-zero entries to the pie (zero slices break rendering)
  const chartData = legendEntries.filter((d) => d.value > 0);

  return (
    <Card className="shadow-none border-border w-full h-full">
      <CardHeader className="border-b border-border/50 pb-3">
        <CardTitle className="text-sm font-bold">Payment Status Distribution</CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        {isEmpty ? (
          <div className="h-[200px]">
            <ChartEmptyState message="No status data for the selected filters." />
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={chartData}
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={3}
                  dataKey="value"
                  stroke="none"
                >
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const e = payload[0].payload as StatusEntry;
                    return (
                      <div className="bg-popover border border-border rounded-lg shadow-lg px-3 py-2 text-xs space-y-0.5">
                        <p className="font-bold text-foreground">{e.name}</p>
                        <p className="text-muted-foreground">{e.value} invoice{e.value !== 1 ? 's' : ''}</p>
                        <p className="text-muted-foreground">{total > 0 ? ((e.value / total) * 100).toFixed(1) : '0.0'}% of total</p>
                      </div>
                    );
                  }}
                />
              </PieChart>
            </ResponsiveContainer>

            {/* Legend — always shows all 4 statuses */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 mt-3 px-2">
              {legendEntries.map((entry, i) => (
                <div key={i} className="flex items-center justify-between gap-2 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: entry.color, opacity: entry.value === 0 ? 0.3 : 1 }}
                    />
                    <span className={`text-xs truncate ${entry.value === 0 ? 'text-muted-foreground/50' : 'text-muted-foreground'}`}>
                      {entry.name}
                    </span>
                  </div>
                  <span className={`text-xs font-bold flex-shrink-0 ${entry.value === 0 ? 'text-muted-foreground/40' : 'text-foreground'}`}>
                    {entry.value}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}