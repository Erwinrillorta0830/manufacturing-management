import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface DataTableSkeletonProps {
  columnCount?: number;
  rowCount?: number;
  searchable?: boolean;
}

export function DataTableSkeleton({
  columnCount = 8,
  rowCount = 8,
  searchable = true,
}: DataTableSkeletonProps) {
  return (
    <div className="space-y-4">
      {/* Header & Actions Skeleton */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-9 rounded-md" />
          <Skeleton className="h-9 w-32 rounded-md" />
        </div>
      </div>
      
      {/* Search Bar Placeholder */}
      {searchable && <Skeleton className="h-10 max-w-lg" />}

      <div className="rounded-md border">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              {Array.from({ length: columnCount }).map((_, i) => (
                <TableHead key={i}>
                  <Skeleton className="h-4 w-20" />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: rowCount }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: columnCount }).map((_, j) => (
                  <TableCell key={j}>
                    {j === 0 ? (
                      <Skeleton className="h-10 w-10 rounded-md" />
                    ) : j === columnCount - 1 ? (
                      <Skeleton className="h-8 w-8 rounded-full ml-auto" />
                    ) : (
                      <Skeleton className="h-4 w-full max-w-[100px]" />
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
