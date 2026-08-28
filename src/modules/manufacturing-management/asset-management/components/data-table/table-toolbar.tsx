"use client";

import { Table } from "@tanstack/react-table";
import { Settings2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DataTableFacetedFilter } from "./table-faceted-filter";

const conditionOptions = [
  { label: "Good", value: "Good" },
  { label: "Bad", value: "Bad" },
  { label: "Under Maintenance", value: "Under Maintenance" },
  { label: "Discontinued", value: "Discontinued" },
];

const originOptions = [
  { label: "New", value: "New" },
  { label: "Existing", value: "Existing" },
];

interface TableToolbarProps {
  table: Table<unknown>;
}

export function TableToolbar({ table }: TableToolbarProps) {
  const isFiltered = table.getState().columnFilters.length > 0;

  return (
    <div className="flex items-center justify-between gap-2 pb-4">
      <div className="flex flex-1 items-center gap-2">
        {/* 1. Global/Column Search Input */}
        <Input
          placeholder="Filter assets..."
          value={(table.getColumn("item_name")?.getFilterValue() as string) ?? ""}
          onChange={(event) =>
            table.getColumn("item_name")?.setFilterValue(event.target.value)
          }
          className="h-9 w-37.5 lg:w-62.5 text-xs"
        />

        {/* 2. Faceted Filter for Origin */}
        {table.getColumn("asset_origin") && (
          <DataTableFacetedFilter
            column={table.getColumn("asset_origin")}
            title="Origin"
            options={originOptions}
          />
        )}

        {/* 3. The Combobox (Faceted Filter for Condition) */}
        {table.getColumn("condition") && (
          <DataTableFacetedFilter
            column={table.getColumn("condition")}
            title="Condition"
            options={conditionOptions}
          />
        )}

        {/* 3. Reset Button (shows only when filters are active) */}
        {isFiltered && (
          <Button
            variant="ghost"
            onClick={() => table.resetColumnFilters()}
            className="h-9 px-2 lg:px-3"
          >
            Reset
            <X className="ml-2 h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Your existing Column Visibility Toggle */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-9 ml-auto">
            <Settings2 className="mr-2 h-4 w-4" />
            <span className="hidden lg:inline">View</span>
            <span className="lg:hidden">Columns</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {table
            .getAllColumns()
            .filter(
              (column) =>
                typeof column.accessorFn !== "undefined" && column.getCanHide(),
            )
            .map((column) => {
              const label =
                (column.columnDef.meta as Record<string, unknown>)?.label ??
                (typeof column.columnDef.header === "string"
                  ? column.columnDef.header
                  : column.id);
              return (
                <DropdownMenuCheckboxItem
                  key={column.id}
                  className="capitalize"
                  checked={column.getIsVisible()}
                  onCheckedChange={(value) => column.toggleVisibility(!!value)}
                >
                  {(label as string).replace(/_/g, " ")}
                </DropdownMenuCheckboxItem>
              );
            })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
