// components/ChartEmptyState.tsx
// Reusable empty state for charts when filters return no data.

import { SearchX } from 'lucide-react';

interface ChartEmptyStateProps {
  message?: string;
}

export function ChartEmptyState({ message = 'No records found for the selected filters.' }: ChartEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full w-full gap-2 py-8 text-center">
      <SearchX className="w-8 h-8 text-muted-foreground/40" />
      <p className="text-sm font-medium text-muted-foreground">No data available</p>
      <p className="text-xs text-muted-foreground/60 max-w-[200px]">{message}</p>
    </div>
  );
}