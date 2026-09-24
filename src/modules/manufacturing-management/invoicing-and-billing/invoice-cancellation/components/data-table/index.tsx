"use client";

import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getFilteredRowModel,
  SortingState,
  getSortedRowModel,
  useReactTable,
  ColumnFiltersState,
  VisibilityState,
} from "@tanstack/react-table";

import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { columns as columnDefs } from "./columns";
import { SalesInvoice } from "../../types";
import { DataTablePagination } from "./pagination";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TableToolbar } from "./toolbar";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, Search, X } from "lucide-react";

interface DataTableProps {
  data: SalesInvoice[];
  onRequest: (invoice: SalesInvoice) => void;
}

export function InvoiceDataTable({ data, onRequest }: DataTableProps) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    [],
  );
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({});
  const [globalFilter, setGlobalFilter] = React.useState<string>("");
  const [pagination, setPagination] = React.useState({
    pageIndex: 0,
    pageSize: 10,
  });

  const columns = React.useMemo(() => columnDefs(onRequest), [onRequest]);

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      pagination,
      columnFilters,
      columnVisibility,
      globalFilter,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: (row, _columnId, filterValue: string) => {
      if (!filterValue) return true;
      const search = filterValue.toLowerCase().trim();
      const orig = row.original;
      return Boolean(
        orig.invoice_no?.toLowerCase().includes(search) ||
        orig.customer_name?.toLowerCase().includes(search) ||
        orig.customer_code?.toLowerCase().includes(search) ||
        orig.order_id?.toLowerCase().includes(search) ||
        orig.transaction_status?.toLowerCase().includes(search)
      );
    },
    getFilteredRowModel: getFilteredRowModel(),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onPaginationChange: setPagination,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-2">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search invoice, customer, S.O., status..."
              value={globalFilter}
              onChange={(event) => setGlobalFilter(event.target.value)}
              className="w-full pl-8 pr-8 h-9 text-xs"
            />
            {globalFilter && (
              <button
                type="button"
                onClick={() => setGlobalFilter("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
                title="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <TableToolbar table={table} />
        </div>
      </div>
      <div className="rounded-xl border bg-card shadow-xs overflow-x-auto min-h-[520px] transition-all duration-300">
        <Table className="transition-all duration-300">
          <TableHeader className="sticky top-0 z-10 bg-muted/40">
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
                        {globalFilter
                          ? "No matching invoices found"
                          : "No active invoices found"}
                      </span>
                      <span className="text-xs text-muted-foreground block max-w-sm">
                        {globalFilter
                          ? `No invoices found matching "${globalFilter}". Try adjusting your query.`
                          : "There are currently no invoices matching your criteria."}
                      </span>
                    </div>
                    {globalFilter && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setGlobalFilter("")}
                        className="text-xs h-8 mt-1 gap-1"
                      >
                        <X className="h-3.5 w-3.5" />
                        Clear Search
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
