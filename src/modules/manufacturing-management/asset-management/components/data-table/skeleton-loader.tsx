import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function AssetTableSkeleton() {
  return (
    <div className="space-y-4">
      {/* Header & Actions Skeleton */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-9 rounded-md" />{" "}
          <Skeleton className="h-9 w-32 rounded-md" />{" "}
        </div>
      </div>
      {/* Search Bar Placeholder */}
      <Skeleton className="h-10 max-w-lg" />

      <div className="rounded-md border">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              {Array.from({ length: 8 }).map((_, i) => (
                <TableHead key={i}>
                  <Skeleton className="h-4 w-20" />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 8 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell>
                  <Skeleton className="h-10 w-10 rounded-md" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-32" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-24" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-24" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-12" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-20" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-20" />
                </TableCell>
                <TableCell className="text-right">
                  <Skeleton className="h-8 w-8 rounded-full ml-auto" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
