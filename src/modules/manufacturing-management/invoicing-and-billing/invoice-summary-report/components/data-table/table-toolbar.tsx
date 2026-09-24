"use client";

import { Table } from "@tanstack/react-table";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTableViewOptions } from "./table-view-option";
import { DataTableFacetedFilter } from "./table-faceted-filter";
import { DataTableDateFilter } from "./table-date-filter";
import { DataTableTimeFilter } from "./table-time-filter";

interface DataTableToolbarProps<TData> {
  table: Table<TData>;
}

export function DataTableToolbar<TData>({
  table,
}: DataTableToolbarProps<TData>) {
  const isFiltered = table.getState().columnFilters.length > 0;

  return (
    <div className="flex items-center justify-between">
      <div className="flex flex-1 items-center space-x-2">
        {/* TEXT SEARCH: For Customer / Multi-field */}
        {table.getColumn("customer_name") && (
          <div className="relative w-full sm:w-64">
            <Input
              placeholder="Search customer, invoice, S.O..."
              value={
                (table.getColumn("customer_name")?.getFilterValue() as string) ??
                ""
              }
              onChange={(event) =>
                table
                  .getColumn("customer_name")
                  ?.setFilterValue(event.target.value)
              }
              className="h-8 w-full pr-7 text-xs"
            />
            {Boolean(table.getColumn("customer_name")?.getFilterValue()) && (
              <button
                type="button"
                onClick={() => table.getColumn("customer_name")?.setFilterValue("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
                title="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}

        {/* FACETED FILTER: For Status */}
        {table.getColumn("status") && (
          <DataTableFacetedFilter
            column={table.getColumn("status")}
            title="Status"
            options={[
              { label: "Pending", value: "PENDING" },
              { label: "Approved", value: "APPROVED" },
              { label: "Rejected", value: "REJECTED" },
            ]}
          />
        )}

        {/* FACETED FILTER: For Reason Type */}
        {table.getColumn("defect_reason") && (
          <DataTableFacetedFilter
            column={table.getColumn("defect_reason")}
            title="Type"
            options={[
              { label: "System Error", value: "System Error" },
              { label: "Printer Jam", value: "Printer Jam" },
              { label: "Wrong Price", value: "Wrong Price" },
              { label: "Typographical Error", value: "Typographical Error" },
            ]}
          />
        )}

        {/* FACETED FILTER: For Date */}
        {table.getColumn("date_time") && (
          <DataTableDateFilter
            column={table.getColumn("date_time")}
            title="Date Requested"
          />
        )}
        {/* FACETED FILTER: For Time*/}
        {table.getColumn("date_time") && (
          <DataTableTimeFilter
            column={table.getColumn("date_time")}
            title="Time Range"
          />
        )}

        {/* RESET BUTTON: Appears only when filters are active */}
        {isFiltered && (
          <Button
            variant="ghost"
            onClick={() => table.resetColumnFilters()}
            className="h-8 px-2 lg:px-3"
          >
            Reset
            <X className="ml-2 h-4 w-4" />
          </Button>
        )}
      </div>
      {/* VIEW OPTIONS: Column Toggle */}
      <DataTableViewOptions table={table} />
    </div>
  );
}
