// src/modules/financial-management/line-discount/components/data-table/table-toolbar.tsx
"use client";

import type { Table } from "@tanstack/react-table";
import { Plus, Settings2, X } from "lucide-react";
import type { LineDiscountRow } from "../../type";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface LineDiscountTableMeta {
  onCreate: () => void;
  onEdit: (row: LineDiscountRow) => void;
}

interface TableToolbarProps {
  table: Table<LineDiscountRow>;
}

export function TableToolbar({ table }: TableToolbarProps) {
  const meta = table.options.meta as LineDiscountTableMeta;
  const isFiltered = table.getState().columnFilters.length > 0;

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex flex-1 items-center gap-2">
        <Input
          placeholder="Search code..."
          value={(table.getColumn("line_discount")?.getFilterValue() as string) ?? ""}
          onChange={(event) => table.getColumn("line_discount")?.setFilterValue(event.target.value)}
          className="h-9 w-72"
        />

        {isFiltered && (
          <Button variant="ghost" onClick={() => table.resetColumnFilters()} className="h-9 px-2 lg:px-3">
            Reset
            <X className="ml-2 h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button className="h-9" onClick={() => meta?.onCreate?.()}>
          <Plus className="mr-2 h-4 w-4" />
          New
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-9">
              <Settings2 className="mr-2 h-4 w-4" />
              <span className="hidden lg:inline">View</span>
              <span className="lg:hidden">Columns</span>
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-56">
            {table
              .getAllColumns()
              .filter((column) => typeof column.accessorFn !== "undefined" && column.getCanHide())
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
                    {String(label).replace(/_/g, " ")}
                  </DropdownMenuCheckboxItem>
                );
              })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
