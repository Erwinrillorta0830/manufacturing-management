"use client";

import * as React from "react";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  RowSelectionState,
  useReactTable,
  SortingState,
  getSortedRowModel,
  ColumnFiltersState,
  getFilteredRowModel,
  VisibilityState,
} from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DataTablePagination } from "@/modules/manufacturing-management/invoicing-and-billing/invoice-cancellation/components/data-table/pagination";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency } from "@/lib/utils";
import {
  ApprovalAction, // 🚀 FIX: Changed from InvoiceAction to ApprovalAction
  InvoiceRow,
} from "@/modules/manufacturing-management/invoicing-and-billing/invoice-cancellation-approval/types";
import { TableToolbar } from "./table-view-option";
import { TasksTableActionBar } from "./table-action-bar";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, Loader2, Search, X } from "lucide-react";

interface ApprovalDataTableProps {
  data: InvoiceRow[];
  isLoading: boolean;
  // 🚀 FIX: Updated the type here as well
  onBulkAction: (action: ApprovalAction, rows: InvoiceRow[]) => void;
  columns: ColumnDef<InvoiceRow>[];
  currentTab: string;
  onTabChange: (val: string) => void;
}

export function ApprovalDataTable({
  data,
  isLoading,
  onBulkAction,
  columns,
  currentTab,
  onTabChange,
}: ApprovalDataTableProps) {
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    [],
  );
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({});
  const [globalFilter, setGlobalFilter] = React.useState<string>("");

  const filteredData = React.useMemo(() => {
    return data.filter((row) => row.status === currentTab);
  }, [data, currentTab]);

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable<InvoiceRow>({
    data: filteredData,
    columns,
    state: {
      rowSelection,
      sorting,
      columnFilters,
      columnVisibility,
      globalFilter,
    },

    autoResetPageIndex: false,
    autoResetExpanded: false,

    enableRowSelection: (row) => row.original.status === "PENDING",
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: (row, _columnId, filterValue: string) => {
      if (!filterValue) return true;
      const search = filterValue.toLowerCase().trim();
      const orig = row.original;
      return Boolean(
        orig.invoice_no?.toLowerCase().includes(search) ||
        orig.customer_name?.toLowerCase().includes(search) ||
        orig.customer_code?.toLowerCase().includes(search) ||
        orig.sales_order_id?.toLowerCase().includes(search) ||
        orig.reason_code?.toLowerCase().includes(search) ||
        orig.remarks?.toLowerCase().includes(search) ||
        orig.status?.toLowerCase().includes(search)
      );
    },
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const selectedRows = table.getSelectedRowModel().rows;
  const selectedCount = selectedRows.length;
  const selectedTotal = selectedRows.reduce(
    (sum, row) => sum + row.original.total_amount,
    0,
  );

  // FIX: Clear row selection & page index when currentTab changes
  React.useEffect(() => {
    setRowSelection({});
    table.setPageIndex(0);
  }, [currentTab, table]);

  return (
    <div className="space-y-4">
      <Tabs value={currentTab} onValueChange={onTabChange} className="w-full">
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="PENDING" className="transition-all">Pending</TabsTrigger>
            <TabsTrigger value="APPROVED" className="transition-all">Approved</TabsTrigger>
          </TabsList>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-2">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search invoice, customer, S.O., reason..."
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

        {/* BULK ACTION TOOLBAR */}
        <AnimatePresence>
          {selectedCount > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              className="flex items-center justify-between px-4 py-2 border rounded-xl bg-muted/60 backdrop-blur-xs shadow-2xs mt-2"
            >
              <div className="flex items-center gap-4">
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                  {selectedCount} selected
                </span>
                <div className="text-sm font-semibold tabular-nums text-foreground">
                  Total: {formatCurrency(selectedTotal)}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <TasksTableActionBar table={table} onBulkAction={onBulkAction} />

        <AnimatePresence mode="wait">
          <motion.div
            key={currentTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
          >
            <TabsContent value={currentTab} forceMount className="mt-2 focus-visible:outline-none">
              <div className="overflow-x-auto rounded-xl border bg-card shadow-xs min-h-[520px] transition-all duration-300">
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
                    {isLoading ? (
                      <TableRow>
                        <TableCell
                          colSpan={table.getVisibleLeafColumns().length || columns.length}
                          className="h-96 text-center"
                        >
                          <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                            <Loader2 className="h-6 w-6 animate-spin text-primary" />
                            <span className="text-xs font-medium">Loading approval requests...</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : table.getRowModel().rows.length > 0 ? (
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
                          data-state={row.getIsSelected() && "selected"}
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
                                  ? "No matching records found"
                                  : currentTab === "PENDING"
                                  ? "No pending cancellation requests"
                                  : "No approved cancellation requests"}
                              </span>
                              <span className="text-xs text-muted-foreground block max-w-sm">
                                {globalFilter
                                  ? `No records found matching "${globalFilter}". Try adjusting your query.`
                                  : currentTab === "PENDING"
                                  ? "All cancellation requests have been reviewed and acted upon."
                                  : "Approved cancellation requests will appear here once approved."}
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
              <div className="mt-3">
                <DataTablePagination table={table} />
              </div>
            </TabsContent>
          </motion.div>
        </AnimatePresence>
      </Tabs>
    </div>
  );
}