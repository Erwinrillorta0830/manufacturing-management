"use client";

import * as React from "react";
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Building2 } from "lucide-react";
import { SupplierTableFilters } from "./table-filters";
import { DataTablePagination } from "./table-pagination";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  searchPlaceholder?: string;
  onSearchChange?: (value: string) => void;
  onRefresh?: () => void;
  isLoading?: boolean;
}

export function SupplierDataTable<TData, TValue>({
  columns,
  data,
  searchPlaceholder = "Search suppliers name...",
  onSearchChange,
  onRefresh,
  isLoading = false,
}: DataTableProps<TData, TValue>) {
  const [statusFilter, setStatusFilter] = React.useState("all");

  const filteredData = React.useMemo(() => {
    if (!data) return [];
    if (statusFilter === "active") {
      return data.filter((item) => Number((item as { isActive?: number }).isActive) === 1);
    }
    if (statusFilter === "inactive") {
      return data.filter((item) => Number((item as { isActive?: number }).isActive) === 0);
    }
    return data;
  }, [data, statusFilter]);

  const [pagination, setPagination] = React.useState({
    pageIndex: 0,
    pageSize: 10,
  });
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    [],
  );
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState({});
  const [globalFilter, setGlobalFilter] = React.useState("");

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: filteredData,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
    state: {
      sorting,
      pagination,
      columnFilters,
      columnVisibility,
      rowSelection,
      globalFilter,
    },
  });

  const filterValue =
    (table.getColumn("supplier_name")?.getFilterValue() as string) ?? "";

  const handleFilterChange = (val: string) => {
    table.getColumn("supplier_name")?.setFilterValue(val);
    if (onSearchChange) {
      onSearchChange(val);
    }
  };

  const handleStatusChange = (val: string) => {
    setStatusFilter(val);
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
  };

  return (
    <div className="space-y-4">
      {/* Filter Row Component */}
      <SupplierTableFilters
        searchValue={filterValue}
        onSearchChange={handleFilterChange}
        statusValue={statusFilter}
        onStatusChange={handleStatusChange}
        onRefresh={onRefresh}
        isLoading={isLoading}
        searchPlaceholder={searchPlaceholder}
      />

      {/* Table Section */}
      <div className="border rounded-xl shadow-sm overflow-hidden bg-card">
        <Table>
          <TableHeader className="bg-muted/50">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  className="group hover:bg-muted/30 transition-colors"
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-64 text-center"
                >
                  <div className="flex flex-col items-center justify-center text-muted-foreground">
                    <Building2 className="h-12 w-12 opacity-20 mb-2" />
                    <p>No suppliers found matching your criteria.</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        {/* Pagination */}
        <div className="border-t bg-muted/20 p-4">
          <DataTablePagination table={table} showSelectionInfo={false} />
        </div>
      </div>
    </div>
  );
}
