"use client";

import * as React from "react";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  SortingState,
  ColumnFiltersState,
  useReactTable,
  OnChangeFn,
} from "@tanstack/react-table";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DataTablePagination } from "./table-pagination";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  columnFilters: ColumnFiltersState;
  onColumnFiltersChange?: OnChangeFn<ColumnFiltersState>;
  data: TData[];
  tableMeta?: Record<string, unknown>; // expects { onView?: (row: TData) => void }
  sorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;
}

export function DiscountTypeDataTable<TData, TValue>({
  columns,
  data,
  columnFilters,
  onColumnFiltersChange,
  tableMeta,
  sorting,
  onSortingChange,
}: DataTableProps<TData, TValue>) {
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 10 });
  const [localSorting, setLocalSorting] = React.useState<SortingState>([]);

  const activeSorting = sorting !== undefined ? sorting : localSorting;
  const activeOnSortingChange = onSortingChange !== undefined ? onSortingChange : setLocalSorting;

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    state: { pagination, sorting: activeSorting, columnFilters },
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: activeOnSortingChange,
    onColumnFiltersChange: onColumnFiltersChange,
    getFilteredRowModel: getFilteredRowModel(),
    onPaginationChange: setPagination,
    getSortedRowModel: getSortedRowModel(),
    meta: {
      ...tableMeta,
    },
  });

  return (
    <div className="space-y-4">
      <div className="rounded-md border">
        <Table>
          <TableHeader className="bg-muted/50">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="font-semibold">
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>

          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() => (table.options.meta as { onView?: (data: TData) => void })?.onView?.(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  No records found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <DataTablePagination table={table} />
    </div>
  );
}
