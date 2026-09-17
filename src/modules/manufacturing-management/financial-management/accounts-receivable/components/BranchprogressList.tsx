// components/ClusterProgressList.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartEmptyState } from './ChartEmptyState';
import type { NamedAmount } from '../types';

interface ClusterProgressListProps {
  data: NamedAmount[];
  isFiltered?: boolean;
}

export function ClusterProgressList({ data, isFiltered = false }: ClusterProgressListProps) {
  const isEmpty = isFiltered && data.length === 0;

  return (
    <Card className="min-w-0 overflow-hidden w-full">
      <CardHeader>
        <CardTitle className="text-sm font-medium">Outstanding by Cluster</CardTitle>
      </CardHeader>
      <CardContent>
        {isEmpty ? (
          <div className="h-[160px]">
            <ChartEmptyState message="No cluster data for the selected filters." />
          </div>
        ) : (
          <div className="space-y-3 mt-1">
            {data.map((branch, i) => {
              const maxAmount = data[0]?.amount || 1;
              const pct   = Math.max((branch.amount / maxAmount) * 100, 2);
              const hue   = 258 - i * 12;
              const color = `hsl(${hue}, 68%, 62%)`;
              return (
                <div key={i}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-medium text-muted-foreground truncate max-w-[55%]" title={branch.name}>
                      {branch.name}
                    </span>
                    <span className="text-[11px] font-bold tabular-nums" style={{ color }}>
                      ₱{branch.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${pct}%`,
                        background: `linear-gradient(90deg, hsl(${hue}, 68%, 55%), hsl(${hue}, 68%, 72%))`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}