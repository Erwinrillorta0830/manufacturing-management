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
import { DataTableFacetedFilter, DataTableDateFilter } from "./table-faceted-filter";
import { useState } from "react";
import ViewAssetModal from "../modals/AssetViewModal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, X } from "lucide-react";

import { AssetTableData } from "../../types";

const conditionOptions = [
  { label: "Good", value: "Good" },
  { label: "Bad", value: "Bad" },
  { label: "Under Maintenance", value: "Under Maintenance" },
  { label: "Discontinued", value: "Discontinued" },
];

interface DataTableProps<TData extends AssetTableData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  columnFilters: ColumnFiltersState;
  onColumnFiltersChange?: OnChangeFn<ColumnFiltersState>;
  data: TData[];
  tableMeta?: Record<string, unknown>;
}

export function AssetDataTable<TData extends AssetTableData, TValue>({
  columns,
  data,
  columnFilters,
  onColumnFiltersChange,
  tableMeta,
}: DataTableProps<TData, TValue>) {
  const [pagination, setPagination] = React.useState({
    pageIndex: 0,
    pageSize: 10,
  });
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [selectedAsset, setSelectedAsset] = useState<TData | null>(null);
  const [isViewOpen, setIsViewOpen] = useState(false);

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    state: {
      pagination,
      sorting,
      columnFilters,
    },
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: onColumnFiltersChange,
    getFilteredRowModel: getFilteredRowModel(),
    onPaginationChange: setPagination,
    getSortedRowModel: getSortedRowModel(),
    meta: {
      ...tableMeta,
      onView: (asset: TData) => {
        setSelectedAsset(asset);
        setIsViewOpen(true);
      },
    },
  });

  const currentProjectionDate = (tableMeta?.projectionDate as Date) || new Date();
  const isFiltered = table.getState().columnFilters.length > 0;

  // Generate unique departments for the faceted filter
  const departments = React.useMemo(() => {
    const uniqueDepartments = new Set(
      data
        .map((d) => (d.department_name && d.department_name.trim()) || "Unassigned")
        .filter(Boolean),
    );
    return Array.from(uniqueDepartments).map((d) => ({
      label: d as string,
      value: d as string,
    }));
  }, [data]);

  // Generate unique classifications for the faceted filter
  const classifications = React.useMemo(() => {
    const uniqueClassifications = new Set(
      data
        .map((d) => (d.classification_name && d.classification_name.trim()) || "N/A")
        .filter(Boolean),
    );
    return Array.from(uniqueClassifications).map((c) => ({
      label: c as string,
      value: c as string,
    }));
  }, [data]);

  return (
    <div className="space-y-4">
      {/* Search Bar & Multi-Select Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search items..."
            value={
              (table.getColumn("item_name")?.getFilterValue() as string) ?? ""
            }
            onChange={(event) =>
              table.getColumn("item_name")?.setFilterValue(event.target.value)
            }
            className="pl-8 h-9 text-xs"
          />
        </div>

        {table.getColumn("department_name") && (
          <DataTableFacetedFilter
            column={table.getColumn("department_name")}
            title="Department"
            options={departments}
          />
        )}

        {table.getColumn("classification_name") && (
          <DataTableFacetedFilter
            column={table.getColumn("classification_name")}
            title="Classification"
            options={classifications}
          />
        )}

        {table.getColumn("condition") && (
          <DataTableFacetedFilter
            column={table.getColumn("condition")}
            title="Condition"
            options={conditionOptions}
          />
        )}

        {table.getColumn("date_acquired") && (
          <DataTableDateFilter
            column={table.getColumn("date_acquired")}
            title="Date Acquired"
          />
        )}

        {isFiltered && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => table.resetColumnFilters()}
            className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="mr-1.5 h-3.5 w-3.5" />
            Reset
          </Button>
        )}
      </div>
      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader className="bg-muted/50">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="font-semibold">
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
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
                  className="h-24 text-center"
                >
                  No assets found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {/* Pagination */}
      <DataTablePagination table={table} />

      <ViewAssetModal
        asset={selectedAsset as TData}
        isOpen={isViewOpen}
        onOpenChange={setIsViewOpen}
        projectionDate={currentProjectionDate}
      />
    </div>
  );
}
