"use client";

import * as React from "react";

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  getPaginationRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  SortingState,
  ColumnFiltersState,
  VisibilityState,
  getFacetedUniqueValues,
  getFacetedRowModel,
} from "@tanstack/react-table";

import { motion, AnimatePresence } from "framer-motion";
import { FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";

import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DataTablePagination } from "./table-pagination";
import { DataTableToolbar } from "./table-toolbar";

interface DataTableProps<TData> {
  columns: import("@tanstack/react-table").ColumnDef<TData, unknown>[];
  data: TData[];
  columnFilters: ColumnFiltersState;
  setColumnFilters: React.Dispatch<React.SetStateAction<ColumnFiltersState>>;
}

export function InvoiceReportTable<
  TData,
>({
  columns,
  data,
  columnFilters,
  setColumnFilters,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({});

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  });

  const isFiltered = columnFilters.length > 0;

  return (
    <div className="space-y-4">
      <DataTableToolbar table={table} />
      <div className="rounded-xl border bg-card shadow-xs overflow-x-auto min-h-[520px] transition-all duration-300">
        <Table className="transition-all duration-300">
          <TableHeader className="bg-muted/40">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                <AnimatePresence initial={false}>
                  {headerGroup.headers.map((header) => (
                    <motion.th
                      key={header.id}
                      layout
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.2, ease: "easeOut" }}
                      className="h-11 px-2 text-left align-middle font-semibold text-xs uppercase tracking-wider text-muted-foreground whitespace-nowrap"
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                    </motion.th>
                  ))}
                </AnimatePresence>
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row, index) => (
                <motion.tr
                  key={row.id}
                  layout="position"
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.18,
                    delay: Math.min(index * 0.02, 0.2),
                    ease: "easeOut",
                  }}
                  className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted h-12"
                >
                  <AnimatePresence initial={false}>
                    {row.getVisibleCells().map((cell) => (
                      <motion.td
                        key={cell.id}
                        layout
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className="p-2 align-middle py-2.5 whitespace-nowrap"
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </motion.td>
                    ))}
                  </AnimatePresence>
                </motion.tr>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={table.getVisibleLeafColumns().length || columns.length}
                  className="h-96 text-center"
                >
                  <motion.div
                    initial={{ opacity: 0, scale: 0.94, y: 8 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ duration: 0.25, ease: "easeOut" }}
                    className="flex flex-col items-center justify-center gap-3 text-muted-foreground py-12"
                  >
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/60 border shadow-2xs">
                      <FileText className="h-7 w-7 text-muted-foreground/60" />
                    </div>
                    <div className="space-y-1">
                      <span className="text-sm font-semibold text-foreground block">
                        {isFiltered ? "No matching records found" : "No records found"}
                      </span>
                      <span className="text-xs text-muted-foreground block max-w-sm">
                        {isFiltered
                          ? "No invoice records match your active search or filters. Try adjusting or clearing your filters."
                          : "There are currently no invoice report records available."}
                      </span>
                    </div>
                    {isFiltered && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => table.resetColumnFilters()}
                        className="text-xs h-8 mt-1 gap-1"
                      >
                        <X className="h-3.5 w-3.5" />
                        Clear Filters
                      </Button>
                    )}
                  </motion.div>
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
