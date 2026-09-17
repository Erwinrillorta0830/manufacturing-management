// components/SalesmanChart.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ChartEmptyState } from './ChartEmptyState';
import { formatPeso } from '../utils';
import type { SalesmanARData } from '../types';

interface SalesmanChartProps {
  data: SalesmanARData[];
  isFiltered?: boolean;
  selectedSalesman?: string;
  onSalesmanSelect?: (salesman: string) => void;
}

export function SalesmanChart({ data, isFiltered = false, selectedSalesman, onSalesmanSelect }: SalesmanChartProps) {
  const isEmpty = isFiltered && data.length === 0;

  return (
    <Card className="min-w-0 overflow-hidden w-full">
      <CardHeader>
        <CardTitle className="text-sm font-medium">Outstanding by Salesman</CardTitle>
      </CardHeader>
      <CardContent className="min-w-0 w-full">
        {isEmpty ? (
          <div className="h-[180px]">
            <ChartEmptyState message="No salesman data for the selected filters." />
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={data} margin={{ top: 0, right: 8, left: 16, bottom: 50 }} barCategoryGap="15%">
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(128,128,128,0.1)" />
                <XAxis
                  dataKey="name"
                  fontSize={10}
                  angle={-30}
                  textAnchor="end"
                  interval={0}
                  tickFormatter={(v) => v.length > 14 ? v.slice(0, 14) + '…' : v}
                />
                <YAxis
                  fontSize={10}
                  width={120}
                  tickFormatter={(v) =>
                    `₱${v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  }
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="bg-popover border border-border rounded-lg shadow-lg px-3 py-2 text-xs">
                        <p className="font-bold text-foreground mb-1">{label}</p>
                        <div className="space-y-1">
                          <p className="text-violet-500 dark:text-violet-400 font-semibold flex justify-between gap-4">
                            <span>Outstanding:</span>
                            <span>{formatPeso(payload[0]?.value as number)}</span>
                          </p>
                          {payload[1] && (
                            <p className="text-orange-500 dark:text-orange-400 font-semibold flex justify-between gap-4">
                              <span>Unposted Collections:</span>
                              <span>{formatPeso(payload[1]?.value as number)}</span>
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="value" name="Outstanding" radius={[3, 3, 0, 0]} maxBarSize={25} cursor="pointer">
                  {data.map((entry, index) => {
                    const isSelected = selectedSalesman === entry.name;
                    return (
                      <Cell
                        key={`cell-val-${index}`}
                        fill={isSelected ? '#f59e0b' : '#8b5cf6'}
                        onClick={() => onSalesmanSelect?.(isSelected ? '' : entry.name)}
                      />
                    );
                  })}
                </Bar>
                <Bar dataKey="unposted" name="Unposted Collections" radius={[3, 3, 0, 0]} maxBarSize={25} cursor="pointer">
                  {data.map((entry, index) => {
                    const isSelected = selectedSalesman === entry.name;
                    return (
                      <Cell
                        key={`cell-unp-${index}`}
                        fill={isSelected ? '#d97706' : '#f97316'}
                        onClick={() => onSalesmanSelect?.(isSelected ? '' : entry.name)}
                      />
                    );
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 pl-1 border-t border-border/40 pt-2">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0 bg-[#8b5cf6]" />
                <span className="text-[10px] text-muted-foreground font-semibold">Outstanding (Ledger)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0 bg-[#f97316]" />
                <span className="text-[10px] text-muted-foreground font-semibold">Unposted Collections</span>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}