"use client";

import * as React from "react";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CardHeader } from "@/components/ui/card";
import { CardTitle } from "@/components/ui/card";
import { CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { SortingState } from "@tanstack/react-table";

import { useDiscountTypes } from "./hooks/useDiscountTypes";
import { columns } from "./components/data-table/columns";
import { DiscountTypeDataTable } from "./components/data-table";
import { DiscountTypeTableSkeleton } from "./components/data-table/skeleton-loader";
import DiscountTypeDialog from "./components/DiscountTypeDialog";
import { DiscountTypeRow } from "./type";

const DiscountTypeTable = DiscountTypeDataTable;

export default function DiscountTypeModule() {
  const dt = useDiscountTypes();
  const [sorting, setSorting] = React.useState<SortingState>([]);

  const hasActiveFilters = dt.search || sorting.length > 0;

  return (
    <div className="space-y-4">
      {/* ✅ Header card (matches Line Discounts style) */}
      <div className="flex items-start justify-between gap-4">
        <Card className="flex-1 rounded-2xl">
          <CardHeader className="space-y-2">
            <CardTitle className="text-lg font-semibold">Discount Types</CardTitle>
            <CardDescription>
              Create sequential bundles of line discounts (order matters) and store the computed total percent.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      {/* ✅ Table */}
      <Card className="p-4 rounded-2xl">
        {/* ✅ tighter, aligned toolbar spacing */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pb-3">
          {/* keep the search reasonably sized so it doesn't leave a huge empty gap */}
          <div className="flex flex-1 flex-wrap items-center gap-2 max-w-[480px]">
            <div className="w-full sm:w-[320px]">
              <Input
                placeholder="Search discount type..."
                value={dt.search}
                onChange={(e) => dt.setSearch(e.target.value)}
              />
            </div>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                onClick={() => {
                  dt.setSearch("");
                  setSorting([]);
                }}
                className="h-9 px-3 text-muted-foreground hover:text-foreground gap-1.5 shrink-0"
              >
                <X className="h-4 w-4" />
                Clear Filters
              </Button>
            )}
          </div>

          <div className="flex items-center justify-end sm:justify-start">
            <Button onClick={dt.onCreate} className="gap-2">
              <Plus className="h-4 w-4" />
              Add Discount Type
            </Button>
          </div>
        </div>

        {dt.loading ? (
          <DiscountTypeTableSkeleton />
        ) : (
          <DiscountTypeTable
            columns={columns}
            data={dt.filteredRows}
            columnFilters={[]}
            sorting={sorting}
            onSortingChange={setSorting}
            // ✅ row click => VIEW ONLY (no edit/delete)
            tableMeta={{
              onView: (row: Record<string, unknown>) => {
                dt.onEdit(row as unknown as DiscountTypeRow);
              },
            }}
          />
        )}
      </Card>

      {/* ✅ Dialog: view/edit/create controlled by dt.mode */}
      <DiscountTypeDialog
        open={dt.open}
        onOpenChange={dt.setOpen}
        editing={dt.editing}
        lineDiscounts={dt.lines}
        mode={dt.editing ? "view" : "create"} // simplified logic for now
        onSave={dt.save} // Dialog handles mode if it's "view"
        onDelete={dt.remove}
      />
    </div>
  );
}
